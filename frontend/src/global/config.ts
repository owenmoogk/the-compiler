const env = import.meta.env;

/** Backend origin. In dev, Vite proxies /auth and /api, so it is same-origin. */
export const API_URL =
  env.VITE_API_URL ?? (env.DEV ? '' : 'https://compiler.owenmoogk.com');

/**
 * Anonymous visitors read straight from GitHub, so the site stays readable
 * when the backend is down. In dev, the backend serves the local file.
 */
export const PUBLIC_DATA_URL =
  env.VITE_DATA_URL ??
  (env.DEV
    ? `${API_URL}/api/bookmarks`
    : 'https://raw.githubusercontent.com/owenmoogk/bookmarks/main/bookmarks.json');

export const REPO_URL = 'https://github.com/owenmoogk/the-compiler';
export const BOOKMARKS_REPO_URL = 'https://github.com/owenmoogk/bookmarks';
