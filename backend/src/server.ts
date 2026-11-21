import { join } from 'node:path';

import { createApp } from './app';
import { SessionStore } from './auth/sessions';
import { githubStore, localStore } from './bookmarks/store';
import { APP_VERSION, loadConfig } from './config';
import { scrapeMetadata } from './metadata';

const config = loadConfig();
const sessions = await SessionStore.open(
  join(config.dataDir, 'sessions.enc'),
  config.sessionKey
);
const store = config.localBookmarksFile
  ? localStore(config.localBookmarksFile)
  : githubStore(config);

const app = createApp({ config, sessions, store, scrape: scrapeMetadata });

const server = app.listen(config.port, config.host, () => {
  console.log(
    `the-compiler backend ${APP_VERSION} on http://${config.host}:${config.port} ` +
      (config.localBookmarksFile
        ? `(local file ${config.localBookmarksFile})`
        : `(repo ${config.repo.fullName})`)
  );
});

const shutdown = () => {
  server.close();
  void sessions.flush().then(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
