import type { Bookmark, BookmarksFile } from '@compiler/shared';
import {
  countTags,
  displayTitle,
  filterBookmarks,
  sortBookmarks,
} from '@compiler/shared';
import { Alert, Button, Skeleton, Stack, Text, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useMemo, useState } from 'react';

import { deleteBookmark } from '@api/bookmarks';
import { errorMessage } from '@api/client';
import { useSession } from '@global/session';
import { useBookmarks } from '@global/useBookmarks';
import { useView } from '@global/useView';

import BookmarkModal from './BookmarkModal';
import BookmarkTable from './BookmarkTable';
import RenameTagModal from './RenameTagModal';
import TagCloud from './TagCloud';
import Toolbar from './Toolbar';

const fail = (error: unknown) =>
  notifications.show({
    color: 'red',
    title: 'Something went wrong',
    message: errorMessage(error),
  });

export default function BookmarksPage() {
  const { canEdit } = useSession();
  const { file, setFile, error, reload } = useBookmarks();
  const viewParams = useView();
  const { view, toggleTag } = viewParams;

  const [editing, setEditing] = useState<{ bookmark?: Bookmark } | null>(null);
  const [renaming, setRenaming] = useState(false);

  const bookmarks = useMemo(() => file?.bookmarks ?? [], [file]);
  const tagCounts = useMemo(() => countTags(bookmarks), [bookmarks]);
  const visible = useMemo(
    () => sortBookmarks(filterBookmarks(bookmarks, view), view.sort),
    [bookmarks, view]
  );

  // A link saved before its title/favicon were fetched gets them from the
  // server in the background; re-read the list until they show up.
  const waitForInfo = (id: string, attempt = 1) => {
    window.setTimeout(() => {
      void reload().then((next) => {
        const saved = next?.bookmarks.find((b) => b.id === id);
        if (saved && !saved.meta && attempt < 6) waitForInfo(id, attempt + 1);
      });
    }, 4000);
  };

  const onSaved = (next: BookmarksFile, saved: Bookmark) => {
    setFile(next);
    setEditing(null);
    if (!saved.meta) waitForInfo(saved.id);
    notifications.show({
      color: 'green',
      message: `Saved "${displayTitle(saved)}"`,
    });
  };

  const confirmDelete = (bookmark: Bookmark) =>
    modals.openConfirmModal({
      title: 'Delete link?',
      children: (
        <Text size="sm">
          "{displayTitle(bookmark)}" will be removed. It stays in the bookmarks
          repo's history.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        void deleteBookmark(bookmark.id)
          .then((result) => setFile(result.file))
          .catch(fail),
    });

  return (
    <Stack gap="md">
      <Title order={1} m={0}>
        The Compiler
      </Title>

      <Toolbar
        viewParams={viewParams}
        canEdit={canEdit}
        onAdd={() => setEditing({})}
      />
      <TagCloud
        viewParams={viewParams}
        tagCounts={tagCounts}
        canEdit={canEdit}
        onRename={() => setRenaming(true)}
      />

      {error && !file ? (
        <Alert color="red" title="Could not load bookmarks">
          <Stack gap="xs" align="start">
            <Text size="sm">{error}</Text>
            <Button size="xs" variant="default" onClick={() => void reload()}>
              Try again
            </Button>
          </Stack>
        </Alert>
      ) : !file ? (
        <Stack gap="xs">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} h={44} />
          ))}
        </Stack>
      ) : visible.length ? (
        <BookmarkTable
          bookmarks={visible}
          canEdit={canEdit}
          onTagClick={toggleTag}
          onEdit={(bookmark) => setEditing({ bookmark })}
          onDelete={confirmDelete}
        />
      ) : (
        <Text c="dimmed" ta="center" py="xl">
          {bookmarks.length
            ? 'Nothing matches those filters.'
            : 'No links yet.'}
        </Text>
      )}

      <BookmarkModal
        opened={editing !== null}
        bookmark={editing?.bookmark}
        allTags={tagCounts.map((t) => t.tag)}
        onClose={() => setEditing(null)}
        onSaved={onSaved}
      />
      <RenameTagModal
        opened={renaming}
        tagCounts={tagCounts}
        onClose={() => setRenaming(false)}
        onSaved={(next) => {
          setFile(next);
          setRenaming(false);
          notifications.show({ color: 'green', message: 'Tag renamed' });
        }}
      />
    </Stack>
  );
}
