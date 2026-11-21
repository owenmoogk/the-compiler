import { join } from 'node:path';

import { createApp } from './app';
import { createSessionTools } from './auth/middleware';
import { SessionStore } from './auth/sessions';
import { githubStore, localStore } from './bookmarks/store';
import { createSync, seedLocalCopy } from './bookmarks/sync';
import { APP_VERSION, loadConfig } from './config';
import { scrapeMetadata } from './metadata';

const config = loadConfig();
const sessions = await SessionStore.open(
  join(config.dataDir, 'sessions.enc'),
  config.sessionKey
);
const tools = createSessionTools(config, sessions);

// Edits go to the file on this server; GitHub gets a copy once a day. In local
// dev without a GitHub App, a second local file stands in for the repo.
const store = localStore(config.bookmarksFile);
const remote = config.syncToGithub
  ? githubStore(config)
  : localStore(join(config.dataDir, 'github-stand-in.json'));
await seedLocalCopy(store, remote);

const sync = await createSync({
  local: store,
  remote,
  stateFile: join(config.dataDir, 'sync-state.json'),
  sessions,
  tools,
  hour: config.syncHour,
});
sync.start();

const app = createApp({
  config,
  sessions,
  tools,
  store,
  sync,
  scrape: scrapeMetadata,
});

const server = app.listen(config.port, config.host, () => {
  console.log(
    `the-compiler backend ${APP_VERSION} on http://${config.host}:${config.port} ` +
      `(file ${config.bookmarksFile}, pushes to ` +
      `${config.syncToGithub ? config.repo.fullName : 'a local stand-in'} daily at ${String(config.syncHour)}:00)`
  );
});

const shutdown = () => {
  server.close();
  void Promise.all([sessions.flush(), sync.flush()]).then(() =>
    process.exit(0)
  );
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
