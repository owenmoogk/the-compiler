import type { BookmarkMeta } from '@compiler/shared';
import express from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Request } from 'express';

import type { SessionTools } from './auth/middleware';
import { cors, requireFrontendOrigin } from './auth/middleware';
import { authRouter } from './auth/routes';
import type { SessionStore } from './auth/sessions';
import { bookmarksRouter } from './bookmarks/routes';
import type { BookmarkStore } from './bookmarks/store';
import { createMutator } from './bookmarks/store';
import type { Sync } from './bookmarks/sync';
import type { Config } from './config';
import { APP_VERSION } from './config';
import { errorHandler } from './http';

// Behind the Cloudflare Tunnel every request comes from localhost; rate-limit by the real client.
const clientKey = (req: Request) => {
  const header = req.headers['cf-connecting-ip'];
  const ip = (typeof header === 'string' ? header : undefined) ?? req.ip ?? '';
  return ipKeyGenerator(ip);
};

export function createApp(deps: {
  config: Config;
  sessions: SessionStore;
  tools: SessionTools;
  store: BookmarkStore;
  sync: Sync;
  scrape: (url: string) => Promise<BookmarkMeta>;
}) {
  const { config, sessions, tools, store, sync, scrape } = deps;
  const mutate = createMutator(store, (message) => {
    sync.record(message);
  });

  const app = express();
  app.disable('x-powered-by');

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, version: APP_VERSION });
  });

  app.use(cors(config));
  app.use(requireFrontendOrigin(config));
  app.use(express.json({ limit: '1mb' }));

  app.use(
    '/auth',
    rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, keyGenerator: clientKey }),
    authRouter(config, sessions, tools)
  );
  app.use(
    '/api/metadata',
    rateLimit({ windowMs: 60 * 1000, limit: 30, keyGenerator: clientKey })
  );
  app.use('/api', bookmarksRouter({ store, mutate, scrape, tools, sync }));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);
  return app;
}
