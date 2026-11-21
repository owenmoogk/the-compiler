import type { Bookmark, BookmarkMeta, BookmarksFile } from '@compiler/shared';
import {
  hostnameOf,
  normalizeTags,
  sameUrl,
  suggestTagsForUrl,
} from '@compiler/shared';
import {
  Button,
  Group,
  Image,
  Loader,
  Modal,
  Paper,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useEffect, useRef, useState } from 'react';

import {
  createBookmark,
  previewMetadata,
  updateBookmark,
} from '@api/bookmarks';
import { errorMessage } from '@api/client';

import Favicon from './Favicon';

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname.includes('.')
    );
  } catch {
    return false;
  }
}

type Preview = {
  url: string;
  loading: boolean;
  meta?: BookmarkMeta;
  error?: string;
};

function PreviewCard({ preview }: { preview?: Preview }) {
  if (!preview) return null;
  return (
    <Paper p="sm" shadow="none">
      {preview.loading ? (
        <Group gap="xs">
          <Loader size="xs" />
          <Text size="sm" c="dimmed">
            Fetching page info…
          </Text>
        </Group>
      ) : preview.error ? (
        <Text size="sm" c="red">
          {preview.error}
        </Text>
      ) : (
        <Group gap="sm" wrap="nowrap" align="start">
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Group gap="xs" wrap="nowrap">
              <Favicon
                url={preview.url}
                favicon={preview.meta?.favicon}
                size={20}
              />
              <Text fw={500} lineClamp={1}>
                {preview.meta?.title ?? hostnameOf(preview.url)}
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              {[preview.meta?.siteName, preview.meta?.author]
                .filter(Boolean)
                .join(' · ') || hostnameOf(preview.url)}
            </Text>
            {preview.meta?.error && (
              <Text size="xs" c="orange">
                {preview.meta.error}
              </Text>
            )}
          </Stack>
          {preview.meta?.image && (
            <Image
              src={preview.meta.image}
              w={96}
              h={54}
              radius="sm"
              fit="cover"
              referrerPolicy="no-referrer"
              alt=""
            />
          )}
        </Group>
      )}
    </Paper>
  );
}

function BookmarkForm({
  bookmark,
  allTags,
  onSaved,
  onCancel,
}: {
  bookmark?: Bookmark;
  allTags: string[];
  onSaved: (file: BookmarksFile, saved: Bookmark) => void;
  onCancel: () => void;
}) {
  const form = useForm({
    initialValues: {
      url: bookmark?.url ?? '',
      title: bookmark?.title ?? '',
      notes: bookmark?.notes ?? '',
      tags: bookmark?.tags ?? [],
    },
    validate: {
      url: (value) =>
        isHttpUrl(value.trim()) ? null : 'Enter a full http(s) URL',
    },
  });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview>();
  const [debouncedUrl] = useDebouncedValue(form.values.url.trim(), 500);
  // Domain tag suggestions fill the tag box until you edit it yourself.
  const tagsTouched = useRef(Boolean(bookmark));

  useEffect(() => {
    if (!isHttpUrl(debouncedUrl)) {
      setPreview(undefined);
      return;
    }
    if (bookmark && sameUrl(bookmark.url, debouncedUrl)) {
      setPreview({ url: debouncedUrl, loading: false, meta: bookmark.meta });
      return;
    }
    let cancelled = false;
    setPreview({ url: debouncedUrl, loading: true });
    previewMetadata(debouncedUrl)
      .then((meta) => {
        if (!cancelled) setPreview({ url: debouncedUrl, loading: false, meta });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPreview({
            url: debouncedUrl,
            loading: false,
            error: errorMessage(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedUrl, bookmark]);

  const save = async (values: typeof form.values) => {
    setSaving(true);
    const url = values.url.trim();
    try {
      const result = bookmark
        ? await updateBookmark(bookmark.id, {
            url,
            title: values.title.trim() || null,
            notes: values.notes.trim() || null,
            tags: values.tags,
          })
        : await createBookmark({
            url,
            title: values.title.trim() || undefined,
            notes: values.notes.trim() || undefined,
            tags: values.tags,
            meta:
              preview?.url === url && !preview.loading
                ? preview.meta
                : undefined,
          });
      onSaved(result.file, result.bookmark);
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Not saved',
        message: errorMessage(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const urlProps = form.getInputProps('url');

  return (
    <form onSubmit={form.onSubmit((values) => void save(values))}>
      <Stack gap="sm">
        <TextInput
          label="URL"
          placeholder="https://…"
          data-autofocus
          {...urlProps}
          onChange={(event) => {
            const value = event.currentTarget.value;
            form.setFieldValue('url', value);
            if (!tagsTouched.current) {
              form.setFieldValue('tags', suggestTagsForUrl(value.trim()));
            }
          }}
        />
        <PreviewCard preview={preview} />
        <TextInput
          label="Title"
          description="Leave empty to use the page's own title"
          placeholder={preview?.meta?.title ?? bookmark?.meta?.title ?? ''}
          {...form.getInputProps('title')}
        />
        <Textarea
          label="Notes"
          description="Optional"
          placeholder="Your notes about this link"
          autosize
          minRows={2}
          maxRows={6}
          {...form.getInputProps('notes')}
        />
        <TagsInput
          label="Tags"
          description="Press Enter or comma to add. Tags become lowercase-kebab."
          data={allTags}
          splitChars={[',']}
          clearable
          value={form.values.tags}
          onChange={(tags) => {
            tagsTouched.current = true;
            form.setFieldValue('tags', normalizeTags(tags));
          }}
        />
        <Group justify="end" mt="xs">
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {bookmark ? 'Save' : 'Add link'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export default function BookmarkModal({
  opened,
  bookmark,
  allTags,
  onClose,
  onSaved,
}: {
  opened: boolean;
  bookmark?: Bookmark;
  allTags: string[];
  onClose: () => void;
  onSaved: (file: BookmarksFile, saved: Bookmark) => void;
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={bookmark ? 'Edit link' : 'Add link'}
      size="lg"
    >
      {opened && (
        <BookmarkForm
          key={bookmark?.id ?? 'new'}
          bookmark={bookmark}
          allTags={allTags}
          onSaved={onSaved}
          onCancel={onClose}
        />
      )}
    </Modal>
  );
}
