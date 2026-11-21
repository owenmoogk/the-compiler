import type { BookmarksFile } from '@compiler/shared';
import { useCallback, useEffect, useState } from 'react';

import { fetchBookmarks, fetchPublicBookmarks } from '@api/bookmarks';
import { errorMessage } from '@api/client';

import { useSession } from './session';

export function useBookmarks() {
  const { session } = useSession();
  const [file, setFile] = useState<BookmarksFile>();
  const [error, setError] = useState<string>();

  const signedIn = session.status === 'signedIn';
  const ready = session.status !== 'loading';

  /** Loads the list; resolves to it (or undefined on failure). */
  const load = useCallback(async (): Promise<BookmarksFile | undefined> => {
    const loaded = (next: BookmarksFile) => {
      setFile(next);
      setError(undefined);
      return next;
    };
    try {
      if (signedIn) {
        try {
          return loaded(await fetchBookmarks());
        } catch (err) {
          console.warn('Backend read failed, using public copy', err);
        }
      }
      return loaded(await fetchPublicBookmarks());
    } catch (err) {
      setError(errorMessage(err));
      return undefined;
    }
  }, [signedIn]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  return { file, setFile, error, reload: load };
}
