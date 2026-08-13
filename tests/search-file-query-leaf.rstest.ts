/**
 * Phase 9 F: searchQuery / fileQuery stay ROOT_FORBIDDEN on the shell.
 * Find scan and file-tree name filter must follow the live store, not a
 * one-shot getState() snapshot stuffed into shellBag / displayFiles.
 */
import { describe, expect, test, beforeEach } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { filterFilesByQuery } from '../src/modal/lib/review-threads-group';
import { useModalStore } from '../src/modal/store/modal-store';

const root = path.join(__dirname, '..');
function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('file-tree name query (shipped filterFilesByQuery)', () => {
  const files = [
    { filename: 'src/modal/app/PrModalShell.tsx' },
    { filename: 'src/modal/hooks/useDiffConversationNav.ts' },
    { filename: 'src/fetch/fetch-api.ts' },
  ];

  test('narrows paths by substring (tree-local query)', () => {
    const hits = filterFilesByQuery(files, 'useDiff');
    expect(hits.map((f) => f.filename)).toEqual([
      'src/modal/hooks/useDiffConversationNav.ts',
    ]);
  });

  test('parent ext/unread list + child query still narrows (no shell fileQuery)', () => {
    // Shell displayFiles no longer applies fileQuery. Tree receives the
    // ext-filtered list and must apply the live query itself.
    const fromParent = files.filter((f) =>
      String(f.filename).endsWith('.ts') || String(f.filename).endsWith('.tsx')
    );
    expect(fromParent).toHaveLength(3);
    const treeLocal = filterFilesByQuery(fromParent, 'fetch-api');
    expect(treeLocal.map((f) => f.filename)).toEqual(['src/fetch/fetch-api.ts']);
  });
});

describe('store searchQuery / fileQuery notify leaves only', () => {
  beforeEach(() => {
    useModalStore.getState().resetForClose();
  });

  test('setSearchQuery notifies search-group selector, not layoutMode', () => {
    let searchFires = 0;
    let layoutFires = 0;
    let prevQ = useModalStore.getState().searchQuery;
    let prevLayout = useModalStore.getState().layoutMode;
    const unsub = useModalStore.subscribe((s) => {
      if (!Object.is(s.searchQuery, prevQ)) {
        searchFires += 1;
        prevQ = s.searchQuery;
      }
      if (!Object.is(s.layoutMode, prevLayout)) {
        layoutFires += 1;
        prevLayout = s.layoutMode;
      }
    });
    useModalStore.getState().setSearchQuery('thread');
    useModalStore.getState().setSearchQuery('threads');
    unsub();
    expect(searchFires).toBe(2);
    expect(layoutFires).toBe(0);
    expect(useModalStore.getState().searchQuery).toBe('threads');
  });

  test('setFileQuery notifies file-nav selector, not layoutMode', () => {
    let fileFires = 0;
    let layoutFires = 0;
    let prevQ = useModalStore.getState().fileQuery;
    let prevLayout = useModalStore.getState().layoutMode;
    const unsub = useModalStore.subscribe((s) => {
      if (!Object.is(s.fileQuery, prevQ)) {
        fileFires += 1;
        prevQ = s.fileQuery;
      }
      if (!Object.is(s.layoutMode, prevLayout)) {
        layoutFires += 1;
        prevLayout = s.layoutMode;
      }
    });
    useModalStore.getState().setFileQuery('PrModal');
    useModalStore.getState().setFileQuery('PrModalShell');
    unsub();
    expect(fileFires).toBe(2);
    expect(layoutFires).toBe(0);
    expect(useModalStore.getState().fileQuery).toBe('PrModalShell');
  });
});

describe('wiring: live query is not a shell snapshot', () => {
  test('FolderFileTree applies filterFilesByQuery even when parentFiltersFiles', () => {
    const src = read('src/modal/views/diff/FolderFileTree.tsx');
    const queryCall = src.indexOf('filterFilesByQuery(list, fileQuery)');
    const parentGate = src.indexOf('if (!parentFiltersFiles)');
    expect(queryCall).toBeGreaterThan(0);
    expect(parentGate).toBeGreaterThan(0);
    expect(queryCall).toBeLessThan(parentGate);
  });

  test('Find scan watches store searchQuery (not shellBag snapshot deps)', () => {
    const src = read('src/modal/hooks/useDiffConversationNav.ts');
    expect(src).toMatch(/useModalStore\.subscribe/);
    expect(src).toMatch(/s\.searchQuery === prev\.searchQuery/);
    expect(src).toMatch(/useModalStore\.getState\(\)\.searchQuery/);
    const effectTail = src.slice(src.indexOf('runForQuery(String(useModalStore.getState().searchQuery'));
    expect(effectTail).not.toMatch(/searchQuery,\s*\n\s*searchDocs/);
  });

  test('PrModalShell displayFiles does not filter by fileQuery snapshot', () => {
    const src = read('src/modal/app/PrModalShell.tsx');
    expect(src).not.toMatch(
      /const searchQuery = useModalStore\.getState\(\)\.searchQuery/
    );
    expect(src).not.toMatch(
      /const fileQuery = useModalStore\.getState\(\)\.fileQuery/
    );
    expect(src).not.toMatch(/filterFilesByQuery\(list, fileQuery\)/);
  });
});
