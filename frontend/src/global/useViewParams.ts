import type { BookmarkView, SortOption } from '@compiler/shared';
import { SORT_OPTIONS } from '@compiler/shared';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const pick = <T extends string>(
  options: readonly T[],
  value: string | null,
  fallback: T
): T => (options.includes(value as T) ? (value as T) : fallback);

/** Search, tag filter and sort live in the URL, so a filtered view can be linked. */
export function useViewParams() {
  const [params, setParams] = useSearchParams();

  const view = useMemo(
    () => ({
      query: params.get('q') ?? '',
      tags: (params.get('tags') ?? '').split(',').filter(Boolean),
      sort: pick<SortOption>(SORT_OPTIONS, params.get('sort'), 'newest'),
    }),
    [params]
  );

  const update = useCallback(
    (patch: Partial<BookmarkView>) => {
      // Built from this render's params: React Router's functional updater
      // can hand back stale params after the URL changes from outside.
      const next = new URLSearchParams(params);
      const set = (key: string, value: string, fallback: string) => {
        if (value && value !== fallback) next.set(key, value);
        else next.delete(key);
      };
      if (patch.query !== undefined) set('q', patch.query, '');
      if (patch.tags !== undefined) set('tags', patch.tags.join(','), '');
      if (patch.sort !== undefined) set('sort', patch.sort, 'newest');
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  const toggleTag = useCallback(
    (tag: string) => {
      update({
        tags: view.tags.includes(tag)
          ? view.tags.filter((t) => t !== tag)
          : [...view.tags, tag],
      });
    },
    [update, view.tags]
  );

  return { view, update, toggleTag };
}
