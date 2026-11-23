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
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import type { SessionTools } from '../auth/middleware';
import { HttpError, json, param } from '../http';
import type { BookmarkStore, Mutate } from './store';

type Scrape = (url: string) => Promise<BookmarkMeta>;

function findIndex(bookmarks: Bookmark[], id: string) {
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

export function bookmarkRoutes(deps: {
  store: BookmarkStore;
  mutate: Mutate;
  scrape: Scrape;
  tools: SessionTools;
}) {
  const { store, mutate, scrape, tools } = deps;

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

  return (
    new Hono()
      .get('/bookmarks', async (c) => {
        const { file } = await store.read();
        c.header('Cache-Control', 'no-store');
        return c.json(file);
      })

      .post(
        '/metadata',
        tools.editor,
        json(metadataRequestSchema),
        async (c) => {
          const { url } = c.req.valid('json');
          return c.json(await scrape(url));
        }
      )

      .post(
        '/bookmarks',
        tools.editor,
        json(bookmarkCreateSchema),
        async (c) => {
          const input = c.req.valid('json');

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
          return c.json({ file, bookmark: result }, 201);
        }
      )

      .patch(
        '/bookmarks/:id',
        tools.editor,
        json(bookmarkPatchSchema),
        async (c) => {
          const id = c.req.param('id');
          const patch = c.req.valid('json');

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
              title:
                patch.title === null ? undefined : (patch.title ?? old.title),
              notes:
                patch.notes === null ? undefined : (patch.notes ?? old.notes),
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
          return c.json({ file, bookmark: result.bookmark });
        }
      )

      .delete('/bookmarks/:id', tools.editor, async (c) => {
        const id = c.req.param('id');
        const { file } = await mutate((current) => {
          const index = findIndex(current.bookmarks, id);
          const [removed] = current.bookmarks.splice(index, 1);
          return {
            file: current,
            message: `Delete: ${displayTitle(removed)}`,
            result: null,
          };
        });
        return c.json({ file });
      })

      /** Deletes several links in one change (missing ids are ignored). */
      .post(
        '/bookmarks/delete',
        tools.editor,
        json(deleteManySchema),
        async (c) => {
          const { ids } = c.req.valid('json');
          const remove = new Set(ids);
          const { file, result } = await mutate((current) => {
            const removed = current.bookmarks.filter((b) => remove.has(b.id));
            if (!removed.length)
              throw new HttpError(404, 'Bookmarks not found');
            current.bookmarks = current.bookmarks.filter(
              (b) => !remove.has(b.id)
            );
            const message =
              removed.length === 1
                ? `Delete: ${displayTitle(removed[0])}`
                : `Delete ${String(removed.length)} links: ${removed.map(displayTitle).join(', ')}`;
            return { file: current, message, result: removed.length };
          });
          return c.json({ file, deleted: result });
        }
      )

      /** Renames a tag everywhere; renaming onto an existing tag merges them. */
      .put(
        '/tags/:tag',
        tools.editor,
        param(z.object({ tag: storedTagSchema })),
        json(renameTagSchema),
        async (c) => {
          const { tag: from } = c.req.valid('param');
          const { to } = c.req.valid('json');
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
          return c.json({ file });
        }
      )
  );
}
