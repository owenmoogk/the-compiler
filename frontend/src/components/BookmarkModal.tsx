import type {
  Bookmark,
  BookmarkMeta,
  BookmarksFile,
  Section,
} from '@compiler/shared';
import { hostnameOf, sameUrl, SECTION_INFO, SECTIONS } from '@compiler/shared';
import {
  Button,
  Input,
  Group,
  Image,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';

import {
  createBookmark,
  previewMetadata,
  updateBookmark,
} from '@api/bookmarks';
import { errorMessage } from '@api/client';

import Favicon from './Favicon';
import TagPicker from './TagPicker';

function isHttpUrl(value: string) {
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

/** A custom title, or null when it's empty or just the fetched one. */
function titleOverride(value: string, fetched?: string) {
  const title = value.trim();
  return title && title !== fetched ? title : null;
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
  sectionTags,
  defaultSection,
  onSaved,
  onCancel,
}: {
  bookmark?: Bookmark;
  /** Tags already used in each section, offered as suggestions. */
  sectionTags: Record<Section, string[]>;
  defaultSection?: Section;
  onSaved: (file: BookmarksFile, saved: Bookmark) => void;
  onCancel: () => void;
}) {
  const form = useForm<{
    url: string;
    title: string;
    notes: string;
    section: Section | '';
    tags: string[];
  }>({
    initialValues: {
      url: bookmark?.url ?? '',
      // Show the fetched title too, so there's something to edit.
      title: bookmark?.title ?? bookmark?.meta?.title ?? '',
      notes: bookmark?.notes ?? '',
      section: bookmark?.section ?? defaultSection ?? '',
      tags: bookmark?.tags ?? [],
    },
    validate: {
      section: (value) => (value ? null : 'Pick a section'),
      url: (value) =>
        isHttpUrl(value.trim()) ? null : 'Enter a full http(s) URL',
    },
  });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview>();
  const [debouncedUrl] = useDebouncedValue(form.values.url.trim(), 500);

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
    if (!values.section) return;
    const section = values.section;
    setSaving(true);
    const url = values.url.trim();
    try {
      const result = bookmark
        ? await updateBookmark(bookmark.id, {
            url,
            // Unchanged fetched title: keep following the page's own title.
            title: titleOverride(values.title, bookmark.meta?.title),
            notes: values.notes.trim() || null,
            section,
            tags: values.tags,
          })
        : await createBookmark({
            url,
            title: values.title.trim() || undefined,
            notes: values.notes.trim() || undefined,
            section,
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

  return (
    <form onSubmit={form.onSubmit((values) => void save(values))}>
      <Stack gap="sm">
        <TextInput
          label="URL"
          placeholder="https://…"
          data-autofocus
          {...form.getInputProps('url')}
        />
        <PreviewCard preview={preview} />
        <TextInput
          label="Title"
          placeholder={preview?.meta?.title ?? bookmark?.meta?.title ?? ''}
          {...form.getInputProps('title')}
        />
        <Textarea
          label="Notes"
          placeholder="Your notes about this link"
          autosize
          minRows={2}
          maxRows={6}
          {...form.getInputProps('notes')}
        />
        <Input.Wrapper label="Section" error={form.errors.section}>
          <SegmentedControl
            fullWidth
            data={SECTIONS.map((value) => ({
              value,
              label: SECTION_INFO[value].label,
            }))}
            value={form.values.section}
            onChange={(value) =>
              form.setFieldValue('section', value as Section)
            }
          />
        </Input.Wrapper>
        <TagPicker
          allTags={
            form.values.section
              ? sectionTags[form.values.section]
              : [...new Set(Object.values(sectionTags).flat())]
          }
          value={form.values.tags}
          onChange={(tags) => form.setFieldValue('tags', tags)}
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
  sectionTags,
  defaultSection,
  onClose,
  onSaved,
}: {
  opened: boolean;
  bookmark?: Bookmark;
  /** Tags already used in each section, offered as suggestions. */
  sectionTags: Record<Section, string[]>;
  defaultSection?: Section;
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
          sectionTags={sectionTags}
          defaultSection={defaultSection}
          onSaved={onSaved}
          onCancel={onClose}
        />
      )}
    </Modal>
  );
}
