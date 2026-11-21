import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

import type { SessionTools } from '../auth/middleware';
import type { SessionStore } from '../auth/sessions';
import type { BookmarkStore } from './store';
import { ConflictError } from './store';

const stateSchema = z.object({
  /** Commit messages of changes not yet pushed to GitHub, oldest first. */
  pending: z.array(z.string()),
  lastPushedAt: z.string().optional(),
  /** sha of the file we last pushed; anything else on GitHub was edited there. */
  lastPushedSha: z.string().optional(),
});
type SyncState = z.infer<typeof stateSchema>;

const RETRY_MS = 60 * 60 * 1000;

export type SyncResult =
  | { status: 'pushed'; changes: number }
  | { status: 'nothing-to-push' }
  | { status: 'no-editor' }
  | { status: 'disabled' };

/**
 * The server's copy of bookmarks.json is the source of truth. Edits are saved
 * to it instantly and listed in a pending log; once a day the file is pushed
 * to GitHub as one commit, using the newest signed-in editor's token.
 */
export async function createSync(deps: {
  local: BookmarkStore;
  remote: BookmarkStore;
  stateFile: string;
  sessions: SessionStore;
  tools: SessionTools;
  /** Local hour of day (0-23) to push at. */
  hour: number;
  /** False in local dev: edits stay in the local file and are never pushed. */
  pushes: boolean;
}) {
  const { local, remote, stateFile, sessions, tools, hour, pushes } = deps;

  let state: SyncState = { pending: [] };
  try {
    state = stateSchema.parse(JSON.parse(await readFile(stateFile, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  let saving: Promise<void> = Promise.resolve();
  const save = async () => {
    const text = `${JSON.stringify(state, null, 2)}\n`;
    saving = saving.then(async () => {
      await mkdir(dirname(stateFile), { recursive: true });
      await writeFile(`${stateFile}.tmp`, text);
      await rename(`${stateFile}.tmp`, stateFile);
    });
    await saving;
  };

  /** A token that can push: the newest editor session that is still valid. */
  async function editorToken(): Promise<string | undefined> {
    for (const session of sessions.list()) {
      if (!session.canEdit) continue;
      const usable = await tools.fresh(session);
      if (usable) return usable.accessToken;
    }
    return undefined;
  }

  let running: Promise<SyncResult> | undefined;

  async function push(): Promise<SyncResult> {
    if (!pushes) return { status: 'disabled' };
    const count = state.pending.length;
    if (count === 0) return { status: 'nothing-to-push' };
    const token = await editorToken();
    if (!token) return { status: 'no-editor' };

    const changes = state.pending.slice(0, count);
    const message =
      count === 1
        ? (changes[0] ?? '')
        : `Sync ${String(count)} changes\n\n${changes.map((m) => `- ${m}`).join('\n')}`;
    const { file } = await local.read();

    for (let attempt = 0; ; attempt++) {
      const current = await remote.read(token);
      if (
        state.lastPushedSha &&
        current.sha &&
        current.sha !== state.lastPushedSha
      ) {
        console.warn(
          'bookmarks.json was edited on GitHub since the last sync; overwriting it with the server copy'
        );
      }
      try {
        const sha = await remote.write(token, file, current.sha, message);
        state = {
          pending: state.pending.slice(count),
          lastPushedAt: new Date().toISOString(),
          lastPushedSha: sha,
        };
        await save();
        return { status: 'pushed', changes: count };
      } catch (error) {
        if (error instanceof ConflictError && attempt < 2) continue;
        throw error;
      }
    }
  }

  /** Pushes now (one push at a time). */
  async function syncNow(): Promise<SyncResult> {
    running ??= push().finally(() => {
      running = undefined;
    });
    return running;
  }

  let timer: NodeJS.Timeout | undefined;
  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(), ms);
    timer.unref();
  };
  const msUntilNext = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  };
  async function run() {
    try {
      const result = await syncNow();
      if (result.status === 'pushed') {
        console.log(`Synced ${String(result.changes)} change(s) to GitHub`);
      } else if (result.status === 'no-editor') {
        console.warn(
          'Daily sync skipped: no signed-in editor. Sign in on the site so changes can be pushed.'
        );
        schedule(RETRY_MS);
        return;
      }
      schedule(msUntilNext());
    } catch (error) {
      console.error('Daily sync failed, retrying in an hour:', error);
      schedule(RETRY_MS);
    }
  }

  return {
    /** Records a saved change so the next sync pushes it. */
    record(message: string) {
      if (!pushes) return;
      state.pending.push(message);
      void save().catch((error: unknown) => {
        console.error('Could not save sync state:', error);
      });
    },
    status() {
      return {
        pending: state.pending.length,
        lastPushedAt: state.lastPushedAt,
      };
    },
    syncNow,
    start() {
      if (pushes) schedule(msUntilNext());
    },
    async flush() {
      await saving;
    },
  };
}

export type Sync = Awaited<ReturnType<typeof createSync>>;

/** Copies the GitHub file to the server the first time it starts. */
export async function seedLocalCopy(
  local: BookmarkStore,
  remote: BookmarkStore
): Promise<void> {
  const { sha } = await local.read();
  if (sha !== null) return;
  const { file } = await remote.read();
  await local.write('', file, null, 'Seed from GitHub');
  console.log(
    `Seeded the server copy from GitHub (${String(file.bookmarks.length)} links)`
  );
}
