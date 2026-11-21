import { join } from 'node:path';

import { createApp } from './app';
import { createSessionTools } from './auth/middleware';
import { SessionStore } from './auth/sessions';
import {
  githubStore,
  localStore,
  normalizeStoredTags,
} from './bookmarks/store';
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
// dev the file starts as a copy of the public GitHub one and is never pushed.
const store = localStore(config.bookmarksFile);
const remote = githubStore(config);
await seedLocalCopy(store, remote);

const sync = await createSync({
  local: store,
  remote,
  stateFile: join(config.dataDir, 'sync-state.json'),
  sessions,
  tools,
  hour: config.syncHour,
  pushes: config.syncToGithub,
});
const tagFix = await normalizeStoredTags(store);
if (tagFix) {
  sync.record(tagFix);
  console.log(tagFix);
}
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
      `(file ${config.bookmarksFile}, ` +
      (config.syncToGithub
        ? `pushes to ${config.repo.fullName} daily at ${String(config.syncHour)}:00)`
        : `never pushed to GitHub)`)
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
