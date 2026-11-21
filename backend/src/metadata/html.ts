import { load } from 'cheerio';

export type IconCandidate = { href: string; rel: string; size: number };

export type ParsedPage = {
  title?: string;
  description?: string;
  siteName?: string;
  author?: string;
  image?: string;
  icons: IconCandidate[];
};

function clean(value: string | undefined, max: number): string | undefined {
  const text = value?.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function absolute(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

/** Largest side from a `sizes` attribute; "any" (SVG) counts as large. */
function iconSize(
  sizes: string | undefined,
  href: string,
  rel: string
): number {
  if (sizes?.toLowerCase() === 'any' || /\.svg(\?|$)/i.test(href)) return 512;
  const values = (sizes ?? '')
    .split(/\s+/)
    .map((s) => parseInt(s.split(/x/i)[0] ?? '', 10))
    .filter((n) => !Number.isNaN(n));
  if (values.length) return Math.max(...values);
  return rel.includes('apple-touch-icon') ? 180 : 32;
}

export function parseHtml(html: string, baseUrl: string): ParsedPage {
  const $ = load(html);
  const meta = (...keys: string[]) => {
    for (const key of keys) {
      const value =
        $(`meta[property="${key}"]`).attr('content') ??
        $(`meta[name="${key}"]`).attr('content');
      if (value?.trim()) return value;
    }
    return undefined;
  };

  const icons: IconCandidate[] = [];
  $('link[rel][href]').each((_, element) => {
    const rel = ($(element).attr('rel') ?? '').toLowerCase();
    if (!/(^|\s)(icon|apple-touch-icon)(\s|$)/.test(rel)) return;
    const href = absolute($(element).attr('href'), baseUrl);
    if (!href) return;
    icons.push({
      href,
      rel,
      size: iconSize($(element).attr('sizes'), href, rel),
    });
  });

  return {
    title: clean(
      meta('og:title', 'twitter:title') ?? $('title').first().text(),
      500
    ),
    description: clean(
      meta('og:description', 'twitter:description', 'description'),
      2000
    ),
    siteName: clean(meta('og:site_name', 'application-name'), 200),
    author: clean(meta('author', 'article:author'), 200),
    image: absolute(meta('og:image', 'og:image:url', 'twitter:image'), baseUrl),
    icons,
  };
}

/** Prefers a sharp icon without picking a huge one (it is shown at ~16-24px). */
export function pickIcon(icons: readonly IconCandidate[]): string | undefined {
  const score = (icon: IconCandidate) =>
    icon.size <= 256 ? icon.size : 256 - icon.size / 1000;
  return [...icons].sort((a, b) => score(b) - score(a))[0]?.href;
}
