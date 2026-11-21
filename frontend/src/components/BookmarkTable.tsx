import type { Bookmark } from '@compiler/shared';
import { displayTitle, hostnameOf } from '@compiler/shared';
import {
  ActionIcon,
  Anchor,
  Badge,
  Group,
  Menu,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  FaEllipsisV,
  FaExclamationTriangle,
  FaPen,
  FaSyncAlt,
  FaTrash,
} from 'react-icons/fa';

import Favicon from './Favicon';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

// Every cell stays on one line; long text is cut off with an ellipsis.
const oneLine = { whiteSpace: 'nowrap' } as const;
// max-width: 0 lets a table cell shrink below its content, so text truncates
// instead of widening the table; the width splits the leftover space.
const shrinkable = (width: string) =>
  ({ ...oneLine, maxWidth: 0, width }) as const;

export default function BookmarkTable({
  bookmarks,
  canEdit,
  refreshing,
  onTagClick,
  onEdit,
  onRefresh,
  onDelete,
}: {
  bookmarks: Bookmark[];
  canEdit: boolean;
  refreshing: ReadonlySet<string>;
  onTagClick: (tag: string) => void;
  onEdit: (bookmark: Bookmark) => void;
  onRefresh: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
}) {
  return (
    <Table.ScrollContainer minWidth={300}>
      <Table verticalSpacing="xs" highlightOnHover>
        <Table.Tbody>
          {bookmarks.map((bookmark) => (
            <Table.Tr key={bookmark.id}>
              <Table.Td style={shrinkable('55%')}>
                <Group gap="xs" wrap="nowrap">
                  <Favicon
                    url={bookmark.url}
                    favicon={bookmark.meta?.favicon}
                  />
                  <Anchor
                    href={bookmark.url}
                    target="_blank"
                    rel="noreferrer"
                    fw={500}
                    truncate
                    style={{ minWidth: 0, flexShrink: 1 }}
                  >
                    {displayTitle(bookmark)}
                  </Anchor>
                  <Text
                    size="xs"
                    c="dimmed"
                    truncate
                    style={{ flexShrink: 2, minWidth: 40 }}
                  >
                    {hostnameOf(bookmark.url)}
                  </Text>
                  {bookmark.meta?.error && canEdit && (
                    <Tooltip
                      label={`Metadata: ${bookmark.meta.error}`}
                      multiline
                      maw={300}
                    >
                      <span style={{ display: 'flex', flexShrink: 0 }}>
                        <FaExclamationTriangle size={10} color="orange" />
                      </span>
                    </Tooltip>
                  )}
                </Group>
              </Table.Td>
              <Table.Td visibleFrom="sm" style={shrinkable('45%')}>
                <Text size="sm" truncate title={bookmark.notes}>
                  {bookmark.notes}
                </Text>
              </Table.Td>
              <Table.Td visibleFrom="xs" w={1} style={oneLine}>
                <Group gap={4} wrap="nowrap" w="max-content">
                  {bookmark.tags.map((tag) => (
                    <Badge
                      key={tag}
                      component="button"
                      size="sm"
                      variant="light"
                      color="gray"
                      style={{
                        cursor: 'pointer',
                        textTransform: 'none',
                        flexShrink: 0,
                        border: 0,
                      }}
                      onClick={() => onTagClick(tag)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </Group>
              </Table.Td>
              <Table.Td visibleFrom="md" w={1} style={oneLine}>
                <Text size="sm" c="dimmed">
                  {dateFormat.format(new Date(bookmark.addedAt))}
                </Text>
              </Table.Td>
              {canEdit && (
                <Table.Td w={1}>
                  <Group gap={2} wrap="nowrap" justify="end">
                    <Tooltip label="Refresh title & favicon">
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        loading={refreshing.has(bookmark.id)}
                        onClick={() => onRefresh(bookmark)}
                        aria-label="Refresh metadata"
                        visibleFrom="xs"
                      >
                        <FaSyncAlt size={12} />
                      </ActionIcon>
                    </Tooltip>
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          aria-label="Bookmark actions"
                        >
                          <FaEllipsisV size={12} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          hiddenFrom="xs"
                          leftSection={<FaSyncAlt size={12} />}
                          onClick={() => onRefresh(bookmark)}
                        >
                          Refresh title & favicon
                        </Menu.Item>
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
                  </Group>
                </Table.Td>
              )}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
