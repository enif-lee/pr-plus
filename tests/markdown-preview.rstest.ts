/**
 * Markdown overlay preview: shipped word-diff / show-diff transform.
 * Imports production helpers — no copy, mock, or reimplementation.
 */
import { beforeAll, describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';
import {
  MD_DIFF_DEL_CLASS,
  MD_DIFF_INS_CLASS,
  buildMarkdownPreviewSource,
  isMarkdownPath,
  wordDiff,
  coalesceAdjacentChangeGroups,
  markdownPreviewLoadPlan,
  resolveMarkdownMediaUrl,
  resolveMarkdownSides,
  rewriteMarkdownMediaHtml,
  stampMarkdownAlignAttrs,
} from '../src/modal/lib/markdown-preview';
import { renderMdHtml } from '../src/modal/components/common/utils';
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

  test('a pipe that is not a GFM table stays on the prose word-diff path', () => {
    const on = buildMarkdownPreviewSource({
      oldText: 'use a | b today',
      newText: 'use a | c today',
      showDiff: true,
    });
    expect(on.startsWith('use a | ')).toBe(true);
    expect(on).toContain(`<del class="${MD_DIFF_DEL_CLASS}">b</del>`);
    expect(on).toContain(`<ins class="${MD_DIFF_INS_CLASS}">c</ins>`);
    expect(on).not.toContain('<table');
  });
});

const DEL = `del class="${MD_DIFF_DEL_CLASS}"`;
const INS = `ins class="${MD_DIFF_INS_CLASS}"`;

function previewHtml(
  oldText: string,
  newText: string,
  extra: { status?: string; showDiff?: boolean } = {}
): { source: string; html: string } {
  const source = buildMarkdownPreviewSource({
    oldText,
    newText,
    showDiff: extra.showDiff !== false,
    status: extra.status,
  });
  return { source, html: String(renderMdHtml(source, {})) };
}

function expectMarked(html: string, kind: 'del' | 'ins', word: string) {
  const tag = kind === 'del' ? DEL : INS;
  expect(html).toContain(`<${tag}>${word}</`);
}

describe('GFM table word-diff renders through marked', () => {
  beforeAll(() => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    marked.setOptions({ gfm: true, breaks: true });
    (globalThis as { marked?: typeof marked }).marked = marked;
    (globalThis as { DOMPurify?: ReturnType<typeof createDOMPurify> }).DOMPurify =
      createDOMPurify(dom.window);
  });

  test('in-cell and header edits render a table with word marks', () => {
    const oldText = '| Name | Age |\n| --- | --- |\n| Alice | 1 |\n';
    const newText = '| Title | Years |\n| --- | --- |\n| Alice | 2 |\n';
    const { html } = previewHtml(oldText, newText);
    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expect(html).toContain('<td');
    for (const word of ['Name', 'Age', '1']) expectMarked(html, 'del', word);
    for (const word of ['Title', 'Years', '2']) expectMarked(html, 'ins', word);
    expect(html).not.toMatch(/<(del|ins)[^>]*>\s*Alice/);
    expect(html).toContain('Alice');
    expect(html).not.toContain('| --- |');
    expect(html).not.toContain('| Name |');
    expect(html).not.toContain('| Title |');
  });

  test('tables without outer pipes still render cell edits', () => {
    const { html } = previewHtml(
      'Name | Age\n--- | ---\nAlice | 1\n',
      'Title | Years\n--- | ---\nAlice | 2\n'
    );
    expect(html).toContain('<table');
    expect(html).toContain('<th');
    for (const word of ['Name', 'Age', '1']) expectMarked(html, 'del', word);
    for (const word of ['Title', 'Years', '2']) expectMarked(html, 'ins', word);
    expect(html).not.toContain('--- | ---');
    expect(html).not.toMatch(/<(del|ins)[^>]*>\s*Alice/);
  });

  test('several body cells on one row are marked inside the table', () => {
    const { html } = previewHtml(
      '| Name | Age |\n| --- | --- |\n| Alice | 1 |\n',
      '| Name | Age |\n| --- | --- |\n| Alicia | 2 |\n'
    );
    expect(html).toContain('<table');
    expectMarked(html, 'del', 'Alice');
    expectMarked(html, 'ins', 'Alicia');
    expectMarked(html, 'del', '1');
    expectMarked(html, 'ins', '2');
    expect(html).not.toMatch(/<(del|ins)[^>]*>\s*Name/);
    expect(html).not.toContain('| Alice |');
  });

  test('inline emphasis, code, and links inside a changed cell render', () => {
    const strong = previewHtml(
      '| **Name** |\n| --- |\n| keep |\n',
      '| **Title** |\n| --- |\n| keep |\n'
    ).html;
    expect(strong).toContain('<strong>');
    expect(strong).not.toContain('**');
    expectMarked(strong, 'del', 'Name');
    expectMarked(strong, 'ins', 'Title');

    const code = previewHtml(
      '| `foo` |\n| --- |\n| keep |\n',
      '| `bar` |\n| --- |\n| keep |\n'
    ).html;
    expect(code).toContain('<code>foo</code>');
    expect(code).toContain('<code>bar</code>');
    expect(code).not.toContain('&lt;del');
    expect(code).not.toContain('`');
    expect(code).toContain(`<${DEL}>`);
    expect(code).toContain(`<${INS}>`);

    const link = previewHtml(
      '| [here](https://a.example) |\n| --- |\n| keep |\n',
      '| [there](https://b.example) |\n| --- |\n| keep |\n'
    ).html;
    expect(link).toContain('<a ');
    expect(link).toContain('href="https://a.example"');
    expect(link).toContain('href="https://b.example"');
    expect(link).toContain('>here</a>');
    expect(link).toContain('>there</a>');
    expect(link).not.toContain('](http');
    expect(link).not.toContain('](https://');

    const nested = previewHtml(
      '| **see _old_** |\n| --- |\n| k |\n',
      '| **see _new_** |\n| --- |\n| k |\n'
    ).html;
    expect(nested).toContain('<strong>');
    expect(nested).toContain('<em>');
    expect(nested).not.toContain('_old_');
    expect(nested).not.toContain('_new_');
    expectMarked(nested, 'del', 'old');
    expectMarked(nested, 'ins', 'new');
    expect(nested).not.toMatch(/<(del|ins)[^>]*>\s*see/);

    const auto = previewHtml(
      '| **https://a.example** |\n| --- |\n| k |\n',
      '| **https://b.example** |\n| --- |\n| k |\n'
    ).html;
    expect(auto).toContain('<strong>');
    expect(auto).toContain('href="https://a.example"');
    expect(auto).toContain('href="https://b.example"');
    expect(auto).toContain('<a ');
    expect(auto).not.toContain('https://<');
  });

  test('a table inserted or deleted between unchanged prose leaves that prose unmarked', () => {
    const prose = 'alpha\n\nbeta\n';
    const table = '| A | B |\n| --- | --- |\n| 1 | 2 |\n';
    const withTable = `alpha\n\n${table}\nbeta\n`;
    const inserted = previewHtml(prose, withTable);
    expect(inserted.source).not.toContain(`<${DEL}>beta</`);
    expect(inserted.source).not.toContain(`<${INS}>beta</`);
    expect(inserted.source).not.toContain(`<${DEL}>alpha</`);
    expect(inserted.source).not.toContain(`<${INS}>alpha</`);
    expect(inserted.html).toContain('<table');
    expect(inserted.html).toContain('<th');
    for (const word of ['A', 'B', '1', '2']) expectMarked(inserted.html, 'ins', word);
    expect(inserted.html).toContain('alpha');
    expect(inserted.html).toContain('beta');
    expect(inserted.html).not.toMatch(/<(del|ins)[^>]*>\s*alpha/);
    expect(inserted.html).not.toMatch(/<(del|ins)[^>]*>\s*beta/);

    const deleted = previewHtml(withTable, prose);
    expect(deleted.source).not.toContain(`<${DEL}>beta</`);
    expect(deleted.source).not.toContain(`<${INS}>beta</`);
    expect(deleted.source).not.toContain(`<${DEL}>alpha</`);
    expect(deleted.source).not.toContain(`<${INS}>alpha</`);
    expect(deleted.html).toContain('<table');
    for (const word of ['A', 'B', '1', '2']) expectMarked(deleted.html, 'del', word);
    expect(deleted.html).toContain('alpha');
    expect(deleted.html).toContain('beta');
    expect(deleted.html).not.toMatch(/<(del|ins)[^>]*>\s*alpha/);
    expect(deleted.html).not.toMatch(/<(del|ins)[^>]*>\s*beta/);
    expect(deleted.html).not.toMatch(/<ins\b/);
  });

  test('a long document still diffs a changed table cell', () => {
    const prose =
      Array.from({ length: 2000 }, (_, i) => `line ${i} stays`).join('\n') + '\n';
    const oldTable = '| A | B |\n| --- | --- |\n| 1 | 2 |\n';
    const newTable = '| A | B |\n| --- | --- |\n| 1 | 9 |\n';
    const { source, html } = previewHtml(prose + oldTable, prose + newTable);
    expect(source).not.toContain('| 1 | 2 |');
    expect(source).toContain('prp-md-diff');
    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expectMarked(html, 'del', '2');
    expectMarked(html, 'ins', '9');
    expect(html).not.toContain('| 1 | 2 |');
    expect(html).toContain('line 0 stays');
    expect(html).toContain('line 1999 stays');
    expect(html).not.toMatch(/<(del|ins)[^>]*>\s*line /);
  });

  test('a table inserted in a long document leaves the surrounding lines unmarked', () => {
    const lines = Array.from({ length: 2000 }, (_, i) => `line ${i} stays`);
    const oldText = lines.join('\n') + '\n';
    const table = '| A | B |\n| --- | --- |\n| 1 | 2 |\n';
    const head = lines.slice(0, 1000).join('\n') + '\n\n';
    const tail = lines.slice(1000).join('\n') + '\n';
    const inserted = previewHtml(oldText, `${head}${table}\n${tail}`);
    expect(inserted.html).toContain('<table');
    expect(inserted.html).toContain('<th');
    for (const word of ['A', 'B', '1', '2']) expectMarked(inserted.html, 'ins', word);
    expect(inserted.html).toContain('line 0 stays');
    expect(inserted.html).toContain('line 1000 stays');
    expect(inserted.html).toContain('line 1999 stays');
    expect(inserted.html).not.toMatch(/<(del|ins)[^>]*>\s*line /);
    expect(inserted.source).not.toContain('| 1 | 2 |');

    const deleted = previewHtml(`${head}${table}\n${tail}`, oldText);
    for (const word of ['A', 'B', '1', '2']) expectMarked(deleted.html, 'del', word);
    expect(deleted.html).toContain('line 0 stays');
    expect(deleted.html).toContain('line 1999 stays');
    expect(deleted.html).not.toMatch(/<(del|ins)[^>]*>\s*line /);
    expect(deleted.html).not.toMatch(/<ins\b/);
  });

  test('over the block DP cap a changed table cell is still diffed', () => {
    // 1000 tables and the blank lines between them are 2000 blocks.
    // The first and last blocks differ, so the shared head/tail trim
    // cannot shrink the alignment under DP_CELL_CAP.
    const unit = '| A |\n| --- |\n| 1 |\n\n';
    const copies = 1000;
    const oldText = unit.repeat(copies);
    const newText =
      '| A |\n| --- |\n| 8 |\n\n' +
      unit.repeat(copies - 2) +
      '| A |\n| --- |\n| 9 |\n';
    const { source, html } = previewHtml(oldText, newText);
    expect(source.split('| 1 |').length - 1).toBe(copies - 2);
    expect(source).not.toContain('| 8 |');
    expect(source).not.toContain('| 9 |');
    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expectMarked(html, 'del', '1');
    expectMarked(html, 'ins', '8');
    expectMarked(html, 'ins', '9');
    expect(html).not.toContain('| 8 |');
    expect(html).not.toContain('| 9 |');
  });

  test('an inserted table renders with ins marks; a deleted table uses del', () => {
    const table = '| Name | Age |\n| --- | --- |\n| Alice | 1 |\n';
    const inserted = previewHtml('hello\n', `hello\n\n${table}`);
    expect(inserted.html).toContain('<table');
    expect(inserted.html).toContain('<th');
    for (const word of ['Name', 'Age', 'Alice', '1']) {
      expectMarked(inserted.html, 'ins', word);
    }
    expect(inserted.html).not.toContain('| --- |');
    expect(inserted.html).toContain('hello');
    expect(inserted.html).not.toMatch(/<(del|ins)[^>]*>\s*hello/);

    const deleted = previewHtml(`hello\n\n${table}`, 'hello\n');
    expect(deleted.html).toContain('<table');
    expect(deleted.html).toContain('<th');
    for (const word of ['Name', 'Age', 'Alice', '1']) {
      expectMarked(deleted.html, 'del', word);
    }
    expect(deleted.html).not.toContain('| --- |');
    expect(deleted.html).toContain('hello');
  });

  test('an unchanged table beside a changed one has no diff marks', () => {
    const oldText = [
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '| C | D |',
      '| --- | --- |',
      '| 3 | 4 |',
      '',
    ].join('\n');
    const newText = oldText.replace('| 3 | 4 |', '| 3 | 9 |');
    const { html } = previewHtml(oldText, newText);
    const tables = html.split(/<table/i).slice(1);
    expect(tables.length).toBe(2);
    expect(tables[0]).not.toMatch(/prp-md-diff/);
    expect(tables[0]).toContain('>A<');
    expect(tables[0]).toContain('>1<');
    expect(tables[1]).toContain(`<${DEL}>4</`);
    expect(tables[1]).toContain(`<${INS}>9</`);
    expect(tables[1]).toContain('>C<');
  });

  test('an added file keeps the new markdown unwrapped and still renders a table', () => {
    const table = '| Name | Age |\n| --- | --- |\n| Alice | 1 |\n';
    const { source, html } = previewHtml('', table, {
      status: 'added',
      showDiff: true,
    });
    expect(source).toBe(table);
    expect(source).not.toMatch(/<ins\b/i);
    expect(source).not.toMatch(/<del\b/i);
    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expect(html).toContain('Name');
    expect(html).not.toMatch(/<ins\b/i);
    expect(html).not.toMatch(/<del\b/i);
  });

  test('show-diff off is the new document with no ins/del', () => {
    const oldText = '| Name | Age |\n| --- | --- |\n| Alice | 1 |\n';
    const newText = '| Title | Years |\n| --- | --- |\n| Alice | 2 |\n';
    const { source, html } = previewHtml(oldText, newText, { showDiff: false });
    expect(source).toBe(newText);
    expect(source).not.toMatch(/<ins\b/i);
    expect(source).not.toMatch(/<del\b/i);
    expect(html).toContain('<table');
    expect(html).toContain('Title');
    expect(html).not.toMatch(/prp-md-diff/);
  });

  test('delimiter and alignment edits do not leak the delimiter line', () => {
    const header = '| Name | Age |\n';
    const body = '| Alice | 1 |\n';
    const align = previewHtml(
      `${header}| --- | --- |\n${body}`,
      `${header}| :--- | ---: |\n${body}`
    ).html;
    expect(align).toContain('<th');
    expect(align).toContain('Name');
    expect(align).toContain('Age');
    expect(align).not.toContain('---');
    expect(align).not.toContain(':---');
    expect(align).not.toContain('---:');
    expect(align).not.toMatch(/prp-md-diff/);

    const dashes = previewHtml(
      `${header}| --- | --- |\n${body}`,
      `${header}| ---- | ---- |\n${body}`
    ).html;
    expect(dashes).toContain('<th');
    expect(dashes).toContain('Name');
    expect(dashes).not.toContain('---');
    expect(dashes).not.toContain('----');
  });

  test('a header edit together with its delimiter still renders th cells', () => {
    const { html } = previewHtml(
      '| Name | Age |\n| --- | --- |\n| Alice | 1 |\n',
      '| Title | Years |\n| :--- | ---: |\n| Alice | 1 |\n'
    );
    expect(html).toContain('<thead');
    expect(html).toContain('<th');
    expectMarked(html, 'del', 'Name');
    expectMarked(html, 'ins', 'Title');
    expectMarked(html, 'del', 'Age');
    expectMarked(html, 'ins', 'Years');
    expect(html).not.toContain('---');
    expect(html).not.toContain(':---');
    expect(html).not.toMatch(/<(del|ins)[^>]*>\s*Alice/);
    expect(html).toContain('Alice');
  });

  test('an added or removed body row stays one table and keeps the cell text', () => {
    const oldText = '| Name | Age |\n| --- | --- |\n| Alice | 1 |\n| Bob | 2 |\n';
    const newText =
      '| Name | Age |\n| --- | --- |\n| Alice | 1 |\n| Carol | 3 |\n| Bob | 2 |\n';
    const added = previewHtml(oldText, newText).html;
    const addedTable = added.slice(added.indexOf('<table'), added.indexOf('</table>'));
    expect(addedTable).toContain('<table');
    expect(addedTable).toContain('Carol');
    expect(addedTable).toContain('3');
    expect(addedTable).toContain('Bob');
    expect(addedTable).toContain('Alice');
    expectMarked(added, 'ins', 'Carol');
    expectMarked(added, 'ins', '3');
    expect(added).not.toContain('| Carol |');
    expect(added).not.toMatch(/<(del|ins)[^>]*>\s*Alice/);
    expect(added).not.toMatch(/<(del|ins)[^>]*>\s*Bob/);

    const removed = previewHtml(newText, oldText).html;
    const removedTable = removed.slice(
      removed.indexOf('<table'),
      removed.indexOf('</table>')
    );
    expect(removedTable).toContain('Carol');
    expect(removedTable).toContain('3');
    expect(removedTable).toContain('Bob');
    expectMarked(removed, 'del', 'Carol');
    expectMarked(removed, 'del', '3');
    expect(removed).not.toContain('| Carol |');
  });

  test('an added or removed column stays one table and marks the new cells', () => {
    const oldText = '| Name | Age |\n| --- | --- |\n| Alice | 1 |\n';
    const newText = '| Name | Age | City |\n| --- | --- | --- |\n| Alice | 1 | Seoul |\n';
    const added = previewHtml(oldText, newText).html;
    expect(added.match(/<table/gi)?.length).toBe(1);
    expectMarked(added, 'ins', 'City');
    expectMarked(added, 'ins', 'Seoul');
    expect(added).toContain('>Name<');
    expect(added).toContain('>Alice<');
    expect(added).not.toContain('| --- |');
    expect(added).not.toMatch(/<(del|ins)[^>]*>\s*Name/);
    expect(added).not.toMatch(/<(del|ins)[^>]*>\s*Alice/);
    expect(added).not.toMatch(/<(del|ins)[^>]*>\s*Age/);

    const removed = previewHtml(newText, oldText).html;
    expect(removed.match(/<table/gi)?.length).toBe(1);
    expectMarked(removed, 'del', 'City');
    expectMarked(removed, 'del', 'Seoul');
    expect(removed).toContain('>Name<');
    expect(removed).toContain('>Alice<');
    expect(removed).not.toContain('| City |');
  });

  test('an unchanged image cell stays an img when another cell changes', () => {
    const { html } = previewHtml(
      '| ![logo](assets/logo.jpeg) | 1 |\n| --- | --- |\n| a | b |\n',
      '| ![logo](assets/logo.jpeg) | 2 |\n| --- | --- |\n| a | b |\n'
    );
    expect(html).toMatch(/<img\b[^>]*src="assets\/logo\.jpeg"/);
    expect(html).toMatch(/<img\b[^>]*alt="logo"/);
    expect(html).not.toContain('![');
    expect(html).not.toContain('<a ');
    expectMarked(html, 'del', '1');
    expectMarked(html, 'ins', '2');
    expect(html).not.toMatch(/<(del|ins)[^>]*>\s*a/);
  });

  test('a deleted file that is only a table renders del marks inside the table', () => {
    const table = '| Name | Age |\n| --- | --- |\n| Alice | 1 |\n';
    const { html } = previewHtml(table, 'stale', { status: 'deleted' });
    expect(html).toContain('<table');
    expect(html).toContain('<th');
    for (const word of ['Name', 'Age', 'Alice', '1']) {
      expectMarked(html, 'del', word);
    }
    expect(html).not.toContain('| --- |');
    expect(html).not.toMatch(/<ins\b/);
  });

  test('a deleted prose file still wraps the old text', () => {
    const source = buildMarkdownPreviewSource({
      status: 'deleted',
      oldText: 'Hello world\n',
      newText: 'stale',
      showDiff: true,
    });
    expect(source).toBe(`<del class="${MD_DIFF_DEL_CLASS}">Hello world</del>\n`);
    expect(source).not.toContain('<table');
  });

  test('a changed table does not swallow the following block', () => {
    const oldHead = '| A | B |\n| --- | --- |\n| 1 | 2 |\n';
    const newHead = '| A | B |\n| --- | --- |\n| 1 | 9 |\n';
    const heading = previewHtml(`${oldHead}# Hello\n`, `${newHead}# Hello\n`).html;
    expect(heading).toContain('<h1');
    expect(heading).toContain('Hello');
    expect(heading).toContain('<table');
    expectMarked(heading, 'del', '2');
    expectMarked(heading, 'ins', '9');

    const list = previewHtml(`${oldHead}- item\n`, `${newHead}- item\n`).html;
    expect(list).toContain('<ul');
    expect(list).toContain('<li');
    expect(list).toContain('item');

    const fence = previewHtml(
      `${oldHead}\`\`\`\ncode\n\`\`\`\n`,
      `${newHead}\`\`\`\ncode\n\`\`\`\n`
    ).html;
    expect(fence).toContain('<pre');
    expect(fence).toContain('code');

    const rule = previewHtml(
      `${oldHead}---\nafter the rule\n\nnext\n`,
      `${newHead}---\nafter the rule\n\nnext\n`
    ).html;
    expect(rule).toContain('<hr');
    expect(rule).toContain('after the rule');
    expect(rule).toContain('<p>next</p>');
    expect(rule).not.toContain('---');

    const indented = previewHtml(`${oldHead}    code\n`, `${newHead}    code\n`).html;
    expect(indented).toContain('<pre');
    const table = indented.slice(indented.indexOf('<table'), indented.indexOf('</table>'));
    expect(table).not.toContain('code');

    const comment = previewHtml(
      `${oldHead}<!-- note -->\nhello\n`,
      `${newHead}<!-- note -->\nhello\n`
    ).html;
    const commentTable = comment.slice(comment.indexOf('<table'), comment.indexOf('</table>'));
    expect(commentTable).not.toContain('note');
    expect(commentTable).not.toContain('hello');
    expect(comment).toContain('<p>hello</p>');
    expectMarked(comment, 'del', '2');
    expectMarked(comment, 'ins', '9');

    for (const block of ['<script>\nx\n</script>\n', '<summary>\nx\n</summary>\n', '<meta charset="utf-8">\n']) {
      const html = previewHtml(`${oldHead}${block}hello\n`, `${newHead}${block}hello\n`).html;
      const body = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
      expect(body).not.toContain('hello');
    }

    const span = previewHtml(
      `${oldHead}<span>x</span>\nnext\n`,
      `${newHead}<span>x</span>\nnext\n`
    ).html;
    const spanTable = span.slice(span.indexOf('<table'), span.indexOf('</table>'));
    expect(spanTable).toContain('x');
    expect(spanTable).toContain('next');
  });

  test('a line starting with 2. stays a table cell', () => {
    const html = previewHtml(
      '| A | B |\n| --- | --- |\n| 1 | 2 |\n2. second | keep\n',
      '| A | B |\n| --- | --- |\n| 1 | 9 |\n2. second | keep\n'
    ).html;
    const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
    expect(table).toContain('second');
    expect(table).toContain('keep');
    expect(html).not.toContain('<ol');
    expectMarked(html, 'ins', '9');
  });

  test('a longer fence keeps an example table inside the code block', () => {
    const sample = [
      '````',
      'intro',
      '```',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '```',
      'still',
      '````',
      '',
    ].join('\n');
    const { source, html } = previewHtml(sample, sample.replace('| 1 | 2 |', '| 1 | 9 |'));
    expect(source).not.toContain('<table');
    expect(html).not.toContain('<table');
    expect(html).toContain('<pre');
    expect(html).toContain('| A | B |');
  });

  test('unchanged autolink, reference link, strike, and underscore emphasis render in a changed table', () => {
    const auto = previewHtml(
      '| see https://a.example/x | 1 |\n| --- | --- |\n| a | b |\n',
      '| see https://a.example/x | 2 |\n| --- | --- |\n| a | b |\n'
    ).html;
    expect(auto).toContain('href="https://a.example/x"');
    expect(auto).not.toContain('https://<');
    expectMarked(auto, 'del', '1');
    expectMarked(auto, 'ins', '2');

    const refDoc = (n: string) =>
      `[ref]: https://a.example\n\n| [here][ref] | ${n} |\n| --- | --- |\n| a | b |\n`;
    const ref = previewHtml(refDoc('1'), refDoc('2')).html;
    expect(ref).toContain('href="https://a.example"');
    expect(ref).toContain('>here</a>');
    expect(ref).not.toContain('[here]');
    expectMarked(ref, 'ins', '2');

    const strike = previewHtml(
      '| ~~Name~~ |\n| --- |\n| keep |\n',
      '| ~~Title~~ |\n| --- |\n| keep |\n'
    ).html;
    expect(strike).toContain('<del>');
    expect(strike).not.toContain('~~');
    expectMarked(strike, 'del', 'Name');
    expectMarked(strike, 'ins', 'Title');

    const em = previewHtml(
      '| _Name_ |\n| --- |\n| keep |\n',
      '| _Title_ |\n| --- |\n| keep |\n'
    ).html;
    expect(em).toContain('<em>');
    expect(em).not.toContain('_Name_');
    expect(em).not.toContain('_Title_');
    expectMarked(em, 'del', 'Name');
    expectMarked(em, 'ins', 'Title');

    const snake = previewHtml(
      '| use_snake_case | 1 |\n| --- | --- |\n| a | b |\n',
      '| use_snake_case | 2 |\n| --- | --- |\n| a | b |\n'
    ).html;
    expect(snake).toContain('use_snake_case');
    expect(snake).not.toContain('<em>');
  });

  test('balanced parentheses in a cell url stay in the href, and emphasis in a link label renders', () => {
    const img = previewHtml(
      '| ![logo](https://en.wikipedia.org/wiki/Foo_(bar).jpg) | 1 |\n| --- | --- |\n| a | b |\n',
      '| ![logo](https://en.wikipedia.org/wiki/Foo_(bar).jpg) | 2 |\n| --- | --- |\n| a | b |\n'
    ).html;
    expect(img).toContain(
      'src="https://en.wikipedia.org/wiki/Foo_(bar).jpg"'
    );
    expect(img).not.toContain('>.jpg');
    expectMarked(img, 'ins', '2');

    const link = previewHtml(
      '| [here](https://en.wikipedia.org/wiki/Foo_(bar)) | 1 |\n| --- | --- |\n| a | b |\n',
      '| [here](https://en.wikipedia.org/wiki/Foo_(bar)) | 2 |\n| --- | --- |\n| a | b |\n'
    ).html;
    expect(link).toContain(
      'href="https://en.wikipedia.org/wiki/Foo_(bar)"'
    );
    expect(link).not.toMatch(/<\/a>\)/);

    const label = previewHtml(
      '| [**here**](https://a.example) |\n| --- |\n| keep |\n',
      '| [**there**](https://a.example) |\n| --- |\n| keep |\n'
    ).html;
    expect(label).toContain('href="https://a.example"');
    expect(label).toContain('<strong>');
    expect(label).not.toContain('**');
    expectMarked(label, 'del', 'here');
    expectMarked(label, 'ins', 'there');
  });
});

describe('relative markdown images → repo raw URLs', () => {
  const ctx = {
    owner: 'enif-lee',
    repo: 'pr-plus',
    ref: 'abc123',
    filePath: 'README.md',
    webOrigin: 'https://github.com',
  };

  test('repo-relative img src resolves; shields/absolute URLs stay', () => {
    expect(resolveMarkdownMediaUrl('assets/logo.jpeg', ctx)).toBe(
      'https://github.com/enif-lee/pr-plus/raw/abc123/assets/logo.jpeg'
    );
    expect(resolveMarkdownMediaUrl('./screenshots/a.png', ctx)).toBe(
      'https://github.com/enif-lee/pr-plus/raw/abc123/screenshots/a.png'
    );
    expect(
      resolveMarkdownMediaUrl(
        'https://img.shields.io/badge/manifest-v3-blue',
        ctx
      )
    ).toBe('');
    expect(resolveMarkdownMediaUrl('data:image/png;base64,xx', ctx)).toBe('');
  });

  test('nested markdown file resolves ../ relative to its directory', () => {
    expect(
      resolveMarkdownMediaUrl('../assets/logo.jpeg', {
        ...ctx,
        filePath: 'docs/guide.md',
      })
    ).toBe('https://github.com/enif-lee/pr-plus/raw/abc123/assets/logo.jpeg');
  });

  test('stampMarkdownAlignAttrs keeps GitHub align as a class', () => {
    const html =
      '<p align="center"><img src="assets/logo.jpeg" alt="logo" /></p>';
    const out = stampMarkdownAlignAttrs(html);
    expect(out).toContain('prp-md-align-center');
    expect(out).toContain('align="center"');
  });

  test('rewriteMarkdownMediaHtml patches img src, leaves badges', () => {
    const html = [
      '<img src="assets/logo.jpeg" alt="pr+ logo" />',
      '<img src="https://img.shields.io/badge/manifest-v3-blue" alt="manifest" />',
    ].join('');
    const out = rewriteMarkdownMediaHtml(html, ctx);
    expect(out).toContain(
      'src="https://github.com/enif-lee/pr-plus/raw/abc123/assets/logo.jpeg"'
    );
    expect(out).toContain(
      'src="https://img.shields.io/badge/manifest-v3-blue"'
    );
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
    expect(viewer).toMatch(/FullscreenViewer/);
    expect(viewer).toMatch(/layer="markdown"/);
    expect(viewer).toMatch(/md_preview_show_diff/);
    expect(viewer).toMatch(/buildMarkdownPreviewSource/);
    expect(viewer).toMatch(/linkCtx=\{linkCtx\}/);
    expect(viewer).toMatch(/useT\(/);
    const shell = fs.readFileSync(
      path.join(root, 'src/modal/components/common/FullscreenViewer.tsx'),
      'utf8'
    );
    expect(shell).toMatch(/data-prp-md-viewer/);
    expect(shell).toMatch(/registerEscapeOverlay/);
    expect(rows).toMatch(/isMarkdownPath/);
    expect(rows).toMatch(/onPreviewMarkdown/);
    expect(rows).toMatch(/t\('md_preview'\)/);
    expect(diff).toMatch(/MarkdownViewer/);
    expect(diff).toMatch(/onPreviewMarkdown/);
    const mdView = fs.readFileSync(
      path.join(root, 'src/modal/components/common/MarkdownView.tsx'),
      'utf8'
    );
    expect(mdView).toMatch(/rewriteMarkdownMediaHtml/);
    expect(mdView).toMatch(/stampMarkdownAlignAttrs/);
    expect(mdView).toMatch(/splitSuggestionSegments/);
    const css = fs.readFileSync(
      path.join(root, 'src/modal/components/common/MarkdownView.css'),
      'utf8'
    );
    expect(css).toMatch(/prp-md-align-center/);
    expect(css).toMatch(/\[align=['"]center['"]\]/);
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
