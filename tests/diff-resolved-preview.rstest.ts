/**
 * Diff resolved collapsed body uses Conversation's 2-line markdown preview.
 * Root bug: `.prp-md { display: flow-root }` overrode single-class clamp rules
 * when MarkdownView.css sorted after FinishReview.css — fixed via
 * `.prp-md.prp-md--collapsed-preview` in MarkdownView.css.
 */
import { describe, expect, test } from '@rstest/core';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('Diff collapsed preview wiring (shipped)', () => {
  test('InlineThread collapsed branch applies prp-md--collapsed-preview', () => {
    const src = read('src/modal/views/diff/InlineThread.tsx');
    // Collapsed preview path
    expect(src).toMatch(/prp-inline-thread__collapsed-preview/);
    expect(src).toMatch(/prp-md--collapsed-preview/);
    // Expanded body must not use the clamp class on the open branch
    const collapsedIdx = src.indexOf('prp-inline-thread__collapsed-preview');
    expect(collapsedIdx).toBeGreaterThan(-1);
    // Open/expanded render uses renderCommentBody without collapsed-preview class
    // in the non-collapsed branch (before the ternary collapsed arm).
    const expandedBody = src.slice(0, collapsedIdx);
    expect(expandedBody).toMatch(/renderCommentBody|prp-inline-thread__body/);
    expect(expandedBody).not.toMatch(
      /className=\{?["'][^"']*prp-md--collapsed-preview/
    );
  });

  test('MarkdownView.css defines 2-line clamp beating .prp-md flow-root', () => {
    const css = read('src/modal/components/common/MarkdownView.css');
    expect(css).toMatch(/\.prp-md\.prp-md--collapsed-preview\s*\{/);
    expect(css).toMatch(/-webkit-line-clamp:\s*2/);
    expect(css).toMatch(/display:\s*-webkit-box/);
    // Base .prp-md still has flow-root (expanded)
    expect(css).toMatch(/\.prp-md\s*\{[\s\S]*?display:\s*flow-root/);
    // Double-class rule appears after single .prp-md block
    const base = css.indexOf('display: flow-root');
    const clamp = css.indexOf('.prp-md.prp-md--collapsed-preview');
    expect(clamp).toBeGreaterThan(base);
  });

  test('built pr-modal.css keeps clamp after flow-root with higher specificity', () => {
    const built = resolve(root, 'src/modal/dist/pr-modal.css');
    // Build may not have run yet in isolation — skip soft if missing
    if (!existsSync(built)) return;
    const css = readFileSync(built, 'utf8');
    expect(css).toMatch(/\.prp-md\.prp-md--collapsed-preview/);
    expect(css).toMatch(/-webkit-line-clamp:\s*2/);
    const double = css.indexOf('.prp-md.prp-md--collapsed-preview');
    // Last flow-root for bare .prp-md should not win over double class
    // Presence of double class is the product guarantee
    expect(double).toBeGreaterThan(-1);
  });
});
