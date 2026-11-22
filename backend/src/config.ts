import { config as loadDotenv } from 'dotenv';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';

declare const __APP_VERSION__: string | undefined;

export const APP_VERSION =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(8788),
    HOST: z.string().default('127.0.0.1'),
    PUBLIC_URL: z.url(),
    FRONTEND_URL: z.url(),
    SESSION_KEY: z
      .string()
      .refine((value) => Buffer.from(value, 'base64').length === 32, {
        message: 'must be 32 random bytes, base64-encoded',
      }),
    GITHUB_APP_CLIENT_ID: z.string().default(''),
    GITHUB_APP_CLIENT_SECRET: z.string().default(''),
    /** The only GitHub account allowed to edit (numeric id, so renames don't matter). */
    EDITOR_GITHUB_ID: z.coerce.number().int().positive().default(58040528),
    DATA_DIR: z.string().default(join(homedir(), '.local/share/the-compiler')),
    DEV_LOGIN: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .superRefine((env, ctx) => {
    if (
      !env.DEV_LOGIN &&
      !(env.GITHUB_APP_CLIENT_ID && env.GITHUB_APP_CLIENT_SECRET)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'GITHUB_APP_CLIENT_ID and GITHUB_APP_CLIENT_SECRET are required unless DEV_LOGIN is on',
      });
    }
    const host = new URL(env.PUBLIC_URL).hostname;
    if (env.DEV_LOGIN && host !== 'localhost' && host !== '127.0.0.1') {
      ctx.addIssue({
        code: 'custom',
        message: 'DEV_LOGIN only works when PUBLIC_URL is localhost',
      });
    }
  });

export type Config = {
  port: number;
  host: string;
  publicUrl: string;
  frontendUrl: string;
  frontendOrigin: string;
  secureCookies: boolean;
  sessionKey: Buffer;
  github: { clientId: string; clientSecret: string };
  editorGithubId: number;
  dataDir: string;
  /** The bookmarks file on this server: the only copy (backed up to the NAS). */
  bookmarksFile: string;
  devLogin: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  loadDotenv({ quiet: true });
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;
  const publicUrl = e.PUBLIC_URL.replace(/\/+$/, '');

  return {
    port: e.PORT,
    host: e.HOST,
    publicUrl,
    frontendUrl: e.FRONTEND_URL,
    frontendOrigin: new URL(e.FRONTEND_URL).origin,
    secureCookies: publicUrl.startsWith('https://'),
    sessionKey: Buffer.from(e.SESSION_KEY, 'base64'),
    github: {
      clientId: e.GITHUB_APP_CLIENT_ID,
      clientSecret: e.GITHUB_APP_CLIENT_SECRET,
    },
    editorGithubId: e.EDITOR_GITHUB_ID,
    dataDir: resolve(e.DATA_DIR),
    bookmarksFile: resolve(e.DATA_DIR, 'bookmarks.json'),
    devLogin: e.DEV_LOGIN,
  };
}
