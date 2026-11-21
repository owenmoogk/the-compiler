import type { SortOption } from '@compiler/shared';
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Select,
  TextInput,
} from '@mantine/core';
import { FaEllipsisV, FaPlus, FaSearch, FaSyncAlt } from 'react-icons/fa';

import type { useViewParams } from '@global/useViewParams';

const SORT_LABELS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'tag', label: 'By tag' },
];

export default function Toolbar({
  viewParams,
  canEdit,
  refreshingAll,
  onAdd,
  onRefreshAll,
}: {
  viewParams: ReturnType<typeof useViewParams>;
  canEdit: boolean;
  refreshingAll: boolean;
  onAdd: () => void;
  onRefreshAll: () => void;
}) {
  const { view, update } = viewParams;

  return (
    <Group gap="sm" align="end" wrap="wrap">
      <TextInput
        placeholder="Search"
        leftSection={<FaSearch size={12} />}
        value={view.query}
        onChange={(event) => update({ query: event.currentTarget.value })}
        style={{ flex: '1 1 220px' }}
        aria-label="Search bookmarks"
      />
      <Select
        data={SORT_LABELS}
        value={view.sort}
        onChange={(value) => value && update({ sort: value as SortOption })}
        allowDeselect={false}
        w={150}
        aria-label="Sort"
      />
      {canEdit && (
        <Group gap="2xs" wrap="nowrap">
          <Button leftSection={<FaPlus size={12} />} onClick={onAdd}>
            Add link
          </Button>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="default"
                size="lg"
                loading={refreshingAll}
                aria-label="More actions"
              >
                <FaEllipsisV size={12} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<FaSyncAlt size={12} />}
                onClick={onRefreshAll}
              >
                Refresh all metadata
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      )}
    </Group>
  );
}
