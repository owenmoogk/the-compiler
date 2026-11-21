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

  const load = useCallback(async () => {
    const loaded = (next: BookmarksFile) => {
      setFile(next);
      setError(undefined);
    };
    try {
      if (signedIn) {
        try {
          loaded(await fetchBookmarks());
          return;
        } catch (err) {
          console.warn('Backend read failed, using public copy', err);
        }
      }
      loaded(await fetchPublicBookmarks());
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [signedIn]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  return { file, setFile, error, reload: load };
}
