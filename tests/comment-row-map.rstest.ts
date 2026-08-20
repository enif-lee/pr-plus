/**
 * mapCommentsToRowIndices — one-pass indexes (shipped comment-nav).
 */
import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildCommentRowLookup,
  findMappedCommentIndexForJump,
  mapCommentsToRowIndices,
  shouldFollowThreadRelocateOnExpand,
} from '../src/modal/lib/comment-nav.ts';

const root = resolve(__dirname, '..');

/** Multi-file virtual rows with headers, diff lines, and inline comments. */
function multiFileRows() {
  return [
    { kind: 'file-header', filePath: 'a.ts', rowIndex: 0 },
    {
      kind: 'diff-line',
      filePath: 'a.ts',
      newLine: 10,
      oldLine: 10,
      rowIndex: 1,
    },
    {
      kind: 'inline-comment',
      filePath: 'a.ts',
      commentId: 101,
      newLine: 10,
      oldLine: 10,
      rowIndex: 2,
    },
    {
      kind: 'diff-line',
      filePath: 'a.ts',
      newLine: 11,
      oldLine: 11,
      rowIndex: 3,
    },
    { kind: 'file-header', filePath: 'b.ts', rowIndex: 4 },
    {
      kind: 'diff-line',
      filePath: 'b.ts',
      newLine: 5,
      oldLine: 5,
      rowIndex: 5,
    },
    {
      kind: 'inline-comment',
      filePath: 'b.ts',
      commentId: 202,
      newLine: 5,
      oldLine: null,
      rowIndex: 6,
    },
    {
      kind: 'diff-line',
      filePath: 'b.ts',
      newLine: null,
      oldLine: 20,
      rowIndex: 7,
    },
    // LEFT-side line for outdated-style match
    {
      kind: 'diff-line',
      filePath: 'b.ts',
      newLine: 21,
      oldLine: 21,
      rowIndex: 8,
    },
    // Collapsed-only file: header only
    { kind: 'file-header', filePath: 'c.ts', rowIndex: 9 },
  ];
}

describe('buildCommentRowLookup + mapCommentsToRowIndices', () => {
  test('maps multi-file roots to inline-comment or line/header indices', () => {
    const rows = multiFileRows();
    const comments = [
      { id: 101, path: 'a.ts', line: 10, side: 'RIGHT', body: 'on a' },
      { id: 202, path: 'b.ts', line: 5, side: 'RIGHT', body: 'on b' },
      // no dedicated comment row — should land on matching diff-line
      { id: 303, path: 'a.ts', line: 11, side: 'RIGHT', body: 'line only' },
      // LEFT side
      { id: 404, path: 'b.ts', line: 20, side: 'LEFT', body: 'left' },
      // collapsed file → header
      { id: 505, path: 'c.ts', line: 1, side: 'RIGHT', body: 'collapsed' },
    ];
    const mapped = mapCommentsToRowIndices(comments, rows);
    const byId = Object.fromEntries(
      mapped.map((c) => [String(c.id), c.rowIndex])
    );
    expect(byId['101']).toBe(2); // exact inline-comment
    expect(byId['202']).toBe(6);
    expect(byId['303']).toBe(3); // diff-line 11
    expect(byId['404']).toBe(7); // LEFT oldLine 20
    expect(byId['505']).toBe(9); // file-header c.ts
  });

  test('prefers inline-comment row over bare diff-line when both exist', () => {
    const rows = multiFileRows();
    // Comment at a.ts:10 has both line row 1 and comment row 2
    const mapped = mapCommentsToRowIndices(
      [{ id: 101, path: 'a.ts', line: 10, side: 'RIGHT' }],
      rows
    );
    expect(mapped[0].rowIndex).toBe(2);
  });

  test('lookup indexes are one-pass (size tracks row kinds)', () => {
    const rows = multiFileRows();
    const idx = buildCommentRowLookup(rows);
    expect(idx.byCommentId.get('101')).toBe(2);
    expect(idx.byCommentId.get('202')).toBe(6);
    expect(idx.fileHeaderByPath.get('c.ts')).toBe(9);
    const z = '\u0000';
    expect(idx.byPathSideLine.get(`a.ts${z}RIGHT${z}10`)).toBe(1);
    expect(idx.byPathLineCommentId.get(`a.ts${z}10${z}101`)).toBe(2);
  });

  test('empty / missing virtualRows does not throw', () => {
    expect(mapCommentsToRowIndices([{ id: 1, path: 'x' }], null)).toEqual([
      expect.objectContaining({ id: 1, rowIndex: undefined }),
    ]);
    expect(mapCommentsToRowIndices([], multiFileRows())).toEqual([]);
  });
});

describe('mapper structure (no per-root full-row nested scans)', () => {
  test('shipped source builds lookup once then O(1) map', () => {
    const src = readFileSync(
      resolve(root, 'src/modal/lib/comment-nav.ts'),
      'utf8'
    );
    // Function body of mapCommentsToRowIndices must call buildCommentRowLookup
    expect(src).toMatch(/export function buildCommentRowLookup/);
    expect(src).toMatch(/buildCommentRowLookup\(virtualRows\)/);
    // Nested full scans of virtualRows inside map callback must not return
    const mapStart = src.indexOf('export function mapCommentsToRowIndices');
    const mapEnd = src.indexOf('\nexport function', mapStart + 10);
    const body = src.slice(mapStart, mapEnd > 0 ? mapEnd : undefined);
    // No nested `for (const row of virtualRows)` in the mapper itself
    expect(body).not.toMatch(/for\s*\(\s*const\s+row\s+of\s+virtualRows\s*\)/);
    // Exactly one lookup build call
    const builds = body.match(/buildCommentRowLookup\(/g) || [];
    expect(builds.length).toBe(1);
  });
});

describe('follow relocate after expand of no-line threads', () => {
  test('shouldFollowThreadRelocateOnExpand: shells without line, not file-level', () => {
    expect(
      shouldFollowThreadRelocateOnExpand({
        id: 'shell:PRRT_1',
        path: 'a.py',
        line: null,
        threadNodeId: 'PRRT_1',
      })
    ).toBe(true);
    expect(
      shouldFollowThreadRelocateOnExpand({
        id: 9,
        path: 'a.py',
        subjectType: 'file',
        line: null,
      })
    ).toBe(false);
    expect(
      shouldFollowThreadRelocateOnExpand({
        id: 9,
        path: 'a.py',
        originalLine: 431,
        line: null,
      })
    ).toBe(false);
  });

  test('findMappedCommentIndexForJump matches shell id → numeric + threadNodeId', () => {
    const mapped = [
      { id: 42, threadNodeId: 'PRRT_1', rowIndex: 18, path: 'a.py' },
      { id: 99, threadNodeId: 'PRRT_2', rowIndex: 40, path: 'b.py' },
    ];
    expect(
      findMappedCommentIndexForJump(mapped, {
        commentId: 'shell:PRRT_1',
        threadNodeId: 'PRRT_1',
      })
    ).toBe(0);
    expect(
      findMappedCommentIndexForJump(mapped, {
        commentId: 99,
        threadNodeId: 'PRRT_2',
      })
    ).toBe(1);
    expect(
      findMappedCommentIndexForJump(mapped, {
        commentId: 'missing',
        threadNodeId: 'PRRT_NO',
      })
    ).toBe(-1);
  });

  test('expand queues waitUntilLoaded jump; finish waits for commentsLoaded', () => {
    const gap = readFileSync(
      resolve(root, 'src/modal/hooks/useThreadCommentsAndGap.ts'),
      'utf8'
    );
    expect(gap).toMatch(/shouldFollowThreadRelocateOnExpand/);
    expect(gap).toMatch(/waitUntilLoaded:\s*true/);
    const nav = readFileSync(
      resolve(root, 'src/modal/hooks/useDiffConversationNav.ts'),
      'utf8'
    );
    expect(nav).toMatch(/findMappedCommentIndexForJump/);
    expect(nav).toMatch(/waitUntilLoaded/);
    expect(nav).toMatch(/commentsLoaded !== true/);
  });
});
