import type { BookmarksFile } from '@compiler/shared';
import { bookmarksFileSchema, emptyBookmarksFile } from '@compiler/shared';
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
  write(
    token: string,
    file: BookmarksFile,
    sha: string | null,
    message: string
  ): Promise<void>;
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
        await githubApi(token, contentsPath, {
          method: 'PUT',
          body: JSON.stringify({
            message,
            branch,
            content: Buffer.from(serialize(file)).toString('base64'),
            ...(sha ? { sha } : {}),
          }),
        });
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
      await mkdir(dirname(path), { recursive: true });
      await writeFile(`${path}.tmp`, serialize(file));
      await rename(`${path}.tmp`, path);
      console.log(`[local commit] ${message}`);
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
 */
export function createMutator(store: BookmarkStore) {
  let queue: Promise<unknown> = Promise.resolve();

  return async function mutate<T>(
    token: string,
    change: (file: BookmarksFile) => Change<T>
  ): Promise<{ file: BookmarksFile; result: T }> {
    const run = async () => {
      for (let attempt = 0; ; attempt++) {
        const { file, sha } = await store.read(token);
        const out = change(structuredClone(file));
        const next = bookmarksFileSchema.parse(out.file);
        try {
          await store.write(token, next, sha, truncate(out.message, 72));
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
