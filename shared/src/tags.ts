/**
 * Tags are words separated by single spaces, each starting with a capital:
 * "YouTube", "Web Development", "CAD". Commas are not allowed (they separate
 * tags when typing).
 */
export const TAG_PATTERN = /^[^\s,]+(?: [^\s,]+)*$/u;

const MAX_LENGTH = 40;

/** "web-dev", "web_dev" and "web dev" all become "Web Dev"; "CAD" stays "CAD". */
export function normalizeTag(raw: string): string {
  return raw
    .replace(/[\s,_-]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .slice(0, MAX_LENGTH)
    .trim();
}

/** Normalized and deduplicated (ignoring case), first spelling wins. */
export function normalizeTags(raw: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of raw.map(normalizeTag)) {
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
  }
  return out;
}
