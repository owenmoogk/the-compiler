import type { Me } from '@compiler/shared';
import { Router } from 'express';
import { randomBytes } from 'node:crypto';

import type { Config } from '../config';
import { HttpError, parseCookies } from '../http';
import {
  authorizeUrl,
  exchangeCode,
  fetchCanEdit,
  fetchUser,
  revokeToken,
} from './github';
import type { SessionTools } from './middleware';
import { mustSession } from './middleware';
import type { Session, SessionStore } from './sessions';
import { sessionExpiresAt } from './sessions';

const STATE_COOKIE = 'oauth_state';
const STATE_TTL = 10 * 60 * 1000;
const CAN_EDIT_TTL = 10 * 60 * 1000;
export const LOCAL_TOKEN = 'local-dev-token';

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
    canEdit: session.canEdit,
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
        canEdit: true,
        canEditCheckedAt: Date.now(),
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
    const canEdit = await fetchCanEdit(
      tokens.accessToken,
      config.repo.fullName
    );
    const session = sessions.create({
      ...tokens,
      githubId: user.id,
      login: user.login,
      name: user.name ?? undefined,
      avatarUrl: user.avatar_url,
      canEdit,
      canEditCheckedAt: Date.now(),
    });
    tools.setCookie(res, session, sessionExpiresAt(session) - Date.now());
    console.log(`Signed in: ${user.login} (canEdit=${String(canEdit)})`);
    res.redirect(entry.returnTo);
  });

  router.get('/me', tools.optional, async (_req, res) => {
    const session = res.locals.session as Session | undefined;
    if (!session) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }
    let current = session;
    if (
      session.accessToken !== LOCAL_TOKEN &&
      Date.now() - session.canEditCheckedAt > CAN_EDIT_TTL
    ) {
      const canEdit = await fetchCanEdit(
        session.accessToken,
        config.repo.fullName
      );
      current =
        sessions.update(session.id, {
          canEdit,
          canEditCheckedAt: Date.now(),
        }) ?? session;
    }
    res.json(toMe(current));
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
