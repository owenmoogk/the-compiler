import { z } from 'zod';

import { normalizeTag, normalizeTags, TAG_PATTERN } from './tags';

export const httpUrl = z.url({
  protocol: /^https?$/,
  error: 'Must be an http(s) URL',
});

const isoDate = z.iso.datetime({ offset: true });

// Treats '' and whitespace as "not set", so clearing a field in a form removes it.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

/** Everything here is written by the metadata scraper when a link is added or its URL changes. */
export const metaSchema = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  siteName: z.string().max(200).optional(),
  author: z.string().max(200).optional(),
  favicon: httpUrl.optional(),
  image: httpUrl.optional(),
  fetchedAt: isoDate,
  error: z.string().max(500).optional(),
});

export const tagSchema = z.string().max(40).regex(TAG_PATTERN);
export const tagListSchema = z.array(tagSchema).max(30);

/** Tags as typed by a person; normalized to kebab-case, deduplicated. */
const tagInputSchema = z
  .array(z.string().max(60))
  .max(30)
  .transform(normalizeTags)
  .pipe(tagListSchema);

export const bookmarkSchema = z.object({
  id: z.string().regex(/^[\w-]{6,32}$/),
  url: httpUrl,
  title: optionalText(300),
  notes: optionalText(5000),
  tags: tagListSchema,
  addedAt: isoDate,
  meta: metaSchema.optional(),
});

export const bookmarksFileSchema = z.object({
  version: z.literal(1),
  bookmarks: z.array(bookmarkSchema),
});

/** Body of POST /api/bookmarks. */
export const bookmarkCreateSchema = z.object({
  url: httpUrl,
  title: optionalText(300),
  notes: optionalText(5000),
  tags: tagInputSchema.default([]),
  meta: metaSchema.optional(),
});

/** Body of PATCH /api/bookmarks/:id. A null clears the field. */
export const bookmarkPatchSchema = z.object({
  url: httpUrl.optional(),
  title: optionalText(300).nullable(),
  notes: optionalText(5000).nullable(),
  tags: tagInputSchema.optional(),
});

export const metadataRequestSchema = z.object({ url: httpUrl });

export const renameTagSchema = z.object({
  to: z.string().max(60).transform(normalizeTag).pipe(tagSchema),
});

export type BookmarkMeta = z.infer<typeof metaSchema>;
export type Bookmark = z.infer<typeof bookmarkSchema>;
export type BookmarksFile = z.infer<typeof bookmarksFileSchema>;
export type BookmarkCreate = z.input<typeof bookmarkCreateSchema>;
export type BookmarkPatch = z.input<typeof bookmarkPatchSchema>;

export type Me = {
  login: string;
  name?: string;
  avatarUrl: string;
  canEdit: boolean;
};

export function emptyBookmarksFile(): BookmarksFile {
  return { version: 1, bookmarks: [] };
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function displayTitle(bookmark: Bookmark): string {
  return bookmark.title ?? bookmark.meta?.title ?? hostnameOf(bookmark.url);
}

export function displayDescription(bookmark: Bookmark): string | undefined {
  return bookmark.notes ?? bookmark.meta?.description;
}

/** Compares URLs loosely so the same page is not saved twice. */
export function sameUrl(a: string, b: string): boolean {
  const normalize = (raw: string) => {
    try {
      const url = new URL(raw);
      url.hash = '';
      const host = url.hostname.replace(/^www\./, '');
      const path = url.pathname.replace(/\/+$/, '');
      return `${host}${path}${url.search}`;
    } catch {
      return raw;
    }
  };

  return normalize(a) === normalize(b);
}
