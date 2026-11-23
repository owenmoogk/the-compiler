import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { randomBytes } from 'node:crypto';

import type { Config } from '../config';
import { HttpError } from '../http';
import { authorizeUrl, exchangeCode, fetchUser, revokeToken } from './github';
import type { SessionTools } from './middleware';
import { LOCAL_TOKEN, canEdit } from './middleware';
import type { Session, SessionStore } from './sessions';
import { sessionExpiresAt } from './sessions';

const STATE_COOKIE = 'oauth_state';
const STATE_TTL = 10 * 60 * 1000;
/** /auth/login is public; this bounds the memory repeated hits can use. */
const MAX_PENDING = 1000;

export function authRoutes(
  config: Config,
  sessions: SessionStore,
  tools: SessionTools
) {
  const pending = new Map<string, { returnTo: string; expires: number }>();

  const safeReturnTo = (value: unknown) =>
    typeof value === 'string' && value.startsWith(config.frontendUrl)
      ? value
      : config.frontendUrl;

  const toMe = (session: Session) => ({
    login: session.login,
    name: session.name,
    avatarUrl: session.avatarUrl,
    canEdit: canEdit(config, session),
  });

  return new Hono()
    .get('/login', (c) => {
      const returnTo = safeReturnTo(c.req.query('returnTo'));
      if (config.devLogin) {
        const session = sessions.create({
          githubId: 0,
          login: 'local-dev',
          name: 'Local dev',
          avatarUrl: '',
          accessToken: LOCAL_TOKEN,
        });
        tools.setCookie(c, session, sessionExpiresAt(session) - Date.now());
        return c.redirect(returnTo);
      }

      const now = Date.now();
      for (const [key, value] of pending) {
        if (value.expires < now) pending.delete(key);
      }
      // Maps keep insertion order, so this drops the oldest sign-in attempt.
      if (pending.size >= MAX_PENDING) {
        pending.delete(pending.keys().next().value ?? '');
      }
      const state = randomBytes(16).toString('hex');
      pending.set(state, { returnTo, expires: now + STATE_TTL });
      setCookie(c, STATE_COOKIE, state, {
        httpOnly: true,
        secure: config.secureCookies,
        sameSite: 'Lax',
        path: '/auth',
        maxAge: STATE_TTL / 1000,
      });
      return c.redirect(authorizeUrl(config, state));
    })

    .get('/callback', async (c) => {
      const code = c.req.query('code');
      const state = c.req.query('state');
      const cookieState = getCookie(c, STATE_COOKIE);
      deleteCookie(c, STATE_COOKIE, { path: '/auth' });

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
        return c.redirect(entry.returnTo);
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
      tools.setCookie(c, session, sessionExpiresAt(session) - Date.now());
      console.log(
        `Signed in: ${user.login} (canEdit=${String(canEdit(config, session))})`
      );
      return c.redirect(entry.returnTo);
    })

    .get('/me', tools.optional, (c) => {
      const session = c.get('session');
      if (!session) return c.json({ error: 'Not signed in' }, 401);
      return c.json(toMe(session));
    })

    .post('/logout', tools.required, async (c) => {
      const session = c.get('session');
      sessions.delete(session.id);
      tools.clearCookie(c);
      if (session.accessToken !== LOCAL_TOKEN) {
        await revokeToken(config, session.accessToken);
      }
      return c.body(null, 204);
    });
}
