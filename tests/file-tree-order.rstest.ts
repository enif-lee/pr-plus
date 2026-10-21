/**
 * File explorer / Diff list: natural (numeric) name order at each tree level.
 */
import { describe, expect, test } from '@rstest/core';
import {
  buildNestedFileTree,
  collectDirPaths,
  compareFileTreeNames,
  filesInTreeOrder,
  flattenVisibleTree,
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
    expect(tree[0].name).toBe('db/migration');
    const names = tree[0].children.map((n: any) => n.name);
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

describe('buildNestedFileTree compacts single-child dir chains', () => {
  test('folds a dir chain down to the first branching dir', () => {
    const files = [
      { filename: 'src/main/java/io/acme/dev/package/to/A.java' },
      { filename: 'src/main/java/io/acme/dev/package/to/B.java' },
    ];
    const tree = buildNestedFileTree(files);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      type: 'dir',
      name: 'src/main/java/io/acme/dev/package/to',
      path: 'src/main/java/io/acme/dev/package/to',
    });
    expect(tree[0].children.map((n: any) => n.name)).toEqual(['A.java', 'B.java']);
  });

  test('stops at a dir with several children and compacts below it', () => {
    const files = [
      { filename: 'app/io/acme/dev/package/to/A.kt' },
      { filename: 'app/io/acme/web/Page.kt' },
      { filename: 'README.md' },
    ];
    const tree = buildNestedFileTree(files);
    expect(tree.map((n: any) => `${n.type}:${n.name}`)).toEqual([
      'dir:app/io/acme',
      'file:README.md',
    ]);
    const acme = tree[0];
    expect(acme.path).toBe('app/io/acme');
    expect(acme.children.map((n: any) => `${n.type}:${n.name}:${n.path}`)).toEqual([
      'dir:dev/package/to:app/io/acme/dev/package/to',
      'dir:web:app/io/acme/web',
    ]);
  });

  test('a lone file is never folded into the dir label', () => {
    const tree = buildNestedFileTree([{ filename: 'docs/guide/intro.md' }]);
    expect(tree[0].name).toBe('docs/guide');
    expect(tree[0].children).toEqual([
      expect.objectContaining({ type: 'file', name: 'intro.md' }),
    ]);
  });

  test('flattenVisibleTree uses the folded path as the expand key', () => {
    const tree = buildNestedFileTree([
      { filename: 'a/b/c/x.ts' },
      { filename: 'a/b/c/y.ts' },
    ]);
    expect(flattenVisibleTree(tree, new Set()).map((n: any) => n.name)).toEqual([
      'a/b/c',
    ]);
    expect(
      flattenVisibleTree(tree, new Set(['a/b/c'])).map((n: any) => n.name)
    ).toEqual(['a/b/c', 'x.ts', 'y.ts']);
    expect([...collectDirPaths(tree)]).toEqual(['a/b/c']);
  });

  test('tree order for Diff / step-nav is unchanged by folding', () => {
    const files = [
      { filename: 'z/only/deep/f.ts' },
      { filename: 'a/x.ts' },
      { filename: 'a/sub/one/y.ts' },
    ];
    expect(filesInTreeOrder(files).map((f: any) => f.filename)).toEqual([
      'a/sub/one/y.ts',
      'a/x.ts',
      'z/only/deep/f.ts',
    ]);
  });
});
