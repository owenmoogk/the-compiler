import type { Bookmark, BookmarkMeta } from '@compiler/shared';
import {
  bookmarkCreateSchema,
  bookmarkPatchSchema,
  deleteManySchema,
  displayTitle,
  metadataRequestSchema,
  renameTagIn,
  renameTagSchema,
  sameUrl,
  storedTagSchema,
} from '@compiler/shared';
import { Router } from 'express';
import { nanoid } from 'nanoid';

import type { SessionTools } from '../auth/middleware';
import { HttpError } from '../http';
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

export function bookmarksRouter(deps: {
  store: BookmarkStore;
  mutate: Mutate;
  scrape: Scrape;
  tools: SessionTools;
}): Router {
  const { store, mutate, scrape, tools } = deps;
  const router = Router();

  /**
   * Fetches a link's title/favicon after the request has returned, then saves
   * them as a second save. Skipped if the link was deleted or its URL edited
   * in the meantime.
   */
  const fetchInfoLater = (id: string, url: string) => {
    void (async () => {
      try {
        const meta = await scrape(url);
        await mutate((current) => {
          const index = findIndex(current.bookmarks, id);
          const bookmark = current.bookmarks[index];
          if (bookmark.url !== url) {
            throw new HttpError(409, 'URL changed while fetching');
          }
          const next = { ...bookmark, meta };
          current.bookmarks[index] = next;
          return {
            file: current,
            message: `Fetch info: ${displayTitle(next)}`,
            result: null,
          };
        });
      } catch (error) {
        if (!(error instanceof HttpError)) {
          console.warn(`Background fetch failed for ${url}:`, error);
        }
      }
    })();
  };

  router.get('/bookmarks', async (_req, res) => {
    const { file } = await store.read();
    res.setHeader('Cache-Control', 'no-store');
    res.json(file);
  });

  router.post('/metadata', tools.editor, async (req, res) => {
    const { url } = metadataRequestSchema.parse(req.body);
    res.json(await scrape(url));
  });

  router.post('/bookmarks', tools.editor, async (req, res) => {
    const input = bookmarkCreateSchema.parse(req.body);

    // Saved right away; if the dialog's preview hadn't finished, the title and
    // favicon are fetched in the background.
    const { file, result } = await mutate((current) => {
      assertNoDuplicate(current.bookmarks, input.url);
      const bookmark: Bookmark = {
        id: nanoid(10),
        url: input.url,
        title: input.title,
        notes: input.notes,
        section: input.section,
        tags: input.tags,
        addedAt: new Date().toISOString(),
        meta: input.meta,
      };
      current.bookmarks.push(bookmark);
      return {
        file: current,
        message: `Add: ${displayTitle(bookmark)}`,
        result: bookmark,
      };
    });
    if (!result.meta) {
      fetchInfoLater(result.id, result.url);
    }
    res.status(201).json({ file, bookmark: result });
  });

  router.patch('/bookmarks/:id', tools.editor, async (req, res) => {
    const id = req.params.id as string;
    const patch = bookmarkPatchSchema.parse(req.body);

    const { file, result } = await mutate((current) => {
      const index = findIndex(current.bookmarks, id);
      const old = current.bookmarks[index];
      if (patch.url) assertNoDuplicate(current.bookmarks, patch.url, id);
      // A new URL drops the old title/favicon; new ones are fetched below.
      const urlChanged =
        patch.url !== undefined && !sameUrl(patch.url, old.url);
      const next: Bookmark = {
        ...old,
        url: patch.url ?? old.url,
        section: patch.section ?? old.section,
        tags: patch.tags ?? old.tags,
        title: patch.title === null ? undefined : (patch.title ?? old.title),
        notes: patch.notes === null ? undefined : (patch.notes ?? old.notes),
        meta: urlChanged ? undefined : old.meta,
      };
      current.bookmarks[index] = next;
      return {
        file: current,
        message: `Edit: ${displayTitle(next)}`,
        result: { bookmark: next, urlChanged },
      };
    });
    if (result.urlChanged) {
      fetchInfoLater(id, result.bookmark.url);
    }
    res.json({ file, bookmark: result.bookmark });
  });

  router.delete('/bookmarks/:id', tools.editor, async (req, res) => {
    const id = req.params.id as string;
    const { file } = await mutate((current) => {
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

  /** Deletes several links in one change (missing ids are ignored). */
  router.post('/bookmarks/delete', tools.editor, async (req, res) => {
    const { ids } = deleteManySchema.parse(req.body);
    const remove = new Set(ids);
    const { file, result } = await mutate((current) => {
      const removed = current.bookmarks.filter((b) => remove.has(b.id));
      if (!removed.length) throw new HttpError(404, 'Bookmarks not found');
      current.bookmarks = current.bookmarks.filter((b) => !remove.has(b.id));
      const message =
        removed.length === 1
          ? `Delete: ${displayTitle(removed[0])}`
          : `Delete ${String(removed.length)} links: ${removed.map(displayTitle).join(', ')}`;
      return { file: current, message, result: removed.length };
    });
    res.json({ file, deleted: result });
  });

  /** Renames a tag everywhere; renaming onto an existing tag merges them. */
  router.put('/tags/:tag', tools.editor, async (req, res) => {
    const from = storedTagSchema.parse(req.params.tag);
    const { to } = renameTagSchema.parse(req.body);
    const { file } = await mutate((current) => {
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
