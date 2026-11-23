import type { AppType } from '@compiler/backend/app';
import { API_URL } from '@global/config';
import { DetailedError, hc } from 'hono/client';

/**
 * Typed client for the backend, generated from its routes: paths, methods,
 * inputs and responses are all checked against backend/src (see AppType).
 * Wrap calls in parseResponse (hono/client) to get the body or a DetailedError.
 */
export const client = hc<AppType>(API_URL, {
  init: { credentials: 'include' },
});

/** The HTTP status of a failed parseResponse call, if it got a response. */
export function errorStatus(error: unknown) {
  return error instanceof DetailedError
    ? (error.statusCode as number | undefined)
    : undefined;
}

/** The server's `{ error }` message when there is one, else the error's own. */
export function errorMessage(error: unknown) {
  if (error instanceof DetailedError) {
    const detail = error.detail as { data?: { error?: unknown } } | undefined;
    const serverMessage = detail?.data?.error;
    if (typeof serverMessage === 'string') return serverMessage;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
