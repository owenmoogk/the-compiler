import { normalizeTag } from '@compiler/shared';
import { ActionIcon, Badge, Group, Input, TextInput } from '@mantine/core';
import { useState } from 'react';
import { FaCheck, FaPlus } from 'react-icons/fa';

/**
 * Every existing tag as a pill: click to add or remove it. New tags can be
 * typed into the small box at the end.
 */
export default function TagPicker({
  allTags,
  value,
  onChange,
}: {
  allTags: string[];
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const tags = [...allTags, ...value.filter((tag) => !allTags.includes(tag))];

  const toggle = (tag: string) =>
    onChange(
      value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag]
    );

  const addDraft = () => {
    const tag = normalizeTag(draft);
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft('');
  };

  return (
    <Input.Wrapper label="Tags">
      <Group gap={6} mt={4}>
        {tags.map((tag) => {
          const selected = value.includes(tag);
          return (
            <Badge
              key={tag}
              component="button"
              type="button"
              variant={selected ? 'filled' : 'light'}
              color={selected ? undefined : 'gray'}
              leftSection={
                selected ? <FaCheck size={8} /> : <FaPlus size={8} />
              }
              style={{ cursor: 'pointer', textTransform: 'none', border: 0 }}
              onClick={() => toggle(tag)}
            >
              {tag}
            </Badge>
          );
        })}
        <TextInput
          size="xs"
          w={140}
          placeholder="New tag"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              addDraft();
            }
          }}
          rightSection={
            draft.trim() ? (
              <ActionIcon
                size="sm"
                variant="subtle"
                onClick={addDraft}
                aria-label="Add tag"
              >
                <FaPlus size={10} />
              </ActionIcon>
            ) : null
          }
          aria-label="New tag"
        />
      </Group>
    </Input.Wrapper>
  );
}
