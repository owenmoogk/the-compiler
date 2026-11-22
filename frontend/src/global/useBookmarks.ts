import type { BookmarksFile } from '@compiler/shared';
import { useCallback, useEffect, useState } from 'react';

import { fetchBookmarks } from '@api/bookmarks';
import { errorMessage } from '@api/client';

import { useSession } from './session';

export function useBookmarks() {
  const { session } = useSession();
  const [file, setFile] = useState<BookmarksFile>();
  const [error, setError] = useState<string>();

  const ready = session.status !== 'loading';

  /** Loads the list; resolves to it (or undefined on failure). */
  const load = useCallback(async (): Promise<BookmarksFile | undefined> => {
    try {
      const next = await fetchBookmarks();
      setFile(next);
      setError(undefined);
      return next;
    } catch (err) {
      setError(errorMessage(err));
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  return { file, setFile, error, reload: load };
}
