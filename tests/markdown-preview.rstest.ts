/**
 * Markdown overlay preview: shipped word-diff / show-diff transform.
 * Imports production helpers — no copy, mock, or reimplementation.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MD_DIFF_DEL_CLASS,
  MD_DIFF_INS_CLASS,
  buildMarkdownPreviewSource,
  isMarkdownPath,
  wordDiff,
  coalesceAdjacentChangeGroups,
  markdownPreviewLoadPlan,
  resolveMarkdownSides,
} from '../src/modal/lib/markdown-preview';
import { formatMessage } from '../src/modal/lib/i18n';
import { SUPPORTED_LOCALES } from '../src/modal/lib/locale-resolve';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const OLD_MD = [
  '# Hello world',
  '',
  'This is a paragraph with a unique token.',
  '',
].join('\n');

const NEW_MD = [
  '# Hello word',
  '',
  'This is a paragraph with a unique token.',
  '',
].join('\n');

describe('isMarkdownPath', () => {
  test('detects common markdown extensions', () => {
    expect(isMarkdownPath('docs/README.md')).toBe(true);
    expect(isMarkdownPath('notes.markdown')).toBe(true);
    expect(isMarkdownPath('a/b/c.MDX')).toBe(true);
    expect(isMarkdownPath('src/app.ts')).toBe(false);
    expect(isMarkdownPath('photo.png')).toBe(false);
    expect(isMarkdownPath('')).toBe(false);
  });
});

describe('resolveMarkdownSides / load plan', () => {
  test('added files have empty old; deleted files have empty new', () => {
    expect(
      resolveMarkdownSides({
        status: 'added',
        oldText: 'stale',
        newText: '# New',
      })
    ).toEqual({ oldText: '', newText: '# New' });
    expect(
      resolveMarkdownSides({
        status: 'deleted',
        oldText: '# Old',
        newText: 'stale',
      })
    ).toEqual({ oldText: '# Old', newText: '' });
  });

  test('load plan skips the missing side and uses blob refs, not a patch', () => {
    const added = markdownPreviewLoadPlan(
      { filename: 'docs/a.md', status: 'added' },
      { baseSha: 'base', headSha: 'head' }
    );
    expect(added.old).toBeNull();
    expect(added.new).toEqual({ path: 'docs/a.md', ref: 'head' });

    const renamed = markdownPreviewLoadPlan(
      {
        filename: 'docs/b.md',
        status: 'renamed',
        previous_filename: 'docs/a.md',
      },
      { baseSha: 'aaa', headRef: 'main' }
    );
    expect(renamed.old).toEqual({ path: 'docs/a.md', ref: 'aaa' });
    expect(renamed.new).toEqual({ path: 'docs/b.md', ref: 'main' });
  });
});

describe('buildMarkdownPreviewSource (shipped transform)', () => {
  test('show-diff off yields the new-side document with no ins/del wrappers', () => {
    const off = buildMarkdownPreviewSource({
      oldText: OLD_MD,
      newText: NEW_MD,
      showDiff: false,
    });
    expect(off).toBe(NEW_MD);
    expect(off).not.toMatch(/<del\b/i);
    expect(off).not.toMatch(/<ins\b/i);
    expect(off).not.toMatch(new RegExp(MD_DIFF_DEL_CLASS));
    expect(off).not.toMatch(new RegExp(MD_DIFF_INS_CLASS));
  });

  test('intra-line word change marks those words; prefix/suffix stay unmarked', () => {
    const oldText = 'Hello world';
    const newText = 'Hello word';
    const ops = wordDiff(oldText, newText);
    const del = ops.filter((op) => op.kind === 'del');
    const ins = ops.filter((op) => op.kind === 'ins');
    const eq = ops.filter((op) => op.kind === 'eq');

    expect(del).toEqual([{ kind: 'del', text: 'world' }]);
    expect(ins).toEqual([{ kind: 'ins', text: 'word' }]);
    expect(eq.some((op) => op.text.includes('Hello'))).toBe(true);
    // Word-level, not a single-letter `l` inside world
    expect(del.some((op) => op.text === 'l')).toBe(false);

    const on = buildMarkdownPreviewSource({
      oldText,
      newText,
      showDiff: true,
    });
    expect(on).toContain(`<del class="${MD_DIFF_DEL_CLASS}">world</del>`);
    expect(on).toContain(`<ins class="${MD_DIFF_INS_CLASS}">word</ins>`);
    expect(on.startsWith('Hello ')).toBe(true);
    expect(on).not.toMatch(/<(del|ins)[^>]*>Hello/);
    expect(on).not.toContain(`<del class="${MD_DIFF_DEL_CLASS}">l</del>`);
    // Not whole-line −/+ blocks
    expect(on).not.toMatch(/^-Hello world$/m);
    expect(on).not.toMatch(/^\+Hello word$/m);
    expect(on.includes('-Hello world')).toBe(false);
    expect(on.includes('+Hello word')).toBe(false);
  });

  test('heading word substitution is delete+insert, not a whole-line replace', () => {
    const on = buildMarkdownPreviewSource({
      oldText: OLD_MD,
      newText: NEW_MD,
      showDiff: true,
    });
    expect(on).toContain(`<del class="${MD_DIFF_DEL_CLASS}">world</del>`);
    expect(on).toContain(`<ins class="${MD_DIFF_INS_CLASS}">word</ins>`);
    expect(on.startsWith('# Hello ')).toBe(true);
    expect(on).toContain('unique token');
    expect(on).not.toMatch(/<(del|ins)[^>]*># Hello world/);
    expect(on).not.toMatch(/<(del|ins)[^>]*>This is a paragraph/);
    expect(on.includes('-# Hello world')).toBe(false);
    expect(on.includes('+# Hello word')).toBe(false);

    const sub = buildMarkdownPreviewSource({
      oldText: '# Hello',
      newText: '# Hallo',
      showDiff: true,
    });
    expect(sub).toContain(`<del class="${MD_DIFF_DEL_CLASS}">Hello</del>`);
    expect(sub).toContain(`<ins class="${MD_DIFF_INS_CLASS}">Hallo</ins>`);
    expect(sub.startsWith('# ')).toBe(true);
    expect(sub).not.toContain(`<del class="${MD_DIFF_DEL_CLASS}">e</del>`);
    expect(sub).not.toBe(
      `<del class="${MD_DIFF_DEL_CLASS}"># Hello</del><ins class="${MD_DIFF_INS_CLASS}"># Hallo</ins>`
    );
  });

  test('consecutive del/ins on one line coalesce into one replacement group', () => {
    const ops = wordDiff('The cat sat', 'The dog ran');
    expect(ops.filter((op) => op.kind === 'del')).toEqual([
      { kind: 'del', text: 'cat sat' },
    ]);
    expect(ops.filter((op) => op.kind === 'ins')).toEqual([
      { kind: 'ins', text: 'dog ran' },
    ]);
    expect(ops.some((op) => op.kind === 'eq' && op.text.includes('The'))).toBe(
      true
    );

    const on = buildMarkdownPreviewSource({
      oldText: 'foo bar baz qux',
      newText: 'foo aaa bbb qux',
      showDiff: true,
    });
    expect(on).toContain(`<del class="${MD_DIFF_DEL_CLASS}">bar baz</del>`);
    expect(on).toContain(`<ins class="${MD_DIFF_INS_CLASS}">aaa bbb</ins>`);
    expect(on).not.toContain(`<del class="${MD_DIFF_DEL_CLASS}">bar</del>`);
    expect(on.startsWith('foo ')).toBe(true);
    expect(on.endsWith(' qux')).toBe(true);
  });

  test('an unchanged word splits groups; does not paint the whole line', () => {
    const ops = wordDiff(
      'The cat sat on the mat',
      'The dog sat on the rug'
    );
    const del = ops.filter((op) => op.kind === 'del').map((op) => op.text);
    const ins = ops.filter((op) => op.kind === 'ins').map((op) => op.text);
    expect(del).toEqual(['cat', 'mat']);
    expect(ins).toEqual(['dog', 'rug']);
    expect(
      ops.some((op) => op.kind === 'eq' && op.text.includes('sat on the'))
    ).toBe(true);

    const feature = wordDiff(
      'enable the feature flag today',
      'disable a feature toggle today'
    );
    expect(
      feature.some((op) => op.kind === 'eq' && op.text.includes('feature'))
    ).toBe(true);
    expect(
      feature.filter((op) => op.kind === 'del').map((op) => op.text)
    ).toEqual(['enable the', 'flag']);
    expect(
      feature.filter((op) => op.kind === 'ins').map((op) => op.text)
    ).toEqual(['disable a', 'toggle']);
  });

  test('coalesceAdjacentChangeGroups leaves word-eq islands intact', () => {
    const grouped = coalesceAdjacentChangeGroups([
      { kind: 'eq', text: 'The ' },
      { kind: 'del', text: 'cat' },
      { kind: 'ins', text: 'dog' },
      { kind: 'eq', text: ' ' },
      { kind: 'del', text: 'sat' },
      { kind: 'ins', text: 'ran' },
    ]);
    expect(grouped).toEqual([
      { kind: 'eq', text: 'The ' },
      { kind: 'del', text: 'cat sat' },
      { kind: 'ins', text: 'dog ran' },
    ]);
  });
});

describe('overlay / show-diff / i18n wiring (shipped sources)', () => {
  test('Diff file header and MarkdownViewer overlay exist with show-diff control', () => {
    const viewer = fs.readFileSync(
      path.join(root, 'src/modal/components/common/MarkdownViewer.tsx'),
      'utf8'
    );
    const rows = fs.readFileSync(
      path.join(root, 'src/modal/views/diff/VirtualDiffRows.tsx'),
      'utf8'
    );
    const diff = fs.readFileSync(
      path.join(root, 'src/modal/views/diff/VirtualDiff.tsx'),
      'utf8'
    );
    expect(viewer).toMatch(/data-prp-md-viewer/);
    expect(viewer).toMatch(/claimNestedEscape/);
    expect(viewer).toMatch(/md_preview_show_diff/);
    expect(viewer).toMatch(/buildMarkdownPreviewSource/);
    expect(viewer).toMatch(/useT\(/);
    expect(rows).toMatch(/isMarkdownPath/);
    expect(rows).toMatch(/onPreviewMarkdown/);
    expect(rows).toMatch(/t\('md_preview'\)/);
    expect(diff).toMatch(/MarkdownViewer/);
    expect(diff).toMatch(/onPreviewMarkdown/);
  });

  test('preview / show-diff / close keys exist in en + ko + ja + zh_CN', () => {
    const keys = [
      'md_preview',
      'md_preview_show_diff',
      'md_preview_close',
      'md_preview_aria',
    ] as const;
    for (const loc of SUPPORTED_LOCALES) {
      for (const key of keys) {
        const msg = formatMessage(key, loc);
        expect(msg.length).toBeGreaterThan(0);
        expect(msg).not.toBe(key);
      }
    }
    expect(formatMessage('md_preview_show_diff', 'en')).toBe('Show diff');
    expect(formatMessage('md_preview_show_diff', 'ko')).not.toBe(
      formatMessage('md_preview_show_diff', 'en')
    );
    expect(formatMessage('md_preview_show_diff', 'ja')).not.toBe(
      formatMessage('md_preview_show_diff', 'en')
    );
    expect(formatMessage('md_preview_show_diff', 'zh_CN')).not.toBe(
      formatMessage('md_preview_show_diff', 'en')
    );
  });
});
