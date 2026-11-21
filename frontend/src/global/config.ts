const env = import.meta.env;

/** Backend origin. In dev, Vite proxies /auth and /api, so it is same-origin. */
export const API_URL =
  env.VITE_API_URL ?? (env.DEV ? '' : 'https://compiler.owenmoogk.com');

/**
 * Fallback when the backend is unreachable: the copy on GitHub, which can be
 * up to a day behind (the server pushes to it daily). In dev, the backend.
 */
export const PUBLIC_DATA_URL =
  env.VITE_DATA_URL ??
  (env.DEV
    ? `${API_URL}/api/bookmarks`
    : 'https://raw.githubusercontent.com/owenmoogk/bookmarks/main/bookmarks.json');

export const REPO_URL = 'https://github.com/owenmoogk/the-compiler';
export const BOOKMARKS_REPO_URL = 'https://github.com/owenmoogk/bookmarks';
