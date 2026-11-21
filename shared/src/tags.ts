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
