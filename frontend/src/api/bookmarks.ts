import type { BookmarkCreate, BookmarkPatch } from '@compiler/shared';
import { bookmarksFileSchema } from '@compiler/shared';

import { parseResponse } from 'hono/client';

import { client } from './client';

const bookmarks = client.api.bookmarks;
/** One bookmark: /api/bookmarks/:id (pass the id as `param: { id }`). */
const bookmark = client.api.bookmarks[':id'];
const tag = client.api.tags[':tag'];

/** The list, from the server (the only copy). */
export async function fetchBookmarks() {
  return bookmarksFileSchema.parse(await parseResponse(bookmarks.$get()));
}

export async function previewMetadata(url: string) {
  return parseResponse(client.api.metadata.$post({ json: { url } }));
}

export async function createBookmark(input: BookmarkCreate) {
  return parseResponse(bookmarks.$post({ json: input }));
}

export async function updateBookmark(id: string, patch: BookmarkPatch) {
  return parseResponse(bookmark.$patch({ param: { id }, json: patch }));
}

export async function deleteBookmark(id: string) {
  return parseResponse(bookmark.$delete({ param: { id } }));
}

export async function deleteBookmarks(ids: string[]) {
  return parseResponse(bookmarks.delete.$post({ json: { ids } }));
}

export async function renameTag(from: string, to: string) {
  return parseResponse(tag.$put({ param: { tag: from }, json: { to } }));
}
