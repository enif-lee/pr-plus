/**
 * File explorer / Diff list: natural (numeric) name order at each tree level.
 */
import { describe, expect, test } from '@rstest/core';
import {
  buildNestedFileTree,
  compareFileTreeNames,
  filesInTreeOrder,
} from '../src/modal/lib/file-tree.ts';

describe('compareFileTreeNames (numeric)', () => {
  test('version prefixes: V2 before V10', () => {
    const names = [
      'V1__init.sql',
      'V10__sentry.sql',
      'V2__kakao.sql',
      'V11__http.sql',
    ];
    expect([...names].sort(compareFileTreeNames)).toEqual([
      'V1__init.sql',
      'V2__kakao.sql',
      'V10__sentry.sql',
      'V11__http.sql',
    ]);
  });

  test('plain files: file2 before file10', () => {
    const names = ['file10.ts', 'file2.ts', 'file1.ts'];
    expect([...names].sort(compareFileTreeNames)).toEqual([
      'file1.ts',
      'file2.ts',
      'file10.ts',
    ]);
  });
});

describe('buildNestedFileTree / filesInTreeOrder', () => {
  test('migration files sort by number, not lexicographic', () => {
    const files = [
      { filename: 'db/migration/V1__init.sql' },
      { filename: 'db/migration/V10__sentry_poller.sql' },
      { filename: 'db/migration/V2__kakao_contact.sql' },
      { filename: 'db/migration/V12__db_prober.sql' },
    ];
    const tree = buildNestedFileTree(files);
    expect(tree[0].name).toBe('db');
    const names = tree[0].children[0].children.map((n: any) => n.name);
    expect(names).toEqual([
      'V1__init.sql',
      'V2__kakao_contact.sql',
      'V10__sentry_poller.sql',
      'V12__db_prober.sql',
    ]);
    expect(
      filesInTreeOrder(files).map((f: any) => f.filename)
    ).toEqual([
      'db/migration/V1__init.sql',
      'db/migration/V2__kakao_contact.sql',
      'db/migration/V10__sentry_poller.sql',
      'db/migration/V12__db_prober.sql',
    ]);
  });

  test('dirs-first is unchanged; sibling files still natural-sort', () => {
    const files = [
      { filename: 'src/file10.ts' },
      { filename: 'src/file2.ts' },
      { filename: 'src/nested/a.ts' },
    ];
    const src = buildNestedFileTree(files)[0];
    expect(src.children.map((n: any) => `${n.type}:${n.name}`)).toEqual([
      'dir:nested',
      'file:file2.ts',
      'file:file10.ts',
    ]);
  });
});
