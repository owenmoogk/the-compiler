import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { Config } from '../config';
import { HttpError, parseCookies } from '../http';
import { refreshTokens } from './github';
import type { Session, SessionStore } from './sessions';

export function sessionCookieName(config: Config): string {
  // __Host- pins the cookie to this exact host over HTTPS.
  return config.secureCookies ? '__Host-sid' : 'sid';
}

export function cors(config: Config): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin === config.frontendOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, PATCH, DELETE'
      );
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
      res.status(204).end();
      return;
    }
    next();
  };
}

/**
 * CSRF guard. The session cookie is SameSite=Lax, which other *.owenmoogk.com
 * subdomains count as same-site, so state-changing requests must also come
 * from the frontend's exact origin.
 */
export function requireFrontendOrigin(config: Config): RequestHandler {
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }
    if (req.headers.origin !== config.frontendOrigin) {
      next(new HttpError(403, 'Bad origin'));
      return;
    }
    next();
  };
}

const REFRESH_MARGIN = 5 * 60 * 1000;

export type SessionTools = ReturnType<typeof createSessionTools>;

export function createSessionTools(config: Config, sessions: SessionStore) {
  const cookieName = sessionCookieName(config);
  // Refresh tokens are single-use: concurrent requests share one refresh.
  const refreshing = new Map<string, Promise<Session | undefined>>();

  async function refresh(session: Session): Promise<Session | undefined> {
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

  /** The caller's session with a usable access token, or undefined. */
  async function load(req: Request): Promise<Session | undefined> {
    const session = sessions.get(parseCookies(req)[cookieName]);
    if (!session) return undefined;
    if (
      session.accessExpiresAt &&
      session.accessExpiresAt - REFRESH_MARGIN < Date.now()
    ) {
      return refresh(session);
    }
    return session;
  }

  function setCookie(res: Response, session: Session, maxAge: number) {
    res.cookie(cookieName, session.id, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'lax',
      path: '/',
      maxAge,
    });
  }

  function clearCookie(res: Response) {
    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'lax',
      path: '/',
    });
  }

  /** Puts the session (if any) on res.locals.session. */
  const optional: RequestHandler = async (req, res, next) => {
    res.locals.session = await load(req);
    next();
  };

  const required: RequestHandler = async (req, res, next) => {
    const session = await load(req);
    if (!session) {
      clearCookie(res);
      next(new HttpError(401, 'Sign in first'));
      return;
    }
    res.locals.session = session;
    next();
  };

  return { load, setCookie, clearCookie, optional, required };
}

export function currentSession(res: Response): Session | undefined {
  return res.locals.session as Session | undefined;
}

export function mustSession(res: Response): Session {
  const session = currentSession(res);
  if (!session) throw new HttpError(401, 'Sign in first');
  return session;
}

export type Handler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void> | void;
