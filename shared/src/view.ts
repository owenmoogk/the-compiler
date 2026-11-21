import type { Bookmark, Section } from './bookmark';
import {
  displayDescription,
  displayTitle,
  hostnameOf,
  sectionOf,
} from './bookmark';

export const TAG_SORTS = ['count', 'name'] as const;
export type TagSort = (typeof TAG_SORTS)[number];

export type BookmarkView = {
  /** Which section is shown. */
  section: Section;
  query: string;
  tags: string[];
};

export type TagCount = { tag: string; count: number };

function searchText(bookmark: Bookmark): string {
  return [
    displayTitle(bookmark),
    displayDescription(bookmark),
    bookmark.meta?.title,
    bookmark.meta?.siteName,
    bookmark.meta?.author,
    hostnameOf(bookmark.url),
    ...bookmark.tags,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

export function filterBookmarks(
  bookmarks: readonly Bookmark[],
  view: Pick<BookmarkView, 'query' | 'tags'> &
    Partial<Pick<BookmarkView, 'section'>>
): Bookmark[] {
  const words = view.query.toLowerCase().split(/\s+/).filter(Boolean);

  return bookmarks.filter((bookmark) => {
    if (view.section && sectionOf(bookmark) !== view.section) return false;
    // A link matches if it has any of the selected tags.
    if (
      view.tags.length &&
      !view.tags.some((tag) => bookmark.tags.includes(tag))
    ) {
      return false;
    }
    if (!words.length) return true;
    const text = searchText(bookmark);
    return words.every((word) => text.includes(word));
  });
}

const compareText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' });

export function countTags(
  bookmarks: readonly Bookmark[],
  sort: TagSort = 'count'
): TagCount[] {
  const counts = new Map<string, number>();
  for (const bookmark of bookmarks) {
    for (const tag of bookmark.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const list = [...counts].map(([tag, count]) => ({ tag, count }));
  return list.sort((a, b) =>
    sort === 'count'
      ? b.count - a.count || compareText(a.tag, b.tag)
      : compareText(a.tag, b.tag)
  );
}

/** Applies a tag rename/merge to every bookmark. */
export function renameTagIn(
  bookmarks: readonly Bookmark[],
  from: string,
  to: string
): Bookmark[] {
  return bookmarks.map((bookmark) => {
    if (!bookmark.tags.includes(from)) return bookmark;
    const tags = bookmark.tags.map((tag) => (tag === from ? to : tag));
    return { ...bookmark, tags: [...new Set(tags)] };
  });
}

export type TagGroup = { tag: string | null; bookmarks: Bookmark[] };

/**
 * One group per tag (A–Z), each newest first; untagged links last. A link
 * with several tags appears in each of its groups. With `only`, just those tags.
 */
export function groupByTag(
  bookmarks: readonly Bookmark[],
  only: readonly string[] = []
): TagGroup[] {
  const groups = new Map<string, Bookmark[]>();
  const untagged: Bookmark[] = [];
  for (const bookmark of bookmarks) {
    if (!bookmark.tags.length) untagged.push(bookmark);
    for (const tag of bookmark.tags) {
      if (only.length && !only.includes(tag)) continue;
      groups.set(tag, [...(groups.get(tag) ?? []), bookmark]);
    }
  }
  // Newest first; same-day links A–Z.
  const byDate = (a: Bookmark, b: Bookmark) =>
    b.addedAt.localeCompare(a.addedAt) ||
    compareText(displayTitle(a), displayTitle(b));
  const result: TagGroup[] = [...groups]
    .sort(([a], [b]) => compareText(a, b))
    .map(([tag, list]) => ({ tag, bookmarks: list.sort(byDate) }));
  if (untagged.length && !only.length) {
    result.push({ tag: null, bookmarks: untagged.sort(byDate) });
  }
  return result;
}
