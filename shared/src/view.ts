import type { Bookmark } from './bookmark';
import { displayDescription, displayTitle, hostnameOf } from './bookmark';

export const SORT_OPTIONS = ['newest', 'oldest', 'title', 'tag'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const TAG_SORTS = ['count', 'name'] as const;
export type TagSort = (typeof TAG_SORTS)[number];

export type BookmarkView = {
  query: string;
  tags: string[];
  sort: SortOption;
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
  view: Pick<BookmarkView, 'query' | 'tags'>
): Bookmark[] {
  const words = view.query.toLowerCase().split(/\s+/).filter(Boolean);

  return bookmarks.filter((bookmark) => {
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

export function sortBookmarks(
  bookmarks: readonly Bookmark[],
  sort: SortOption
): Bookmark[] {
  const sorted = [...bookmarks];
  const byTitle = (a: Bookmark, b: Bookmark) =>
    compareText(displayTitle(a), displayTitle(b));

  switch (sort) {
    case 'newest':
      return sorted.sort(
        (a, b) => b.addedAt.localeCompare(a.addedAt) || byTitle(a, b)
      );
    case 'oldest':
      return sorted.sort(
        (a, b) => a.addedAt.localeCompare(b.addedAt) || byTitle(a, b)
      );
    case 'title':
      return sorted.sort(byTitle);
    case 'tag': {
      // Group by first tag alphabetically; untagged last.
      const key = (b: Bookmark) => [...b.tags].sort()[0] ?? '￿';
      return sorted.sort(
        (a, b) => compareText(key(a), key(b)) || byTitle(a, b)
      );
    }
  }
}

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
