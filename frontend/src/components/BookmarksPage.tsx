import type { Bookmark, BookmarksFile, Section } from '@compiler/shared';
import {
  countTags,
  sectionOf,
  SECTIONS,
  displayTitle,
  filterBookmarks,
  groupByTag,
} from '@compiler/shared';
import {
  Affix,
  Anchor,
  Button,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { deleteBookmark, deleteBookmarks } from '@api/bookmarks';
import { errorMessage } from '@api/client';
import { CONTACT_URL } from '@global/config';
import { useSession } from '@global/session';
import { useBookmarks } from '@global/useBookmarks';
import { useView } from '@global/useView';

import BookmarkModal from './BookmarkModal';
import GroupedBookmarks from './GroupedBookmarks';
import RenameTagModal from './RenameTagModal';
import SectionTabs from './SectionTabs';
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
  const { view } = viewParams;

  const [editing, setEditing] = useState<{ bookmark?: Bookmark } | null>(null);
  const [renaming, setRenaming] = useState(false);
  // Cards picked with Shift-click, deleted together with the Delete key.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const confirming = useRef(false);

  const bookmarks = useMemo(() => file?.bookmarks ?? [], [file]);
  const tagCounts = useMemo(() => countTags(bookmarks), [bookmarks]);
  const sectionTags = useMemo(
    () =>
      Object.fromEntries(
        SECTIONS.map((section) => [
          section,
          countTags(
            bookmarks.filter((b) => sectionOf(b) === section),
            'name'
          ).map((t) => t.tag),
        ])
      ) as Record<Section, string[]>,
    [bookmarks]
  );
  // Tag pills for the current section only.
  const sectionTagCounts = useMemo(
    () => countTags(bookmarks.filter((b) => sectionOf(b) === view.section)),
    [bookmarks, view.section]
  );
  // The search box updates right away; the (slower) list catches up after.
  const listView = useDeferredValue(view);
  const visible = useMemo(
    () => filterBookmarks(bookmarks, listView),
    [bookmarks, listView]
  );
  const groups = useMemo(
    () => groupByTag(visible, listView.tags),
    [visible, listView]
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

  const editBookmark = useCallback(
    (bookmark: Bookmark) => setEditing({ bookmark }),
    []
  );

  const confirmDelete = useCallback(
    (bookmark: Bookmark) =>
      modals.openConfirmModal({
        title: 'Delete link?',
        children: (
          <Text size="sm">"{displayTitle(bookmark)}" will be removed.</Text>
        ),
        labels: { confirm: 'Delete', cancel: 'Cancel' },
        confirmProps: { color: 'red' },
        onConfirm: () =>
          void deleteBookmark(bookmark.id)
            .then((result) => setFile(result.file))
            .catch(fail),
      }),
    [setFile]
  );

  const toggleSelect = useCallback(
    (id: string) =>
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    []
  );

  const confirmDeleteSelected = () => {
    const picked = bookmarks.filter((b) => selected.has(b.id));
    if (!picked.length || confirming.current) return;
    confirming.current = true;
    const shown = picked.slice(0, 8);
    modals.openConfirmModal({
      title: `Delete ${String(picked.length)} link${picked.length === 1 ? '' : 's'}?`,
      children: (
        <Stack gap={4}>
          {shown.map((b) => (
            <Text key={b.id} size="sm" truncate>
              {displayTitle(b)}
            </Text>
          ))}
          {picked.length > shown.length && (
            <Text size="sm" c="dimmed">
              and {picked.length - shown.length} more
            </Text>
          )}
        </Stack>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      // Focused, so Enter confirms.
      confirmProps: { color: 'red', 'data-autofocus': true },
      onClose: () => {
        confirming.current = false;
      },
      onConfirm: () =>
        void deleteBookmarks(picked.map((b) => b.id))
          .then((result) => {
            setFile(result.file);
            setSelected(new Set());
            notifications.show({
              color: 'green',
              message: `Deleted ${String(result.deleted)} link${result.deleted === 1 ? '' : 's'}`,
            });
          })
          .catch(fail),
    });
  };

  // Delete/Backspace deletes the selection; Escape clears it.
  const deleteSelected = useRef(confirmDeleteSelected);
  deleteSelected.current = confirmDeleteSelected;
  useEffect(() => {
    if (!canEdit || !selected.size) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelected.current();
      } else if (event.key === 'Escape' && !confirming.current) {
        setSelected(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit, selected.size]);

  return (
    <Stack gap="md">
      <Toolbar
        viewParams={viewParams}
        canEdit={canEdit}
        onAdd={() => setEditing({})}
      />
      <SectionTabs
        viewParams={viewParams}
        bookmarks={bookmarks}
        query={listView.query}
      />
      <TagCloud
        viewParams={viewParams}
        tagCounts={sectionTagCounts}
        canEdit={canEdit}
        onRename={() => setRenaming(true)}
      />

      {error && !file ? (
        <Stack gap={4} align="center" py="xl">
          <Text fw={500}>Unable to retrieve content.</Text>
          <Text size="sm" c="dimmed">
            If you expect something to be here,{' '}
            <Anchor href={CONTACT_URL} size="sm">
              let me know
            </Anchor>
            .
          </Text>
        </Stack>
      ) : !file ? (
        <Stack gap="xs">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} h={44} />
          ))}
        </Stack>
      ) : groups.length ? (
        <GroupedBookmarks
          groups={groups}
          canEdit={canEdit}
          onEdit={editBookmark}
          onDelete={confirmDelete}
          selected={selected}
          onToggleSelect={toggleSelect}
        />
      ) : (
        <Text c="dimmed" ta="center" py="xl">
          {bookmarks.length
            ? 'Nothing matches those filters.'
            : 'No links yet.'}
        </Text>
      )}

      {canEdit && selected.size > 0 && (
        <Affix position={{ bottom: 20, left: 0, right: 0 }}>
          <Group justify="center">
            <Paper shadow="md" withBorder radius="xl" px="md" py={8}>
              <Group gap="sm" wrap="nowrap">
                <Text size="sm" fw={500}>
                  {selected.size} selected
                </Text>
                <Text size="xs" c="dimmed" visibleFrom="xs">
                  Shift-click to add more · Delete to remove · Esc to clear
                </Text>
                <Button size="xs" color="red" onClick={confirmDeleteSelected}>
                  Delete
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => setSelected(new Set())}
                >
                  Clear
                </Button>
              </Group>
            </Paper>
          </Group>
        </Affix>
      )}

      <BookmarkModal
        opened={editing !== null}
        bookmark={editing?.bookmark}
        sectionTags={sectionTags}
        defaultSection={view.section}
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
