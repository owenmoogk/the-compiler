import type { Bookmark, BookmarkMeta } from '@compiler/shared';
import {
  bookmarkCreateSchema,
  bookmarkPatchSchema,
  displayTitle,
  metadataRequestSchema,
  refreshManySchema,
  renameTagIn,
  renameTagSchema,
  sameUrl,
  tagSchema,
} from '@compiler/shared';
import { Router } from 'express';
import { nanoid } from 'nanoid';

import type { SessionTools } from '../auth/middleware';
import { currentSession, mustSession } from '../auth/middleware';
import { HttpError, mapLimit } from '../http';
import type { BookmarkStore, Mutate } from './store';

type Scrape = (url: string) => Promise<BookmarkMeta>;

function findIndex(bookmarks: Bookmark[], id: string): number {
  const index = bookmarks.findIndex((b) => b.id === id);
  if (index < 0) throw new HttpError(404, 'Bookmark not found');
  return index;
}

function assertNoDuplicate(
  bookmarks: Bookmark[],
  url: string,
  exceptId?: string
) {
  const existing = bookmarks.find(
    (b) => b.id !== exceptId && sameUrl(b.url, url)
  );
  if (existing) {
    throw new HttpError(409, `Already saved as "${displayTitle(existing)}"`);
  }
}

/**
 * A refresh that fails (rate limit, site down) must not wipe metadata that was
 * fetched fine before: keep the old fields and just record the error.
 */
function refreshedMeta(
  old: BookmarkMeta | undefined,
  fresh: BookmarkMeta
): BookmarkMeta {
  if (fresh.title || !old?.title) return fresh;
  return { ...old, error: fresh.error };
}

export function bookmarksRouter(deps: {
  store: BookmarkStore;
  mutate: Mutate;
  scrape: Scrape;
  tools: SessionTools;
}): Router {
  const { store, mutate, scrape, tools } = deps;
  const router = Router();

  router.get('/bookmarks', tools.optional, async (_req, res) => {
    const token = currentSession(res)?.accessToken;
    const { file } = await store.read(token);
    res.setHeader('Cache-Control', 'no-store');
    res.json(file);
  });

  router.post('/metadata', tools.required, async (req, res) => {
    const { url } = metadataRequestSchema.parse(req.body);
    res.json(await scrape(url));
  });

  router.post('/bookmarks', tools.required, async (req, res) => {
    const session = mustSession(res);
    const input = bookmarkCreateSchema.parse(req.body);

    const before = await store.read(session.accessToken);
    assertNoDuplicate(before.file.bookmarks, input.url);
    const meta = input.meta ?? (await scrape(input.url));

    const { file, result } = await mutate(session.accessToken, (current) => {
      assertNoDuplicate(current.bookmarks, input.url);
      const bookmark: Bookmark = {
        id: nanoid(10),
        url: input.url,
        title: input.title,
        notes: input.notes,
        tags: input.tags,
        addedAt: new Date().toISOString(),
        meta,
      };
      current.bookmarks.push(bookmark);
      return {
        file: current,
        message: `Add: ${displayTitle(bookmark)}`,
        result: bookmark,
      };
    });
    res.status(201).json({ file, bookmark: result });
  });

  router.patch('/bookmarks/:id', tools.required, async (req, res) => {
    const session = mustSession(res);
    const id = req.params.id as string;
    const patch = bookmarkPatchSchema.parse(req.body);

    // A new URL means new metadata; scrape before taking the write lock.
    let meta: BookmarkMeta | undefined;
    if (patch.url) {
      const { file } = await store.read(session.accessToken);
      const existing = file.bookmarks[findIndex(file.bookmarks, id)];
      if (!sameUrl(existing.url, patch.url)) {
        assertNoDuplicate(file.bookmarks, patch.url, id);
        meta = await scrape(patch.url);
      }
    }

    const { file, result } = await mutate(session.accessToken, (current) => {
      const index = findIndex(current.bookmarks, id);
      const old = current.bookmarks[index];
      if (patch.url) assertNoDuplicate(current.bookmarks, patch.url, id);
      const next: Bookmark = {
        ...old,
        url: patch.url ?? old.url,
        tags: patch.tags ?? old.tags,
        title: patch.title === null ? undefined : (patch.title ?? old.title),
        notes: patch.notes === null ? undefined : (patch.notes ?? old.notes),
        meta: meta ?? old.meta,
      };
      current.bookmarks[index] = next;
      return {
        file: current,
        message: `Edit: ${displayTitle(next)}`,
        result: next,
      };
    });
    res.json({ file, bookmark: result });
  });

  router.delete('/bookmarks/:id', tools.required, async (req, res) => {
    const session = mustSession(res);
    const id = req.params.id as string;
    const { file } = await mutate(session.accessToken, (current) => {
      const index = findIndex(current.bookmarks, id);
      const [removed] = current.bookmarks.splice(index, 1);
      return {
        file: current,
        message: `Delete: ${displayTitle(removed)}`,
        result: null,
      };
    });
    res.json({ file });
  });

  router.post('/bookmarks/:id/refresh', tools.required, async (req, res) => {
    const session = mustSession(res);
    const id = req.params.id as string;
    const before = await store.read(session.accessToken);
    const target = before.file.bookmarks[findIndex(before.file.bookmarks, id)];
    const meta = await scrape(target.url);

    const { file, result } = await mutate(session.accessToken, (current) => {
      const index = findIndex(current.bookmarks, id);
      const old = current.bookmarks[index];
      const next = { ...old, meta: refreshedMeta(old.meta, meta) };
      current.bookmarks[index] = next;
      return {
        file: current,
        message: `Refresh: ${displayTitle(next)}`,
        result: next,
      };
    });
    res.json({ file, bookmark: result });
  });

  /** Re-scrapes many (default: all) bookmarks, saved as one commit. */
  router.post('/bookmarks/refresh', tools.required, async (req, res) => {
    const session = mustSession(res);
    const { ids } = refreshManySchema.parse(req.body ?? {});
    const before = await store.read(session.accessToken);
    const targets = before.file.bookmarks.filter(
      (b) => !ids || ids.includes(b.id)
    );
    const metas = new Map<string, BookmarkMeta>();
    await mapLimit(targets, 4, async (b) => {
      metas.set(b.id, await scrape(b.url));
    });

    const { file } = await mutate(session.accessToken, (current) => {
      current.bookmarks = current.bookmarks.map((b) => {
        const meta = metas.get(b.id);
        return meta ? { ...b, meta: refreshedMeta(b.meta, meta) } : b;
      });
      return {
        file: current,
        message: `Refresh metadata for ${metas.size} bookmarks`,
        result: null,
      };
    });
    res.json({ file, refreshed: metas.size });
  });

  /** Renames a tag everywhere; renaming onto an existing tag merges them. */
  router.put('/tags/:tag', tools.required, async (req, res) => {
    const session = mustSession(res);
    const from = tagSchema.parse(req.params.tag);
    const { to } = renameTagSchema.parse(req.body);
    const { file } = await mutate(session.accessToken, (current) => {
      if (!current.bookmarks.some((b) => b.tags.includes(from))) {
        throw new HttpError(404, `No bookmarks are tagged "${from}"`);
      }
      current.bookmarks = renameTagIn(current.bookmarks, from, to);
      return {
        file: current,
        message: `Rename tag: ${from} → ${to}`,
        result: null,
      };
    });
    res.json({ file });
  });

  return router;
}
