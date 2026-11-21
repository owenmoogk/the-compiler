import type { BookmarkView } from '@compiler/shared';
import { useCallback, useState } from 'react';

const INITIAL_VIEW: BookmarkView = { query: '', tags: [], sort: 'newest' };

/** Search text, selected tags and sort order for the list (kept out of the URL). */
export function useView() {
  const [view, setView] = useState<BookmarkView>(INITIAL_VIEW);

  const update = useCallback((patch: Partial<BookmarkView>) => {
    setView((current) => ({ ...current, ...patch }));
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setView((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((t) => t !== tag)
        : [...current.tags, tag],
    }));
  }, []);

  return { view, update, toggleTag };
}
