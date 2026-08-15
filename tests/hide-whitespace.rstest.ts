/**
 * Hide-whitespace pure filter — drives shipped helpers.
 */
import { describe, expect, test } from '@rstest/core';
import {
  applyHideWhitespaceToFiles,
  filterPatchHideWhitespace,
  isChangeBlockWhitespaceOnly,
  isWhitespaceOnlyChange,
} from '../src/modal/lib/hide-whitespace';

describe('isWhitespaceOnlyChange', () => {
  test('true when only whitespace differs', () => {
    expect(isWhitespaceOnlyChange('foo  bar', 'foo bar')).toBe(true);
    expect(isWhitespaceOnlyChange('\tconst x', 'const x')).toBe(true);
  });
  test('false when content differs', () => {
    expect(isWhitespaceOnlyChange('foo', 'bar')).toBe(false);
    expect(isWhitespaceOnlyChange('a b', 'ab c')).toBe(false);
  });
});

describe('filterPatchHideWhitespace', () => {
  test('drops whitespace-only rewrite hunks', () => {
    const patch = [
      '@@ -1,3 +1,3 @@',
      ' context',
      '-foo  bar',
      '+foo bar',
      ' tail',
    ].join('\n');
    const out = filterPatchHideWhitespace(patch);
    expect(out).not.toContain('-foo');
    expect(out).not.toContain('+foo');
    // Entire hunk was only ws change → hunk header gone
    expect(out.includes('@@')).toBe(false);
  });

  test('keeps real content changes', () => {
    const patch = [
      '@@ -1,2 +1,2 @@',
      '-return a;',
      '+return b;',
    ].join('\n');
    const out = filterPatchHideWhitespace(patch);
    expect(out).toContain('-return a;');
    expect(out).toContain('+return b;');
    expect(out).toContain('@@');
  });

  test('keeps mixed hunks but strips ws-only pairs', () => {
    const patch = [
      '@@ -1,4 +1,4 @@',
      '-x  y',
      '+x y',
      '-real',
      '+REAL',
    ].join('\n');
    const out = filterPatchHideWhitespace(patch);
    expect(out).not.toMatch(/-x\s+y/);
    expect(out).toContain('-real');
    expect(out).toContain('+REAL');
  });

  test('disabled path returns same files reference', () => {
    const files = [{ filename: 'a.ts', patch: '@@ -1 +1 @@\n-a\n+b\n' }];
    expect(applyHideWhitespaceToFiles(files, false)).toBe(files);
  });

  test('applyHideWhitespaceToFiles filters patches when enabled', () => {
    const files = [
      {
        filename: 'a.ts',
        patch: '@@ -1,2 +1,2 @@\n-a  b\n+a b\n',
      },
      {
        filename: 'b.ts',
        patch: '@@ -1 +1 @@\n-old\n+new\n',
      },
    ];
    const out = applyHideWhitespaceToFiles(files, true);
    expect(out).not.toBe(files);
    expect(out[0].patch.includes('@@')).toBe(false);
    expect(out[1].patch).toContain('-old');
    expect(out[1].patch).toContain('+new');
  });
});

describe('isChangeBlockWhitespaceOnly', () => {
  test('paired equal-length', () => {
    expect(isChangeBlockWhitespaceOnly(['-a  b'], ['+a b'])).toBe(true);
    expect(isChangeBlockWhitespaceOnly(['-a'], ['+b'])).toBe(false);
  });
});
