import type { Me } from '@compiler/shared';

import { API_URL } from '@global/config';
import { parseResponse } from 'hono/client';

import { client, errorStatus } from './client';

export type MeResult =
  | { status: 'signedIn'; me: Me }
  | { status: 'anonymous' }
  | { status: 'offline' };

export async function getMe(): Promise<MeResult> {
  try {
    return {
      status: 'signedIn',
      me: await parseResponse(client.auth.me.$get()),
    };
  } catch (error) {
    if (errorStatus(error) === 401) {
      return { status: 'anonymous' };
    }
    // Network error or 5xx: the backend is unreachable.
    return { status: 'offline' };
  }
}

export function loginUrl() {
  const returnTo = window.location.href;
  return `${API_URL}/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export async function logout() {
  await parseResponse(client.auth.logout.$post());
}
