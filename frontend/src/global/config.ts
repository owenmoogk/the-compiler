const env = import.meta.env;

/** Backend origin. In dev, Vite proxies /auth and /api, so it is same-origin. */
export const API_URL =
  env.VITE_API_URL ?? (env.DEV ? '' : 'https://compiler.owenmoogk.com');

export const REPO_URL = 'https://github.com/owenmoogk/the-compiler';
export const CONTACT_URL = 'https://owenmoogk.com/contact';
