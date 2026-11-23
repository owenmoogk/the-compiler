import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type Session = {
  id: string;
  githubId: number;
  login: string;
  name?: string;
  avatarUrl: string;
  accessToken: string;
  /** ms epoch; undefined when the GitHub App does not expire tokens */
  accessExpiresAt?: number;
  refreshToken?: string;
  refreshExpiresAt?: number;
  createdAt: number;
};

/** Sessions without an expiring refresh token are dropped after this long. */
const MAX_SESSION_AGE = 180 * 24 * 60 * 60 * 1000;

function encrypt(key: Buffer, plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

function decrypt(key: Buffer, encoded: string) {
  const raw = Buffer.from(encoded, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([
    decipher.update(raw.subarray(28)),
    decipher.final(),
  ]).toString('utf8');
}

export function sessionExpiresAt(session: Session) {
  return session.refreshExpiresAt ?? session.createdAt + MAX_SESSION_AGE;
}

/**
 * In-memory sessions, persisted to one AES-256-GCM encrypted file so a restart
 * or deploy does not sign you out. GitHub tokens never reach the browser.
 */
export class SessionStore {
  private readonly sessions = new Map<string, Session>();
  private saving: Promise<void> = Promise.resolve();

  private constructor(
    private readonly file: string | null,
    private readonly key: Buffer
  ) {}

  static async open(file: string | null, key: Buffer) {
    const store = new SessionStore(file, key);
    if (file) {
      try {
        const encoded = await readFile(file, 'utf8');
        const list = JSON.parse(decrypt(key, encoded.trim())) as Session[];
        for (const session of list) store.sessions.set(session.id, session);
        store.prune();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.warn(
            'Could not read sessions file, starting with none:',
            error
          );
        }
      }
    }
    return store;
  }

  get(id: string | undefined) {
    if (!id) return undefined;
    const session = this.sessions.get(id);
    if (!session) return undefined;
    // constant-time compare on the id we were handed
    const a = Buffer.from(id);
    const b = Buffer.from(session.id);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
    if (sessionExpiresAt(session) < Date.now()) {
      this.delete(id);
      return undefined;
    }
    return session;
  }

  /** All live sessions, newest first. */
  list() {
    this.prune();
    return [...this.sessions.values()].sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }

  create(data: Omit<Session, 'id' | 'createdAt'>) {
    const session: Session = {
      ...data,
      id: randomBytes(32).toString('base64url'),
      createdAt: Date.now(),
    };
    this.sessions.set(session.id, session);
    this.save();
    return session;
  }

  update(id: string, patch: Partial<Omit<Session, 'id'>>) {
    const current = this.sessions.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    this.sessions.set(id, next);
    this.save();
    return next;
  }

  delete(id: string) {
    if (this.sessions.delete(id)) this.save();
  }

  /** Resolves once everything written so far is on disk. */
  async flush() {
    await this.saving;
  }

  private prune() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (sessionExpiresAt(session) < now) this.sessions.delete(id);
    }
  }

  private save() {
    const file = this.file;
    if (!file) return;
    this.saving = this.saving.then(async () => {
      try {
        this.prune();
        const encoded = encrypt(
          this.key,
          JSON.stringify([...this.sessions.values()])
        );
        await mkdir(dirname(file), { recursive: true });
        const tmp = `${file}.tmp`;
        await writeFile(tmp, encoded, { mode: 0o600 });
        await rename(tmp, file);
      } catch (error) {
        console.error('Could not save sessions:', error);
      }
    });
  }
}
