import type { Me } from '@compiler/shared';

import { API_URL } from '@global/config';

import { api, ApiError } from './client';

export type MeResult =
  | { status: 'signedIn'; me: Me }
  | { status: 'anonymous' }
  | { status: 'offline' };

export async function getMe(): Promise<MeResult> {
  try {
    return { status: 'signedIn', me: await api<Me>('/auth/me') };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { status: 'anonymous' };
    }
    // Network error or 5xx: the backend is unreachable.
    return { status: 'offline' };
  }
}

export function loginUrl(): string {
  const returnTo = window.location.href;
  return `${API_URL}/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export async function logout(): Promise<void> {
  await api('/auth/logout', { method: 'POST' });
}
