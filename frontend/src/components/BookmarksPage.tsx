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

import {
  deleteBookmark,
  refreshAllBookmarks,
  refreshBookmark,
} from '@api/bookmarks';
import { errorMessage } from '@api/client';
import { useSession } from '@global/session';
import { useBookmarks } from '@global/useBookmarks';
import { useViewParams } from '@global/useViewParams';

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
  const viewParams = useViewParams();
  const { view, toggleTag } = viewParams;

  const [editing, setEditing] = useState<{ bookmark?: Bookmark } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [refreshing, setRefreshing] = useState<ReadonlySet<string>>(new Set());
  const [refreshingAll, setRefreshingAll] = useState(false);

  const bookmarks = useMemo(() => file?.bookmarks ?? [], [file]);
  const tagCounts = useMemo(() => countTags(bookmarks), [bookmarks]);
  const visible = useMemo(
    () => sortBookmarks(filterBookmarks(bookmarks, view), view.sort),
    [bookmarks, view]
  );

  const onSaved = (next: BookmarksFile, saved: Bookmark) => {
    setFile(next);
    setEditing(null);
    notifications.show({
      color: 'green',
      message: `Saved "${displayTitle(saved)}"`,
    });
  };

  const refreshOne = async (bookmark: Bookmark) => {
    setRefreshing((current) => new Set(current).add(bookmark.id));
    try {
      const result = await refreshBookmark(bookmark.id);
      setFile(result.file);
      const { meta } = result.bookmark;
      notifications.show({
        color: meta?.error ? 'orange' : 'green',
        message: meta?.error
          ? `Partly refreshed: ${meta.error}`
          : `Refreshed "${displayTitle(result.bookmark)}"`,
      });
    } catch (err) {
      fail(err);
    } finally {
      setRefreshing((current) => {
        const next = new Set(current);
        next.delete(bookmark.id);
        return next;
      });
    }
  };

  const refreshAll = async () => {
    setRefreshingAll(true);
    try {
      const result = await refreshAllBookmarks();
      setFile(result.file);
      notifications.show({
        color: 'green',
        message: `Refreshed ${result.refreshed} links`,
      });
    } catch (err) {
      fail(err);
    } finally {
      setRefreshingAll(false);
    }
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

      <Stack gap={6}>
        <Toolbar
          viewParams={viewParams}
          canEdit={canEdit}
          refreshingAll={refreshingAll}
          onAdd={() => setEditing({})}
          onRefreshAll={() => void refreshAll()}
        />
        {file && (
          <Text size="sm" c="dimmed">
            {visible.length === bookmarks.length
              ? `${bookmarks.length} links`
              : `${visible.length} of ${bookmarks.length} links`}
          </Text>
        )}
      </Stack>
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
          refreshing={refreshing}
          onTagClick={toggleTag}
          onEdit={(bookmark) => setEditing({ bookmark })}
          onRefresh={(bookmark) => void refreshOne(bookmark)}
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
