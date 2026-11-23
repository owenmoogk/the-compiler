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

/** A tag as entered through the app (see normalizeTag). */
export const tagSchema = z.string().max(40).regex(TAG_PATTERN);
export const tagListSchema = z.array(tagSchema).max(30);

/**
 * Tags as stored in bookmarks.json. Looser than tagSchema so an older file
 * (e.g. "web-development") still loads; the server normalizes it on startup.
 */
export const storedTagSchema = z.string().min(1).max(60);

/** Tags as typed by a person; normalized to Title Case, deduplicated. */
const tagInputSchema = z
  .array(z.string().max(60))
  .max(30)
  .transform(normalizeTags)
  .pipe(tagListSchema);

/**
 * Every link sits in exactly one section; tags then say what it's about.
 * Ids are stored in bookmarks.json; labels are only for display.
 */
export const SECTIONS = ['curiosities', 'creations', 'tools'] as const;
export type Section = (typeof SECTIONS)[number];
export const sectionSchema = z.enum(SECTIONS);

export const SECTION_INFO: Record<Section, { label: string; hint: string }> = {
  creations: { label: 'Creations', hint: 'Things people made' },
  curiosities: {
    label: 'Curiosities',
    hint: 'Things to read, watch or play with',
  },
  tools: { label: 'Tools', hint: 'Things to use' },
};

/** Where the page opens, and where a link saved before sections existed shows. */
export const DEFAULT_SECTION: Section = 'curiosities';

export function sectionOf(bookmark: { section?: Section }) {
  return bookmark.section ?? DEFAULT_SECTION;
}

export const bookmarkSchema = z.object({
  id: z.string().regex(/^[\w-]{6,32}$/),
  url: httpUrl,
  title: optionalText(300),
  notes: optionalText(5000),
  // Optional so files from before sections existed still load.
  section: sectionSchema.optional(),
  tags: z.array(storedTagSchema).max(30),
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
  section: sectionSchema,
  tags: tagInputSchema.default([]),
  meta: metaSchema.optional(),
});

/** Body of PATCH /api/bookmarks/:id. A null clears the field. */
export const bookmarkPatchSchema = z.object({
  url: httpUrl.optional(),
  title: optionalText(300).nullable(),
  notes: optionalText(5000).nullable(),
  section: sectionSchema.optional(),
  tags: tagInputSchema.optional(),
});

export const metadataRequestSchema = z.object({ url: httpUrl });

/** Several links deleted at once (one commit). */
export const deleteManySchema = z.object({
  ids: z.array(z.string().max(32)).min(1).max(1000),
});

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

export function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function displayTitle(bookmark: Bookmark) {
  return bookmark.title ?? bookmark.meta?.title ?? hostnameOf(bookmark.url);
}

export function displayDescription(bookmark: Bookmark) {
  return bookmark.notes ?? bookmark.meta?.description;
}

/** Compares URLs loosely so the same page is not saved twice. */
export function sameUrl(a: string, b: string) {
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
