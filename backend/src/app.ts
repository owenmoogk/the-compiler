import type { BookmarkMeta } from '@compiler/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';

import type { SessionTools } from './auth/middleware';
import { authRoutes } from './auth/routes';
import type { SessionStore } from './auth/sessions';
import { bookmarkRoutes } from './bookmarks/routes';
import type { BookmarkStore } from './bookmarks/store';
import { createMutator } from './bookmarks/store';
import type { Config } from './config';
import { APP_VERSION } from './config';
import { errorHandler } from './http';

export function createApp(deps: {
  config: Config;
  sessions: SessionStore;
  tools: SessionTools;
  store: BookmarkStore;
  scrape: (url: string) => Promise<BookmarkMeta>;
}) {
  const { config, sessions, tools, store, scrape } = deps;
  const mutate = createMutator(store);

  return (
    new Hono()
      .get('/healthz', (c) => c.json({ ok: true, version: APP_VERSION }))
      // The frontend (owenmoogk.com) and API (compiler.) are different origins,
      // and requests carry the session cookie, so the origin must be named.
      .use(cors({ origin: config.frontendOrigin, credentials: true }))
      // Rejects form posts from other sites (they'd carry the cookie too).
      .use(csrf({ origin: config.frontendOrigin }))
      .route('/auth', authRoutes(config, sessions, tools))
      .route('/api', bookmarkRoutes({ store, mutate, scrape, tools }))
      .notFound((c) => c.json({ error: 'Not found' }, 404))
      .onError(errorHandler)
  );
}

/** The full API's type, for a typed client (`hc<AppType>` from 'hono/client'). */
export type AppType = ReturnType<typeof createApp>;
