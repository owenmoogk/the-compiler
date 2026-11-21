import type { Bookmark, Section } from '@compiler/shared';
import {
  filterBookmarks,
  SECTION_INFO,
  SECTIONS,
  sectionOf,
} from '@compiler/shared';
import { SegmentedControl } from '@mantine/core';
import { useMemo } from 'react';

import type { useView } from '@global/useView';

/**
 * Curiosities / Creations / Tools. Each shows how many links it holds, or,
 * while searching, how many of them match (so hits elsewhere aren't missed).
 */
export default function SectionTabs({
  viewParams,
  bookmarks,
  query,
}: {
  viewParams: ReturnType<typeof useView>;
  bookmarks: readonly Bookmark[];
  query: string;
}) {
  const { view, setSection } = viewParams;
  const data = useMemo(() => {
    const counts = new Map<Section, number>();
    for (const bookmark of filterBookmarks(bookmarks, { query, tags: [] })) {
      const section = sectionOf(bookmark);
      counts.set(section, (counts.get(section) ?? 0) + 1);
    }
    return SECTIONS.map((section) => ({
      value: section,
      label: `${SECTION_INFO[section].label} ${String(counts.get(section) ?? 0)}`,
    }));
  }, [bookmarks, query]);

  return (
    <SegmentedControl
      data={data}
      value={view.section}
      onChange={(value) => setSection(value as Section)}
      fullWidth
      aria-label="Section"
    />
  );
}
