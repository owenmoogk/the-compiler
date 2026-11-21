import type { SortOption } from '@compiler/shared';
import { Button, Group, Select, TextInput } from '@mantine/core';
import { FaPlus, FaSearch } from 'react-icons/fa';

import type { useView } from '@global/useView';

const SORT_LABELS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'tag', label: 'By tag' },
];

export default function Toolbar({
  viewParams,
  canEdit,
  onAdd,
}: {
  viewParams: ReturnType<typeof useView>;
  canEdit: boolean;
  onAdd: () => void;
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
        <Button leftSection={<FaPlus size={12} />} onClick={onAdd}>
          Add link
        </Button>
      )}
    </Group>
  );
}
