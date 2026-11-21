import type { BookmarksFile } from '@compiler/shared';
import {
  bookmarksFileSchema,
  emptyBookmarksFile,
  normalizeTags,
} from '@compiler/shared';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { githubApi } from '../auth/github';
import type { Config } from '../config';
import { GithubError, HttpError } from '../http';

export type Snapshot = { file: BookmarksFile; sha: string | null };

/** Thrown when the file changed between our read and our write. */
export class ConflictError extends Error {}

export type BookmarkStore = {
  read(token?: string): Promise<Snapshot>;
  /** Commits the file and resolves to its new sha. */
  write(
    token: string,
    file: BookmarksFile,
    sha: string | null,
    message: string
  ): Promise<string>;
};

function serialize(file: BookmarksFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

function parseFile(text: string): BookmarksFile {
  const result = bookmarksFileSchema.safeParse(JSON.parse(text));
  if (!result.success) {
    throw new HttpError(500, 'bookmarks.json in the repo is not valid');
  }
  return result.data;
}

/** The bookmarks file in a GitHub repo, read and written with the signed-in user's token. */
export function githubStore(config: Config): BookmarkStore {
  const { fullName, branch, path } = config.repo;
  const contentsPath = `/repos/${fullName}/contents/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

  return {
    async read(token) {
      let res: Response;
      try {
        res = await githubApi(
          token,
          `${contentsPath}?ref=${encodeURIComponent(branch)}`
        );
      } catch (error) {
        if (error instanceof GithubError && error.status === 404) {
          return { file: emptyBookmarksFile(), sha: null };
        }
        throw error;
      }
      const body = (await res.json()) as {
        sha: string;
        content?: string;
        size: number;
      };
      let text: string;
      if (body.content || body.size === 0) {
        text = Buffer.from(body.content ?? '', 'base64').toString('utf8');
      } else {
        // Files over 1 MB come back without inline content.
        const blob = await githubApi(
          token,
          `/repos/${fullName}/git/blobs/${body.sha}`,
          { headers: { Accept: 'application/vnd.github.raw+json' } }
        );
        text = await blob.text();
      }
      return {
        file: text.trim() ? parseFile(text) : emptyBookmarksFile(),
        sha: body.sha,
      };
    },

    async write(token, file, sha, message) {
      try {
        const res = await githubApi(token, contentsPath, {
          method: 'PUT',
          body: JSON.stringify({
            message,
            branch,
            content: Buffer.from(serialize(file)).toString('base64'),
            ...(sha ? { sha } : {}),
          }),
        });
        const body = (await res.json()) as { content: { sha: string } };
        return body.content.sha;
      } catch (error) {
        if (
          error instanceof GithubError &&
          (error.status === 409 || (error.status === 422 && !sha))
        ) {
          throw new ConflictError(error.message);
        }
        throw error;
      }
    },
  };
}

/** A JSON file on disk, for local development without GitHub. */
export function localStore(path: string): BookmarkStore {
  const hash = (text: string) => createHash('sha1').update(text).digest('hex');

  const readText = async () => {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  };

  return {
    async read() {
      const text = await readText();
      if (text === null) return { file: emptyBookmarksFile(), sha: null };
      return { file: parseFile(text), sha: hash(text) };
    },

    async write(_token, file, sha, message) {
      const current = await readText();
      if ((current === null ? null : hash(current)) !== sha) {
        throw new ConflictError('local file changed');
      }
      const text = serialize(file);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(`${path}.tmp`, text);
      await rename(`${path}.tmp`, path);
      console.log(`[local commit] ${message}`);
      return hash(text);
    },
  };
}

export type Change<T> = {
  file: BookmarksFile;
  message: string;
  result: T;
};

/**
 * Read, modify, commit. Writes are serialized in-process, and a commit that
 * loses a race (someone else committed in between) is retried on fresh data.
 * Do slow work (scraping) before calling this, not inside `change`.
 *
 * The file from the last commit is kept in memory so the next change can skip
 * re-reading it. If the repo changed some other way, the commit is rejected as
 * stale (wrong sha) and retried after a fresh read, so nothing is overwritten.
 */
export function createMutator(
  store: BookmarkStore,
  onCommit?: (message: string) => void
) {
  let queue: Promise<unknown> = Promise.resolve();
  let last: Snapshot | undefined;

  return async function mutate<T>(
    token: string,
    change: (file: BookmarksFile) => Change<T>
  ): Promise<{ file: BookmarksFile; result: T }> {
    const run = async () => {
      for (let attempt = 0; ; attempt++) {
        const cached = last;
        const { file, sha } = cached ?? (await store.read(token));
        let out: Change<T>;
        try {
          out = change(structuredClone(file));
        } catch (error) {
          // e.g. "not found" because the repo was edited elsewhere: re-check
          // against fresh data before reporting it.
          if (cached) {
            last = undefined;
            continue;
          }
          throw error;
        }
        const next = bookmarksFileSchema.parse(out.file);
        last = undefined;
        try {
          const newSha = await store.write(
            token,
            next,
            sha,
            truncate(out.message, 72)
          );
          last = { file: next, sha: newSha };
          onCommit?.(out.message);
          return { file: next, result: out.result };
        } catch (error) {
          if (error instanceof ConflictError && attempt < 2) continue;
          if (error instanceof ConflictError) {
            throw new HttpError(
              409,
              'The bookmarks file kept changing, try again'
            );
          }
          throw error;
        }
      }
    };
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  };
}

export type Mutate = ReturnType<typeof createMutator>;

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/**
 * Rewrites any tags not in the current form (e.g. old "web-development" →
 * "Web Development"). Run at startup; returns the commit message if anything
 * changed.
 */
export async function normalizeStoredTags(
  store: BookmarkStore
): Promise<string | undefined> {
  const { file, sha } = await store.read();
  let changed = 0;
  const bookmarks = file.bookmarks.map((bookmark) => {
    const tags = normalizeTags(bookmark.tags);
    if (tags.join('\n') === bookmark.tags.join('\n')) return bookmark;
    changed++;
    return { ...bookmark, tags };
  });
  if (!changed) return undefined;
  const message = `Convert tags to Title Case (${String(changed)} links)`;
  await store.write('', { ...file, bookmarks }, sha, message);
  return message;
}
