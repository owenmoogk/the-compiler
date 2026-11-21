import type { BookmarkView } from '@compiler/shared';
import { DEFAULT_SECTION } from '@compiler/shared';
import { useCallback, useState } from 'react';

const INITIAL_VIEW: BookmarkView = {
  section: DEFAULT_SECTION,
  query: '',
  tags: [],
};

/** Search text, selected tags and sort order for the list (kept out of the URL). */
export function useView() {
  const [view, setView] = useState<BookmarkView>(INITIAL_VIEW);

  const update = useCallback((patch: Partial<BookmarkView>) => {
    setView((current) => ({ ...current, ...patch }));
  }, []);

  /** One tag at a time: clicking another replaces it, clicking it again clears it. */
  const toggleTag = useCallback((tag: string) => {
    setView((current) => ({
      ...current,
      tags: current.tags.includes(tag) ? [] : [tag],
    }));
  }, []);

  /** Tags differ per section, so switching section clears the tag filter. */
  const setSection = useCallback((section: BookmarkView['section']) => {
    setView((current) => ({ ...current, section, tags: [] }));
  }, []);

  return { view, update, toggleTag, setSection };
}
