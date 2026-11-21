/**
 * One-time migration from the old CRA app's public/data.json to bookmarks.json.
 *
 *   yarn migrate --from old-data.json --out ../bookmarks/bookmarks.json [--git-dir .] [--scrape]
 *
 * - description -> notes, category -> one kebab-case tag
 * - addedAt: the first commit in --git-dir whose diff mentions the URL, else now
 * - --scrape fills in favicon/title/etc. for every link
 */
import type { Bookmark } from '@compiler/shared';
import { bookmarksFileSchema, normalizeTag } from '@compiler/shared';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { nanoid } from 'nanoid';

import { mapLimit } from '../src/http';
import { scrapeMetadata } from '../src/metadata';

type OldEntry = {
  title: string;
  description?: string;
  category?: string;
  link: string;
};

const { values } = parseArgs({
  options: {
    from: { type: 'string' },
    out: { type: 'string' },
    'git-dir': { type: 'string' },
    scrape: { type: 'boolean', default: false },
  },
});

if (!values.from || !values.out) {
  console.error(
    'usage: yarn migrate --from data.json --out bookmarks.json [--git-dir repo] [--scrape]'
  );
  process.exit(2);
}

const old = JSON.parse(readFileSync(values.from, 'utf8')) as OldEntry[];

function firstSeen(url: string): string | undefined {
  if (!values['git-dir']) return undefined;
  try {
    const out = execFileSync(
      'git',
      ['log', '--all', '--reverse', '--format=%aI', '-S', url],
      { cwd: values['git-dir'], encoding: 'utf8' }
    );
    const first = out.split('\n').find(Boolean);
    return first ? new Date(first).toISOString() : undefined;
  } catch {
    return undefined;
  }
}

const now = new Date().toISOString();
const bookmarks: Bookmark[] = old.map((entry) => {
  const tag = entry.category ? normalizeTag(entry.category) : '';
  return {
    id: nanoid(10),
    url: entry.link,
    title: entry.title.trim() || undefined,
    notes: entry.description?.trim() || undefined,
    tags: tag ? [tag] : [],
    addedAt: firstSeen(entry.link) ?? now,
  };
});

if (values.scrape) {
  let done = 0;
  await mapLimit(bookmarks, 4, async (bookmark) => {
    bookmark.meta = await scrapeMetadata(bookmark.url);
    done++;
    const status = bookmark.meta.error ? `! ${bookmark.meta.error}` : 'ok';
    console.log(`[${done}/${bookmarks.length}] ${bookmark.url} ${status}`);
  });
}

const file = bookmarksFileSchema.parse({ version: 1, bookmarks });
writeFileSync(values.out, `${JSON.stringify(file, null, 2)}\n`);
console.log(`Wrote ${bookmarks.length} bookmarks to ${values.out}`);
