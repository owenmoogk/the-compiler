import type {
  Bookmark,
  BookmarkCreate,
  BookmarkMeta,
  BookmarkPatch,
  BookmarksFile,
} from '@compiler/shared';
import { bookmarksFileSchema } from '@compiler/shared';

import { PUBLIC_DATA_URL } from '@global/config';

import { api } from './client';

type FileResponse = { file: BookmarksFile };
type BookmarkResponse = FileResponse & { bookmark: Bookmark };

export async function fetchPublicBookmarks(): Promise<BookmarksFile> {
  const res = await fetch(PUBLIC_DATA_URL, { cache: 'no-cache' });
  if (res.status === 404) return { version: 1, bookmarks: [] };
  if (!res.ok) throw new Error(`Could not load bookmarks (${res.status})`);
  return bookmarksFileSchema.parse(await res.json());
}

/** The backend's copy, which is the source of truth. */
export async function fetchBookmarks(): Promise<BookmarksFile> {
  return bookmarksFileSchema.parse(await api('/api/bookmarks'));
}

export async function previewMetadata(url: string): Promise<BookmarkMeta> {
  return api('/api/metadata', { method: 'POST', body: { url } });
}

export async function createBookmark(
  input: BookmarkCreate
): Promise<BookmarkResponse> {
  return api('/api/bookmarks', { method: 'POST', body: input });
}

export async function updateBookmark(
  id: string,
  patch: BookmarkPatch
): Promise<BookmarkResponse> {
  return api(`/api/bookmarks/${id}`, { method: 'PATCH', body: patch });
}

export async function deleteBookmark(id: string): Promise<FileResponse> {
  return api(`/api/bookmarks/${id}`, { method: 'DELETE' });
}

export async function deleteBookmarks(
  ids: string[]
): Promise<FileResponse & { deleted: number }> {
  return api('/api/bookmarks/delete', { method: 'POST', body: { ids } });
}

export async function renameTag(
  from: string,
  to: string
): Promise<FileResponse> {
  return api(`/api/tags/${encodeURIComponent(from)}`, {
    method: 'PUT',
    body: { to },
  });
}
