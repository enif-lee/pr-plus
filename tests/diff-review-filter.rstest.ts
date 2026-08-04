/**
 * Diff review navigator multi-filter pure helpers (shipped).
 */
import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createDefaultDiffReviewFilter,
  createUnrestrictedDiffReviewFilter,
  filterFilesByDiffReviewFilter,
  filterReviewCommentsForDiffNav,
  filterReviewRootsForDiffNav,
  isStatusActive,
  isStatusFilterUnrestricted,
  listReviewAuthorsFromComments,
  normalizeDiffReviewFilter,
  rootMatchesDiffReviewFilter,
  setDiffReviewHideOutdated,
  toggleDiffReviewAuthor,
  toggleDiffReviewStatus,
  toggleReviewFilter,
} from '../src/modal/lib/diff-review-filter.ts';
import { toggleReviewFilter as toggleFromShortcuts } from '../src/modal/lib/shortcut-policy-actions.ts';

const root = resolve(__dirname, '..');

function commentsFixture() {
  return [
    {
      id: 1,
      author: 'alice',
      path: 'a.ts',
      line: 1,
      resolved: false,
      pending: false,
      outdated: false,
      body: 'open',
    },
    {
      id: 2,
      author: 'bob',
      path: 'b.ts',
      line: 2,
      resolved: true,
      pending: false,
      outdated: true,
      body: 'old resolved',
    },
    {
      id: 3,
      author: 'alice',
      path: 'c.ts',
      line: 3,
      resolved: false,
      pending: true,
      outdated: false,
      body: 'draft',
    },
    {
      id: 4,
      author: 'carol',
      path: 'a.ts',
      line: 10,
      resolved: false,
      pending: false,
      outdated: false,
      body: 'also open',
    },
    // reply to 1
    {
      id: 5,
      author: 'bob',
      path: 'a.ts',
      line: 1,
      inReplyToId: 1,
      resolved: false,
      body: 'reply',
    },
  ];
}

describe('normalize + multi-status', () => {
  test('default is unresolved + pending', () => {
    const d = createDefaultDiffReviewFilter();
    expect(d.statuses.sort()).toEqual(['pending', 'unresolved'].sort());
    expect(d.hideOutdated).toBe(false);
    expect(d.authors).toEqual([]);
  });

  test('empty statuses ≡ unrestricted (all)', () => {
    const f = normalizeDiffReviewFilter({ statuses: [] });
    expect(isStatusFilterUnrestricted(f)).toBe(true);
    const roots = filterReviewRootsForDiffNav(commentsFixture(), f);
    expect(roots.map((r) => r.id).sort()).toEqual([1, 2, 3, 4]);
  });

  test('createUnrestrictedDiffReviewFilter keeps resolved roots (jump widen)', () => {
    const unrestricted = createUnrestrictedDiffReviewFilter();
    expect(unrestricted.statuses).toEqual([]);
    expect(isStatusFilterUnrestricted(unrestricted)).toBe(true);
    const def = createDefaultDiffReviewFilter();
    // Default hides pure resolved id=2; unrestricted must include it
    const defIds = filterReviewRootsForDiffNav(commentsFixture(), def).map(
      (r) => r.id
    );
    const allIds = filterReviewRootsForDiffNav(
      commentsFixture(),
      unrestricted
    ).map((r) => r.id);
    expect(defIds).not.toContain(2);
    expect(allIds).toContain(2);
    expect(allIds.sort()).toEqual([1, 2, 3, 4]);
    // Files with only resolved threads reappear under unrestricted
    const files = [
      { filename: 'a.ts' },
      { filename: 'b.ts' },
      { filename: 'c.ts' },
    ];
    const underDefault = filterFilesByDiffReviewFilter(
      files,
      commentsFixture(),
      def
    ).map((f) => f.filename);
    const underAll = filterFilesByDiffReviewFilter(
      files,
      commentsFixture(),
      unrestricted
    ).map((f) => f.filename);
    expect(underDefault).not.toContain('b.ts');
    expect(underAll.sort()).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  test('jump-widen path in App uses unrestricted not default', () => {
    const app = readFileSync(
      resolve(root, 'src/modal/app/PrModalApp.impl.tsx'),
      'utf8'
    );
    expect(app).toMatch(/createUnrestrictedDiffReviewFilter/);
    expect(app).toMatch(
      /Widen to unrestricted[\s\S]{0,200}createUnrestrictedDiffReviewFilter/
    );
    // Must not widen with product default (would leave resolved-only hidden)
    expect(app).not.toMatch(
      /Widen filters so the jumped thread is navigable\s*\n\s*setDiffReviewFilter\(createDefaultDiffReviewFilter/
    );
  });

  test('toggle multi-select adds/removes without exclusive clear', () => {
    let f = createDefaultDiffReviewFilter();
    expect(isStatusActive(f, 'unresolved')).toBe(true);
    expect(isStatusActive(f, 'pending')).toBe(true);
    f = toggleDiffReviewStatus(f, 'resolved');
    expect(f.statuses).toContain('resolved');
    expect(f.statuses).toContain('unresolved');
    f = toggleDiffReviewStatus(f, 'unresolved');
    expect(isStatusActive(f, 'unresolved')).toBe(false);
    expect(isStatusActive(f, 'pending')).toBe(true);
  });

  test('legacy string mode still normalizes', () => {
    const f = normalizeDiffReviewFilter('resolved');
    expect(f.statuses).toEqual(['resolved']);
  });

  test('shortcut-policy toggleReviewFilter returns multi state', () => {
    const next = toggleFromShortcuts(
      { statuses: ['unresolved', 'pending'], hideOutdated: false, authors: [] },
      'resolved'
    );
    expect(next.statuses).toContain('resolved');
    expect(next.statuses).toContain('unresolved');
    // null current seeds default (unresolved+pending) then toggles target
    const fromNull = toggleReviewFilter(null, 'resolved');
    expect(fromNull.statuses).toContain('resolved');
    expect(fromNull.statuses).toContain('unresolved');
    expect(fromNull.statuses).toContain('pending');
  });
});

describe('hide outdated + authors + compose', () => {
  test('hide outdated drops outdated roots', () => {
    const f = setDiffReviewHideOutdated(
      { statuses: [], hideOutdated: false, authors: [] },
      true
    );
    const roots = filterReviewRootsForDiffNav(commentsFixture(), f);
    expect(roots.some((r) => r.id === 2)).toBe(false);
    expect(roots.map((r) => r.id).sort()).toEqual([1, 3, 4]);
  });

  test('author multi-filter keeps only selected authors', () => {
    let f = normalizeDiffReviewFilter({
      statuses: [],
      hideOutdated: false,
      authors: [],
    });
    f = toggleDiffReviewAuthor(f, 'alice');
    const roots = filterReviewRootsForDiffNav(commentsFixture(), f);
    expect(roots.every((r) => String(r.author).toLowerCase() === 'alice')).toBe(
      true
    );
    expect(roots.map((r) => r.id).sort()).toEqual([1, 3]);
  });

  test('default unresolved+pending excludes pure resolved', () => {
    const f = createDefaultDiffReviewFilter();
    const roots = filterReviewRootsForDiffNav(commentsFixture(), f);
    expect(roots.map((r) => r.id).sort()).toEqual([1, 3, 4]);
    expect(roots.some((r) => r.id === 2)).toBe(false);
  });

  test('compose hide outdated + status + author', () => {
    const f = normalizeDiffReviewFilter({
      statuses: ['unresolved', 'resolved'],
      hideOutdated: true,
      authors: ['bob'],
    });
    // bob's only root is outdated resolved → hidden
    expect(
      rootMatchesDiffReviewFilter(
        commentsFixture().find((c) => c.id === 2),
        commentsFixture(),
        f
      )
    ).toBe(false);
    const roots = filterReviewRootsForDiffNav(commentsFixture(), f);
    expect(roots).toEqual([]);
  });

  test('filterReviewCommentsForDiffNav keeps replies of kept roots', () => {
    const f = createDefaultDiffReviewFilter();
    const all = filterReviewCommentsForDiffNav(commentsFixture(), f);
    expect(all.some((c) => c.id === 5)).toBe(true);
    expect(all.some((c) => c.id === 1)).toBe(true);
    expect(all.some((c) => c.id === 2)).toBe(false);
  });

  test('filterFilesByDiffReviewFilter scopes files to matching roots', () => {
    const files = [
      { filename: 'a.ts' },
      { filename: 'b.ts' },
      { filename: 'c.ts' },
      { filename: 'z.ts' },
    ];
    const f = createDefaultDiffReviewFilter();
    const out = filterFilesByDiffReviewFilter(files, commentsFixture(), f);
    expect(out.map((x) => x.filename).sort()).toEqual(['a.ts', 'c.ts']);
  });

  test('filterFilesByDiffReviewFilter falls back to all files when no roots match', () => {
    const files = [
      { filename: 'only.ts' },
      { filename: 'other.ts' },
    ];
    // Only resolved threads exist; default unresolved+pending matches none
    const comments = [
      {
        id: 9,
        author: 'x',
        path: 'only.ts',
        line: 1,
        resolved: true,
        pending: false,
        body: 'done',
      },
    ];
    const f = createDefaultDiffReviewFilter();
    const out = filterFilesByDiffReviewFilter(files, comments, f);
    expect(out.map((x) => x.filename).sort()).toEqual(['only.ts', 'other.ts']);
  });

  test('listReviewAuthorsFromComments unique sorted', () => {
    expect(listReviewAuthorsFromComments(commentsFixture())).toEqual([
      'alice',
      'bob',
      'carol',
    ]);
  });
});

describe('product wiring structure', () => {
  test('DiffToolbar multi-select + gear + settings menu', () => {
    const tb = readFileSync(
      resolve(root, 'src/modal/views/chrome/DiffToolbar.tsx'),
      'utf8'
    );
    expect(tb).toMatch(/isStatusActive/);
    expect(tb).toMatch(/onToggleReviewStatus/);
    expect(tb).toMatch(/data-prp-review-filter-gear/);
    expect(tb).toMatch(/Hide outdated comments/);
    expect(tb).toMatch(/Reviewed by/);
    expect(tb).toMatch(/IconGear/);
    // No exclusive single-select assignment of string modes only
    expect(tb).not.toMatch(/reviewFilter === 'unresolved' \? null : 'unresolved'/);
  });

  test('PrModalApp defaults to createDefaultDiffReviewFilter', () => {
    const app = readFileSync(
      resolve(root, 'src/modal/app/PrModalApp.impl.tsx'),
      'utf8'
    );
    expect(app).toMatch(/createDefaultDiffReviewFilter/);
    expect(app).toMatch(/filterReviewRootsForDiffNav/);
    expect(app).toMatch(/filterFilesByDiffReviewFilter/);
    expect(app).toMatch(/onPatchReviewFilter/);
  });

  test('StepNav buttons share equal width and no asymmetric padding', () => {
    const css = readFileSync(
      resolve(root, 'src/modal/views/conversation/CommentNavigator.css'),
      'utf8'
    );
    expect(css).toMatch(/\.prp-step-nav__btn\s*\{[^}]*width:\s*28px/s);
    expect(css).toMatch(/padding:\s*0/);
    expect(css).toMatch(/max-width:\s*28px/);
    expect(css).toMatch(/margin-right:\s*0/);
  });
});
