import type { BookmarkMeta } from '@compiler/shared';
import { metaSchema } from '@compiler/shared';

import { parseHtml, pickIcon } from './html';
import { safeFetch } from './ssrf';

function message(error: unknown) {
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    return cause instanceof Error
      ? `${error.message}: ${cause.message}`
      : error.message;
  }
  return String(error);
}

async function faviconIco(pageUrl: string) {
  const ico = new URL('/favicon.ico', pageUrl).toString();
  try {
    const res = await safeFetch(ico, { method: 'HEAD', accept: 'image/*' });
    return res.status === 200 && /image|icon|octet/.test(res.contentType)
      ? res.url
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Collects title, description, favicon, etc. for a URL. Never throws: when
 * nothing useful could be fetched, the reason is recorded in `error`.
 */
export async function scrapeMetadata(url: string) {
  const draft: Partial<BookmarkMeta> = {};
  const errors: string[] = [];
  const fill = (values: Partial<BookmarkMeta>) => {
    for (const [key, value] of Object.entries(values) as [
      keyof BookmarkMeta,
      string | undefined,
    ][]) {
      if (value && !draft[key]) draft[key] = value;
    }
  };

  let finalUrl = url;
  try {
    const page = await safeFetch(url);
    finalUrl = page.url;
    if (page.status >= 400) {
      errors.push(`Page returned HTTP ${page.status}`);
    }
    if (/html|xml/i.test(page.contentType) && page.body) {
      const parsed = parseHtml(page.body, page.url);
      // On error pages, keep only the icon.
      if (page.status < 400) {
        fill({
          title: parsed.title,
          description: parsed.description,
          siteName: parsed.siteName,
          author: parsed.author,
          image: parsed.image,
        });
      }
      fill({ favicon: pickIcon(parsed.icons) });
    }
  } catch (error) {
    errors.push(message(error));
  }

  if (!draft.favicon) {
    draft.favicon = await faviconIco(finalUrl);
  }

  // Drop anything that does not fit the schema (e.g. a data: image URL).
  const meta: BookmarkMeta = { fetchedAt: new Date().toISOString() };
  for (const [key, value] of Object.entries(draft) as [
    keyof BookmarkMeta,
    string,
  ][]) {
    const field = metaSchema.shape[key];
    if (field.safeParse(value).success) Object.assign(meta, { [key]: value });
  }
  if (!meta.title && errors.length) {
    meta.error = errors.join('; ').slice(0, 500);
  }
  return meta;
}
