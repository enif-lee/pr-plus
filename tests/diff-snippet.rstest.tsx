import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { describe, expect, test } from '@rstest/core';
import { parsePatchLines, extractDiffSnippet, snippetForComment } from '../src/modal/lib/diff-snippet';
import { mapReviewComment, mapGraphqlReviewCommentNode } from '../src/fetch/mappers';
import { buildThreadEntry } from '../src/modal/lib/conversation-timeline-build';
import { DiffSnippetView } from '../src/modal/views/conversation/DiffSnippetView';

// Shape observed on GitHub conversation: a single-line comment shows four
// unified rows ending at its anchor; a range shows only the selected rows.
const patch = '@@ -8,6 +8,6 @@\n eight\n nine\n ten\n eleven\n twelve\n-old\n+new';

describe('GitHub conversation snippet bounds', () => {
  test('single-line preview ends at anchor, with at most three preceding rows', () => {
    const snippet = extractDiffSnippet(patch, { line: 13, side: 'RIGHT' });
    expect(snippet?.lines.map(l => [l.oldLine, l.newLine, l.text])).toEqual([
      [11, 11, ' eleven'], [12, 12, ' twelve'], [13, null, '-old'], [null, 13, '+new'],
    ]);
    expect(extractDiffSnippet(patch, { line: 10 })?.lines.at(-1)?.newLine).toBe(10);
  });

  test('multi-line preview includes exactly its range without neighboring context', () => {
    expect(extractDiffSnippet(patch, { startLine: 11, line: 13 })?.lines.map(l => l.text))
      .toEqual([' eleven', ' twelve', '-old', '+new']);
    expect(extractDiffSnippet(patch, { startLine: 13, line: 13 })?.lines.map(l => l.text))
      .toEqual(['+new']);
  });

  test('LEFT anchors a deletion, never an unrelated RIGHT line or a fabricated last row', () => {
    const deletion = extractDiffSnippet(patch, { line: 13, side: 'LEFT' });
    expect(deletion?.lines.at(-1)?.text).toBe('-old');
    expect(extractDiffSnippet('@@ -5 +10 @@\n+new', { line: 10, side: 'LEFT' })).toBeNull();
    expect(snippetForComment({ diffHunk: patch, line: 999 }, [])).toBeNull();
    expect(snippetForComment({ diffHunk: patch }, [])).toBeNull();
  });

  test('short hunks retain the header and file comments have no line snippet', () => {
    const comment = { diffHunk: '@@ -0,0 +1 @@\n+hello', line: 1 };
    expect(snippetForComment(comment, [])?.lines.map(l => l.type)).toEqual(['hunk', 'add']);
    expect(snippetForComment({ ...comment, subjectType: 'file' }, [])).toBeNull();
  });

  test('context cannot cross a hunk boundary', () => {
    const hunks = '@@ -1 +1 @@\n a\n@@ -20 +20 @@\n b';
    expect(extractDiffSnippet(hunks, { line: 20 })?.lines.map(l => l.text))
      .toEqual(['@@ -20 +20 @@', ' b']);
    expect(extractDiffSnippet(hunks, { startLine: 1, line: 20 })).toBeNull();
  });

  test('parses leading ++/-- code, ignores no-newline markers and terminal newline', () => {
    const lines = parsePatchLines('--- a/file\n+++ b/file\n@@ -1,2 +1,2 @@\n---value\n+++value\n\\ No newline at end of file\n next\n');
    expect(lines.map(l => [l.type, l.oldLine, l.newLine])).toEqual([
      ['hunk', null, null], ['del', 1, null], ['add', null, 1], ['context', 2, 2],
    ]);
  });

  test('REST and GraphQL keep original range coordinates through the timeline', () => {
    const diffHunk = '@@ -1,3 +1,3 @@\n a\n b\n c';
    const rest = mapReviewComment({ id: 1, path: 'file', line: 103, start_line: 102,
      original_line: 3, original_start_line: 2, diff_hunk: diffHunk });
    const graphql = mapGraphqlReviewCommentNode({ databaseId: 1, path: 'file', line: 103,
      startLine: 102, originalLine: 3, originalStartLine: 2, diffHunk });
    for (const comment of [rest, graphql]) {
      const thread = buildThreadEntry(comment, new Map(), snippetForComment, [], '', 0);
      expect(thread.snippet.lines.map(l => l.text)).toEqual([' b', ' c']);
      expect(thread.snippet.endLine).toBe(3);
    }
  });
});

test('rendered snippet has old/new gutters, literal diff signs, and no yellow hit class', () => {
  const snippet = extractDiffSnippet(patch, { line: 13 });
  const html = renderToStaticMarkup(<DiffSnippetView snippet={snippet} />);
  const doc = new JSDOM(html).window.document;
  const rows = Array.from(doc.querySelectorAll('tr'));
  expect(rows.map(row => Array.from(row.children).map(cell => cell.textContent))).toEqual([
    ['11', '11', ' eleven'], ['12', '12', ' twelve'], ['13', '', '-old'], ['', '13', '+new'],
  ]);
  expect(doc.querySelector('table')?.getAttribute('aria-label')).toBe('Code context');
  expect(html).not.toContain('--hit');
  expect(html).not.toContain('<pre');
});
