import type { Context } from 'hono';
import {
  deleteCookie,
  getCookie,
  setCookie as setHonoCookie,
} from 'hono/cookie';
import { createMiddleware } from 'hono/factory';

import type { Config } from '../config';
import { HttpError } from '../http';
import { refreshTokens } from './github';
import type { Session, SessionStore } from './sessions';

/** Access token of DEV_LOGIN sessions (no GitHub involved). */
export const LOCAL_TOKEN = 'local-dev-token';

/** Only the configured GitHub account (or the local dev login) can edit. */
export function canEdit(config: Config, session: Session) {
  return (
    session.githubId === config.editorGithubId ||
    (config.devLogin && session.accessToken === LOCAL_TOKEN)
  );
}

export function sessionCookieName(config: Config) {
  // __Host- pins the cookie to this exact host over HTTPS.
  return config.secureCookies ? '__Host-sid' : 'sid';
}

/** Set by tools.required / tools.editor; read with c.get('session'). */
export type SessionEnv = { Variables: { session: Session } };
/** Set by tools.optional. */
export type OptionalSessionEnv = {
  Variables: { session: Session | undefined };
};

const REFRESH_MARGIN = 5 * 60 * 1000;

export type SessionTools = ReturnType<typeof createSessionTools>;

export function createSessionTools(config: Config, sessions: SessionStore) {
  const cookieName = sessionCookieName(config);
  // Refresh tokens are single-use: concurrent requests share one refresh.
  const refreshing = new Map<string, Promise<Session | undefined>>();

  async function refresh(session: Session) {
    if (!session.refreshToken) return undefined;
    const pending = refreshing.get(session.id);
    if (pending) return pending;
    const task = (async () => {
      try {
        const tokens = await refreshTokens(config, session.refreshToken ?? '');
        return sessions.update(session.id, tokens);
      } catch (error) {
        console.warn(`Token refresh failed for ${session.login}:`, error);
        sessions.delete(session.id);
        return undefined;
      } finally {
        refreshing.delete(session.id);
      }
    })();
    refreshing.set(session.id, task);
    return task;
  }

  /** The session with a usable access token (refreshed if needed), or undefined. */
  async function fresh(session: Session) {
    if (
      session.accessExpiresAt &&
      session.accessExpiresAt - REFRESH_MARGIN < Date.now()
    ) {
      return refresh(session);
    }
    return session;
  }

  /** The caller's session with a usable access token, or undefined. */
  async function load(c: Context) {
    const session = sessions.get(getCookie(c, cookieName));
    return session ? fresh(session) : undefined;
  }

  function setCookie(c: Context, session: Session, maxAgeMs: number) {
    setHonoCookie(c, cookieName, session.id, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'Lax',
      path: '/',
      maxAge: Math.floor(maxAgeMs / 1000),
    });
  }

  function clearCookie(c: Context) {
    deleteCookie(c, cookieName, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'Lax',
      path: '/',
    });
  }

  const signInFirst = (c: Context) => {
    clearCookie(c);
    return c.json({ error: 'Sign in first' }, 401);
  };

  /** c.get('session') is the caller's session, or undefined. */
  const optional = createMiddleware<OptionalSessionEnv>(async (c, next) => {
    c.set('session', await load(c));
    await next();
  });

  /** Signed in; c.get('session') is their session. */
  const required = createMiddleware<SessionEnv>(async (c, next) => {
    const session = await load(c);
    if (!session) return signInFirst(c);
    c.set('session', session);
    await next();
  });

  /** Signed in as the editor account (see canEdit). */
  const editor = createMiddleware<SessionEnv>(async (c, next) => {
    const session = await load(c);
    if (!session) return signInFirst(c);
    if (!canEdit(config, session)) {
      throw new HttpError(403, "You don't have edit access");
    }
    c.set('session', session);
    await next();
  });

  return { load, fresh, setCookie, clearCookie, optional, required, editor };
}
