import type { BookmarksFile, TagCount } from '@compiler/shared';
import { normalizeTag } from '@compiler/shared';
import {
  Autocomplete,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';

import { renameTag } from '@api/bookmarks';
import { errorMessage } from '@api/client';

export default function RenameTagModal({
  opened,
  tagCounts,
  onClose,
  onSaved,
}: {
  opened: boolean;
  tagCounts: TagCount[];
  onClose: () => void;
  onSaved: (file: BookmarksFile) => void;
}) {
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState('');
  const [saving, setSaving] = useState(false);

  const target = normalizeTag(to);
  const merging = tagCounts.some((t) => t.tag === target && t.tag !== from);

  const submit = async () => {
    if (!from || !target) return;
    setSaving(true);
    try {
      const { file } = await renameTag(from, target);
      onSaved(file);
      setFrom(null);
      setTo('');
    } catch (error) {
      notifications.show({ color: 'red', message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Rename tag">
      <Stack gap="sm">
        <Select
          label="Tag"
          data={tagCounts.map(({ tag, count }) => ({
            value: tag,
            label: `${tag} (${count})`,
          }))}
          value={from}
          onChange={setFrom}
          searchable
        />
        <Autocomplete
          label="New name"
          data={tagCounts.map((t) => t.tag).filter((t) => t !== from)}
          value={to}
          onChange={setTo}
        />
        {merging && (
          <Text size="sm" c="orange">
            "{target}" already exists, so the two tags will be merged.
          </Text>
        )}
        <Group justify="end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={!from || !target || target === from}
            onClick={() => void submit()}
          >
            {merging ? 'Merge' : 'Rename'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
