/**
 * Split-mode intra-line word-diff: shipped ops + HTML path + CSS contrast.
 * Imports production helpers — no copy, mock, or reimplementation.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INTRA_LINE_DEL_CLASS,
  INTRA_LINE_INS_CLASS,
  applySplitIntraLineHtml,
  intraLineWordDiff,
} from '../src/modal/lib/intra-line-diff';
import { MD_DIFF_DEL_CLASS, MD_DIFF_INS_CLASS } from '../src/modal/lib/markdown-preview';
import { renderSearchableHtml } from '../src/modal/views/diff/VirtualDiffRows';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function cssRuleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : '';
}

function pairedRow(leftCode: string, rightCode: string) {
  return {
    lineType: 'change',
    leftType: 'del',
    rightType: 'add',
    leftCode,
    rightCode,
    split: true,
  };
}

function splitSideHtml(
  leftCode: string,
  rightCode: string,
  side: 'left' | 'right',
  searchQuery = ''
) {
  return renderSearchableHtml(
    side === 'left' ? leftCode : rightCode,
    'example.ts',
    searchQuery,
    pairedRow(leftCode, rightCode),
    null,
    0,
    side,
    false
  );
}

describe('intraLineWordDiff (shipped split-line transform)', () => {
  test('Hello world → Hello word: prefix unmarked; world del; word ins', () => {
    const ops = intraLineWordDiff('Hello world', 'Hello word');
    const del = ops.filter((op) => op.kind === 'del');
    const ins = ops.filter((op) => op.kind === 'ins');
    const eq = ops.filter((op) => op.kind === 'eq');

    expect(del).toEqual([{ kind: 'del', text: 'world' }]);
    expect(ins).toEqual([{ kind: 'ins', text: 'word' }]);
    expect(eq.some((op) => op.text.includes('Hello'))).toBe(true);
    expect(del.some((op) => op.text === 'l')).toBe(false);
    expect(ops).not.toEqual([{ kind: 'del', text: 'Hello world' }]);
    expect(ops).not.toEqual([
      { kind: 'del', text: 'Hello world' },
      { kind: 'ins', text: 'Hello word' },
    ]);
  });

  test('unchanged island: The cat sat on the mat vs The dog sat on the rug', () => {
    const ops = intraLineWordDiff(
      'The cat sat on the mat',
      'The dog sat on the rug'
    );
    expect(ops.filter((op) => op.kind === 'del').map((op) => op.text)).toEqual([
      'cat',
      'mat',
    ]);
    expect(ops.filter((op) => op.kind === 'ins').map((op) => op.text)).toEqual([
      'dog',
      'rug',
    ]);
    expect(
      ops.some((op) => op.kind === 'eq' && op.text.includes('sat on the'))
    ).toBe(true);
  });
});

describe('renderSearchableHtml (shipped split-line HTML path)', () => {
  test('paired change injects intra-line del on left and ins on right', () => {
    const left = splitSideHtml('Hello world', 'Hello word', 'left');
    const right = splitSideHtml('Hello world', 'Hello word', 'right');

    expect(left).toContain(`<del class="${INTRA_LINE_DEL_CLASS}">world</del>`);
    expect(right).toContain(`<ins class="${INTRA_LINE_INS_CLASS}">word</ins>`);
    expect(left.startsWith('Hello ')).toBe(true);
    expect(right.startsWith('Hello ')).toBe(true);
    expect(left).not.toMatch(/<(del|ins)[^>]*>Hello/);
    expect(right).not.toMatch(/<(del|ins)[^>]*>Hello/);
    expect(left).not.toBe(
      `<del class="${INTRA_LINE_DEL_CLASS}">Hello world</del>`
    );
    expect(right).not.toBe(
      `<ins class="${INTRA_LINE_INS_CLASS}">Hello word</ins>`
    );
    expect(left).not.toContain(MD_DIFF_DEL_CLASS);
    expect(right).not.toContain(MD_DIFF_INS_CLASS);
  });

  test('multi-word replace keeps the unchanged island unmarked', () => {
    const oldLine = 'The cat sat on the mat';
    const newLine = 'The dog sat on the rug';
    const left = splitSideHtml(oldLine, newLine, 'left');
    const right = splitSideHtml(oldLine, newLine, 'right');

    expect(left).toContain(`<del class="${INTRA_LINE_DEL_CLASS}">cat</del>`);
    expect(left).toContain(`<del class="${INTRA_LINE_DEL_CLASS}">mat</del>`);
    expect(right).toContain(`<ins class="${INTRA_LINE_INS_CLASS}">dog</ins>`);
    expect(right).toContain(`<ins class="${INTRA_LINE_INS_CLASS}">rug</ins>`);
    expect(left).toContain('sat on the');
    expect(right).toContain('sat on the');
    expect(left).not.toMatch(
      new RegExp(`<del class="${INTRA_LINE_DEL_CLASS}">${oldLine}</del>`)
    );
    expect(right).not.toMatch(
      new RegExp(`<ins class="${INTRA_LINE_INS_CLASS}">${newLine}</ins>`)
    );
  });

  test('unpaired whole-line add/del do not invent intra-line marks', () => {
    const delOnly = renderSearchableHtml(
      'gone',
      'example.ts',
      '',
      {
        lineType: 'del',
        leftType: 'del',
        rightType: null,
        leftCode: 'gone',
        rightCode: '',
        split: true,
      },
      null,
      0,
      'left',
      false
    );
    const addOnly = renderSearchableHtml(
      'fresh',
      'example.ts',
      '',
      {
        lineType: 'add',
        leftType: null,
        rightType: 'add',
        leftCode: '',
        rightCode: 'fresh',
        split: true,
      },
      null,
      0,
      'right',
      false
    );
    expect(delOnly).toBe('gone');
    expect(addOnly).toBe('fresh');
    expect(delOnly).not.toMatch(/prp-intra-/);
    expect(addOnly).not.toMatch(/prp-intra-/);
  });

  test('wraps changed tokens inside highlighted HTML without breaking tags', () => {
    const html =
      '<span class="hljs-title">Hello world</span>';
    const out = applySplitIntraLineHtml(
      html,
      pairedRow('Hello world', 'Hello word'),
      'left'
    );
    expect(out).toContain('class="hljs-title"');
    expect(out).toContain(`<del class="${INTRA_LINE_DEL_CLASS}">world</del>`);
    expect(out).toContain('Hello ');
    expect(out).not.toContain(`<del class="${INTRA_LINE_DEL_CLASS}">Hello world</del>`);
  });

  test('entity-safe wrap keeps &amp; and still marks the changed word', () => {
    const out = applySplitIntraLineHtml(
      'a &amp; b',
      pairedRow('a & b', 'a & c'),
      'left'
    );
    expect(out).toContain('&amp;');
    expect(out).toContain(`<del class="${INTRA_LINE_DEL_CLASS}">b</del>`);
    expect(out).not.toContain(`<del class="${INTRA_LINE_DEL_CLASS}">a`);
  });

  test('search marks still wrap after intra-line injection', () => {
    const left = splitSideHtml('Hello world', 'Hello word', 'left', 'world');
    expect(left).toContain('prp-search-mark');
    expect(left).toContain(`<del class="${INTRA_LINE_DEL_CLASS}">`);
    expect(left).toContain('world');
  });
});

describe('intra-line mark CSS (darker than pane + strike on deletes)', () => {
  test('CodeCell.css: del mix is darker than pane and struck; ins darker, not struck', () => {
    const css = read('src/modal/views/diff/CodeCell.css');
    const del = cssRuleBody(css, '.prp-split-cols .prp-intra-del');
    const ins = cssRuleBody(css, '.prp-split-cols .prp-intra-ins');
    expect(del.length).toBeGreaterThan(0);
    expect(ins.length).toBeGreaterThan(0);

    expect(del).toMatch(/background:\s*color-mix\(/);
    expect(del).toMatch(/--prp-danger/);
    expect(del).toMatch(/text-decoration:\s*line-through/);
    expect(del).not.toMatch(/background:\s*var\(--prp-del-bg\)\s*;/);

    expect(ins).toMatch(/background:\s*color-mix\(/);
    expect(ins).toMatch(/--prp-ok/);
    expect(ins).toMatch(/text-decoration:\s*none/);
    expect(ins).not.toMatch(/line-through/);
    expect(ins).not.toMatch(/background:\s*var\(--prp-add-bg\)\s*;/);

    expect(css).not.toMatch(/prp-md-diff-del/);
    expect(css).not.toMatch(/prp-md-diff-ins/);
  });

  test('markdown overlay still uses pane tokens; split path does not reuse them', () => {
    const md = read('src/modal/components/common/MarkdownView.css');
    const mdDel = cssRuleBody(md, '.prp-md del.prp-md-diff-del');
    const mdIns = cssRuleBody(md, '.prp-md ins.prp-md-diff-ins');
    expect(mdDel).toMatch(/background:\s*var\(--prp-del-bg\)/);
    expect(mdIns).toMatch(/background:\s*var\(--prp-add-bg\)/);

    const rows = read('src/modal/views/diff/VirtualDiffRows.tsx');
    expect(rows).toMatch(/applySplitIntraLineHtml/);
    expect(rows).toMatch(/from '@lib\/intra-line-diff'/);
    expect(rows).not.toMatch(new RegExp(MD_DIFF_DEL_CLASS));
  });
});
