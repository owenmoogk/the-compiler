import type { TagCount } from '@compiler/shared';
import { ActionIcon, Badge, Group, Text, Tooltip } from '@mantine/core';
import { FaPen } from 'react-icons/fa';

import type { useView } from '@global/useView';

/** Tag pills, most-used first. Click to filter; links with any selected tag are shown. */
export default function TagCloud({
  viewParams,
  tagCounts,
  canEdit,
  onRename,
}: {
  viewParams: ReturnType<typeof useView>;
  tagCounts: TagCount[];
  canEdit: boolean;
  onRename: () => void;
}) {
  const { view, update, toggleTag } = viewParams;
  if (!tagCounts.length) return null;

  return (
    <Group gap="xs" align="center">
      {tagCounts.map(({ tag, count }) => {
        const selected = view.tags.includes(tag);
        return (
          <Badge
            key={tag}
            component="button"
            variant={selected ? 'filled' : 'light'}
            color={selected ? undefined : 'gray'}
            style={{ cursor: 'pointer', textTransform: 'none', border: 0 }}
            onClick={() => toggleTag(tag)}
            rightSection={
              <Text span size="xs" opacity={0.7}>
                {count}
              </Text>
            }
          >
            {tag}
          </Badge>
        );
      })}
      {view.tags.length > 0 && (
        <Text
          component="button"
          size="xs"
          c="dimmed"
          style={{ background: 'none', border: 0, cursor: 'pointer' }}
          onClick={() => update({ tags: [] })}
        >
          Clear
        </Text>
      )}
      {canEdit && (
        <Tooltip label="Rename or merge a tag">
          <ActionIcon
            variant="subtle"
            size="sm"
            color="gray"
            onClick={onRename}
            aria-label="Rename tag"
          >
            <FaPen size={10} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}
