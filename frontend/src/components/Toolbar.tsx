import { Button, Group, TextInput } from '@mantine/core';
import { FaPlus, FaSearch } from 'react-icons/fa';

import type { useView } from '@global/useView';

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
      {canEdit && (
        <Button leftSection={<FaPlus size={12} />} onClick={onAdd}>
          Add link
        </Button>
      )}
    </Group>
  );
}
