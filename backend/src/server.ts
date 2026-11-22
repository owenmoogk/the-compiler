import { join } from 'node:path';

import { createApp } from './app';
import { createSessionTools } from './auth/middleware';
import { SessionStore } from './auth/sessions';
import { localStore, normalizeStoredTags } from './bookmarks/store';
import { APP_VERSION, loadConfig } from './config';
import { scrapeMetadata } from './metadata';

const config = loadConfig();
const sessions = await SessionStore.open(
  join(config.dataDir, 'sessions.enc'),
  config.sessionKey
);
const tools = createSessionTools(config, sessions);

// bookmarks.json on this server is the only copy; the data dir is backed up to
// the NAS nightly (homelab repo). It starts empty if the file is missing.
const store = localStore(config.bookmarksFile);
const tagFix = await normalizeStoredTags(store);
if (tagFix) console.log(tagFix);

const app = createApp({
  config,
  sessions,
  tools,
  store,
  scrape: scrapeMetadata,
});

const server = app.listen(config.port, config.host, () => {
  console.log(
    `the-compiler backend ${APP_VERSION} on http://${config.host}:${String(config.port)} ` +
      `(file ${config.bookmarksFile})`
  );
});

const shutdown = () => {
  server.close();
  void sessions.flush().then(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
