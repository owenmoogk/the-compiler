/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin. Default: same origin in dev (Vite proxy), compiler.owenmoogk.com in prod. */
  readonly VITE_API_URL?: string;
  /** Where anonymous visitors read bookmarks.json from. */
  readonly VITE_DATA_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// The package ships types, but its "exports" map hides them from Bundler resolution.
declare module 'vite-plugin-eslint' {
  import type { Plugin } from 'vite';
  export default function eslint(options?: Record<string, unknown>): Plugin;
}
