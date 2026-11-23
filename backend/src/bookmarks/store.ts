import type { BookmarksFile } from '@compiler/shared';
import {
  bookmarksFileSchema,
  emptyBookmarksFile,
  normalizeTags,
} from '@compiler/shared';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { HttpError } from '../http';

export type Snapshot = { file: BookmarksFile; sha: string | null };

/** Thrown when the file changed between our read and our write. */
export class ConflictError extends Error {}

export type BookmarkStore = {
  read(): Promise<Snapshot>;
  /** Saves the file if it still has `sha`, and resolves to its new sha. */
  write(
    file: BookmarksFile,
    sha: string | null,
    message: string
  ): Promise<string>;
};

function serialize(file: BookmarksFile) {
  return `${JSON.stringify(file, null, 2)}\n`;
}

function parseFile(text: string) {
  const result = bookmarksFileSchema.safeParse(JSON.parse(text));
  if (!result.success) {
    throw new HttpError(500, 'bookmarks.json on the server is not valid');
  }
  return result.data;
}

/** bookmarks.json on disk. `sha` is a hash of its text, to catch lost updates. */
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

    async write(file, sha, message) {
      const current = await readText();
      if ((current === null ? null : hash(current)) !== sha) {
        throw new ConflictError('local file changed');
      }
      const text = serialize(file);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(`${path}.tmp`, text);
      await rename(`${path}.tmp`, path);
      console.log(`[saved] ${message}`);
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
 * Read, modify, save. Writes are serialized in-process, and a save that
 * loses a race (the file changed in between) is retried on fresh data.
 * Do slow work (scraping) before calling this, not inside `change`.
 *
 * The file from the last save is kept in memory so the next change can skip
 * re-reading it. If the file changed some other way, the save is rejected as
 * stale (wrong sha) and retried after a fresh read, so nothing is overwritten.
 */
export function createMutator(store: BookmarkStore) {
  let queue: Promise<unknown> = Promise.resolve();
  let last: Snapshot | undefined;

  return async function mutate<T>(change: (file: BookmarksFile) => Change<T>) {
    const run = async () => {
      for (let attempt = 0; ; attempt++) {
        const cached = last;
        const { file, sha } = cached ?? (await store.read());
        let out: Change<T>;
        try {
          out = change(structuredClone(file));
        } catch (error) {
          // e.g. "not found" because the file was edited elsewhere: re-check
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
            next,
            sha,
            truncate(out.message, 72)
          );
          last = { file: next, sha: newSha };
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

function truncate(text: string, max: number) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/**
 * Rewrites any tags not in the current form (e.g. old "web-development" →
 * "Web Development"). Run at startup; returns the change message if anything
 * changed.
 */
export async function normalizeStoredTags(store: BookmarkStore) {
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
  await store.write({ ...file, bookmarks }, sha, message);
  return message;
}
