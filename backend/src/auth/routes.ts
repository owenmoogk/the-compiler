import type { Me } from '@compiler/shared';
import { Router } from 'express';
import { randomBytes } from 'node:crypto';

import type { Config } from '../config';
import { HttpError, parseCookies } from '../http';
import { authorizeUrl, exchangeCode, fetchUser, revokeToken } from './github';
import type { SessionTools } from './middleware';
import { LOCAL_TOKEN, canEdit, mustSession } from './middleware';
import type { Session, SessionStore } from './sessions';
import { sessionExpiresAt } from './sessions';

const STATE_COOKIE = 'oauth_state';
const STATE_TTL = 10 * 60 * 1000;

export function authRouter(
  config: Config,
  sessions: SessionStore,
  tools: SessionTools
): Router {
  const router = Router();
  const pending = new Map<string, { returnTo: string; expires: number }>();

  const safeReturnTo = (value: unknown) =>
    typeof value === 'string' && value.startsWith(config.frontendUrl)
      ? value
      : config.frontendUrl;

  const toMe = (session: Session): Me => ({
    login: session.login,
    name: session.name,
    avatarUrl: session.avatarUrl,
    canEdit: canEdit(config, session),
  });

  router.get('/login', (req, res) => {
    const returnTo = safeReturnTo(req.query.returnTo);
    if (config.devLogin) {
      const session = sessions.create({
        githubId: 0,
        login: 'local-dev',
        name: 'Local dev',
        avatarUrl: '',
        accessToken: LOCAL_TOKEN,
      });
      tools.setCookie(res, session, sessionExpiresAt(session) - Date.now());
      res.redirect(returnTo);
      return;
    }

    const now = Date.now();
    for (const [key, value] of pending) {
      if (value.expires < now) pending.delete(key);
    }
    const state = randomBytes(16).toString('hex');
    pending.set(state, { returnTo, expires: now + STATE_TTL });
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'lax',
      path: '/auth',
      maxAge: STATE_TTL,
    });
    res.redirect(authorizeUrl(config, state));
  });

  router.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    const cookieState = parseCookies(req)[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: '/auth' });

    const entry = typeof state === 'string' ? pending.get(state) : undefined;
    if (typeof state === 'string') pending.delete(state);
    if (!entry || state !== cookieState || entry.expires < Date.now()) {
      throw new HttpError(
        400,
        'Sign-in expired or was tampered with, try again'
      );
    }
    if (typeof code !== 'string') {
      // The user cancelled on GitHub.
      res.redirect(entry.returnTo);
      return;
    }

    const tokens = await exchangeCode(config, code);
    const user = await fetchUser(tokens.accessToken);
    const session = sessions.create({
      ...tokens,
      githubId: user.id,
      login: user.login,
      name: user.name ?? undefined,
      avatarUrl: user.avatar_url,
    });
    tools.setCookie(res, session, sessionExpiresAt(session) - Date.now());
    console.log(
      `Signed in: ${user.login} (canEdit=${String(canEdit(config, session))})`
    );
    res.redirect(entry.returnTo);
  });

  router.get('/me', tools.optional, (_req, res) => {
    const session = res.locals.session as Session | undefined;
    if (!session) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }
    res.json(toMe(session));
  });

  router.post('/logout', tools.required, async (_req, res) => {
    const session = mustSession(res);
    sessions.delete(session.id);
    tools.clearCookie(res);
    if (session.accessToken !== LOCAL_TOKEN) {
      await revokeToken(config, session.accessToken);
    }
    res.status(204).end();
  });

  return router;
}
