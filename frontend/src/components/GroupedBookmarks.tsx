import type { Bookmark, TagGroup } from '@compiler/shared';
import { displayTitle, hostnameOf } from '@compiler/shared';
import { ActionIcon, Group, Menu, Stack, Text } from '@mantine/core';
import { memo, useState } from 'react';
import { FaEllipsisV, FaPen, FaTrash } from 'react-icons/fa';

import Favicon from './Favicon';
import classes from './GroupedBookmarks.module.css';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const formatDate = (iso: string) => dateFormat.format(new Date(iso));

/** Pass stable (memoized) callbacks so unchanged cards skip re-rendering. */
type Actions = {
  canEdit: boolean;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
  onToggleSelect: (id: string) => void;
};

/** One headed list of links per tag. */
export default memo(function GroupedBookmarks({
  groups,
  selected,
  ...actions
}: Actions & {
  groups: TagGroup[];
  /** Ids picked with Shift-click (editors only). */
  selected: ReadonlySet<string>;
}) {
  return (
    <Stack gap="md">
      {groups.map(({ tag, bookmarks }) => (
        <div key={tag ?? ''}>
          <Group gap={8} wrap="nowrap">
            <Text fw={700}>{tag ?? 'Untagged'}</Text>
            <Text size="sm" c="dimmed">
              {bookmarks.length}
            </Text>
          </Group>
          <div className={classes.list}>
            {bookmarks.map((bookmark) => (
              <BookmarkItem
                key={bookmark.id}
                bookmark={bookmark}
                isSelected={selected.has(bookmark.id)}
                {...actions}
              />
            ))}
          </div>
        </div>
      ))}
    </Stack>
  );
});

// The link covers the whole row; the ⋮ button sits above it (a button can't
// go inside a link). Editors Shift-click a row to select it; Ctrl-click still
// opens a new tab.
const BookmarkItem = memo(function BookmarkItem({
  bookmark: b,
  isSelected,
  canEdit,
  onEdit,
  onDelete,
  onToggleSelect,
}: Actions & { bookmark: Bookmark; isSelected: boolean }) {
  const title = displayTitle(b);
  return (
    <div className={classes.item} data-selected={isSelected || undefined}>
      <a
        className={classes.link}
        href={b.url}
        target="_blank"
        rel="noreferrer"
        // Hover shows your notes, or the full title if it's cut off.
        title={b.notes ?? title}
        aria-label={title}
        aria-selected={canEdit ? isSelected : undefined}
        onMouseDown={(event) => {
          // Stop Shift from extending the page's text selection.
          if (canEdit && event.shiftKey) event.preventDefault();
        }}
        onClick={(event) => {
          if (canEdit && event.shiftKey) {
            event.preventDefault();
            onToggleSelect(b.id);
          }
        }}
      />
      <span className={classes.icon}>
        <Favicon url={b.url} favicon={b.meta?.favicon} size={18} />
      </span>
      <span className={classes.text}>
        <span className={classes.title}>{title}</span>
        <span className={classes.host}>{hostnameOf(b.url)}</span>
      </span>
      <time className={classes.date} dateTime={b.addedAt}>
        {formatDate(b.addedAt)}
      </time>
      {canEdit && <EditMenu bookmark={b} onEdit={onEdit} onDelete={onDelete} />}
    </div>
  );
});

/** The Menu is only mounted once opened; one per card up front is slow. */
function EditMenu({
  bookmark,
  onEdit,
  onDelete,
}: Pick<Actions, 'onEdit' | 'onDelete'> & { bookmark: Bookmark }) {
  const [active, setActive] = useState(false);
  const button = (
    <ActionIcon
      size="sm"
      variant="subtle"
      color="gray"
      aria-label="Bookmark actions"
      className={classes.menuButton}
      onClick={active ? undefined : () => setActive(true)}
    >
      <FaEllipsisV size={10} />
    </ActionIcon>
  );
  if (!active) return button;
  return (
    <Menu
      position="bottom-end"
      withinPortal
      defaultOpened
      onClose={() => setActive(false)}
    >
      <Menu.Target>{button}</Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<FaPen size={12} />}
          onClick={() => onEdit(bookmark)}
        >
          Edit
        </Menu.Item>
        <Menu.Item
          color="red"
          leftSection={<FaTrash size={12} />}
          onClick={() => onDelete(bookmark)}
        >
          Delete
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
