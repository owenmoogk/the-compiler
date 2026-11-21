import { z } from 'zod';

import type { Config } from '../config';
import { GithubError, HttpError } from '../http';

const API = 'https://api.github.com';
const USER_AGENT = 'the-compiler';

export async function githubApi(
  token: string | undefined,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('X-GitHub-Api-Version', '2022-11-28');
  headers.set('User-Agent', USER_AGENT);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${API}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok && res.status !== 304) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // keep statusText
    }
    throw new GithubError(res.status, message);
  }
  return res;
}

const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  refresh_token_expires_in: z.number().optional(),
});

const tokenErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

export type Tokens = {
  accessToken: string;
  accessExpiresAt?: number;
  refreshToken?: string;
  refreshExpiresAt?: number;
};

async function requestToken(
  config: Config,
  params: Record<string, string>
): Promise<Tokens> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({
      client_id: config.github.clientId,
      client_secret: config.github.clientSecret,
      ...params,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body: unknown = await res.json();
  const parsed = tokenResponseSchema.safeParse(body);
  if (!res.ok || !parsed.success) {
    const error = tokenErrorSchema.safeParse(body);
    throw new HttpError(
      401,
      error.success
        ? `GitHub sign-in failed: ${error.data.error_description ?? error.data.error}`
        : 'GitHub sign-in failed'
    );
  }
  const now = Date.now();
  const t = parsed.data;
  return {
    accessToken: t.access_token,
    accessExpiresAt: t.expires_in ? now + t.expires_in * 1000 : undefined,
    refreshToken: t.refresh_token,
    refreshExpiresAt: t.refresh_token_expires_in
      ? now + t.refresh_token_expires_in * 1000
      : undefined,
  };
}

export function authorizeUrl(config: Config, state: string): string {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', config.github.clientId);
  url.searchParams.set('redirect_uri', `${config.publicUrl}/auth/callback`);
  url.searchParams.set('state', state);
  url.searchParams.set('allow_signup', 'false');
  return url.toString();
}

export async function exchangeCode(
  config: Config,
  code: string
): Promise<Tokens> {
  return requestToken(config, {
    code,
    redirect_uri: `${config.publicUrl}/auth/callback`,
  });
}

export async function refreshTokens(
  config: Config,
  refreshToken: string
): Promise<Tokens> {
  return requestToken(config, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

/** Best effort: invalidates the user token on GitHub's side at logout. */
export async function revokeToken(
  config: Config,
  accessToken: string
): Promise<void> {
  const basic = Buffer.from(
    `${config.github.clientId}:${config.github.clientSecret}`
  ).toString('base64');
  try {
    await fetch(`${API}/applications/${config.github.clientId}/token`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Basic ${basic}`,
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: accessToken }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.warn('Token revoke failed:', error);
  }
}

const userSchema = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable().optional(),
  avatar_url: z.string(),
});

export async function fetchUser(token: string) {
  const res = await githubApi(token, '/user');
  return userSchema.parse(await res.json());
}

/**
 * Whether this user can push to the bookmarks repo. GitHub enforces this on
 * every write anyway; this only decides whether the UI shows edit controls.
 */
export async function fetchCanEdit(
  token: string,
  repo: string
): Promise<boolean> {
  try {
    const res = await githubApi(token, `/repos/${repo}`);
    const body = (await res.json()) as { permissions?: { push?: boolean } };
    return body.permissions?.push === true;
  } catch (error) {
    if (error instanceof GithubError && error.status !== 401) return false;
    throw error;
  }
}
