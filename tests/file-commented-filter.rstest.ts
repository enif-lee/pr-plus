/**
 * File explorer "Commented" chip — paths with any review thread.
 */
import { describe, expect, test } from '@rstest/core';
import { filterFilesCommentedOnly } from '../src/modal/lib/file-tree.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

describe('filterFilesCommentedOnly', () => {
  const files = [
    { filename: 'a.ts' },
    { filename: 'b.ts' },
    { filename: 'c.ts' },
  ];
  const counts = new Map([
    ['a.ts', 2],
    ['c.ts', 1],
  ]);

  test('off returns all files', () => {
    expect(
      filterFilesCommentedOnly(files, counts, false).map((f) => f.filename)
    ).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  test('on keeps only paths with thread counts', () => {
    expect(
      filterFilesCommentedOnly(files, counts, true).map((f) => f.filename)
    ).toEqual(['a.ts', 'c.ts']);
  });
});

describe('product wiring', () => {
  test('FolderFileTree exposes Commented chip next to Unread', () => {
    const t = readFileSync(
      resolve(root, 'src/modal/views/diff/FolderFileTree.tsx'),
      'utf8'
    );
    expect(t).toMatch(/Unread/);
    expect(t).toMatch(/Commented/);
    expect(t).toMatch(/commentedOnly/);
    expect(t).toMatch(/filterFilesCommentedOnly/);
  });

  test('App displayFiles uses commented filter not review-status file scope', () => {
    const app = readFileSync(
      resolve(root, 'src/modal/app/PrModalApp.impl.tsx'),
      'utf8'
    );
    expect(app).toMatch(/filterFilesCommentedOnly/);
    expect(app).toMatch(/fileCommentedOnly/);
    expect(app).not.toMatch(/filterFilesByDiffReviewFilter\(/);
  });
});
