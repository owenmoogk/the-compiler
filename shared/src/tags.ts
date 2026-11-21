/** Tags are lowercase-kebab: "youtube", "web-dev", "essay". */
export const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

export function normalizeTags(raw: readonly string[]): string[] {
  const out: string[] = [];
  for (const tag of raw.map(normalizeTag)) {
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

const DOMAIN_TAGS: [RegExp, string[]][] = [
  [/(^|\.)(youtube\.com|youtu\.be)$/, ['youtube', 'video']],
  [/(^|\.)vimeo\.com$/, ['video']],
  [/(^|\.)substack\.com$/, ['essay']],
  [/(^|\.)medium\.com$/, ['article']],
  [/(^|\.)github\.com$/, ['github']],
  [/(^|\.)reddit\.com$/, ['reddit']],
  [/(^|\.)(twitter\.com|x\.com)$/, ['twitter']],
  [/(^|\.)wikipedia\.org$/, ['wikipedia']],
  [/(^|\.)(spotify\.com|soundcloud\.com|bandcamp\.com)$/, ['music']],
  [/(^|\.)arxiv\.org$/, ['paper']],
  [/(^|\.)podcasts\.apple\.com$/, ['podcast']],
];

/** Tags to pre-fill in the add form, based on the link's domain. */
export function suggestTagsForUrl(url: string): string[] {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return [];
  }
  return DOMAIN_TAGS.find(([pattern]) => pattern.test(host))?.[1] ?? [];
}
