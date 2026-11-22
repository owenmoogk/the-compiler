import type {
  Bookmark,
  BookmarkCreate,
  BookmarkMeta,
  BookmarkPatch,
  BookmarksFile,
} from '@compiler/shared';
import { bookmarksFileSchema } from '@compiler/shared';

import { api } from './client';

type FileResponse = { file: BookmarksFile };
type BookmarkResponse = FileResponse & { bookmark: Bookmark };

/** The list, from the server (the only copy). */
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
