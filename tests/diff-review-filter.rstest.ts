/**
 * Diff review navigator multi-filter pure helpers (shipped).
 */
import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  availableDiffReviewStatuses,
  createDefaultDiffReviewFilter,
  createUnrestrictedDiffReviewFilter,
  effectiveDiffReviewStatuses,
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

  test('pendingCount 0: pending excluded from empty/all evaluation', () => {
    // All *visible* chips selected (unresolved+resolved) while pending is 0
    // → treat as unrestricted (pending is not an evaluation target).
    const allVisible = normalizeDiffReviewFilter({
      statuses: ['unresolved', 'resolved'],
    });
    expect(isStatusFilterUnrestricted(allVisible, { pendingCount: 0 })).toBe(
      true
    );
    expect(isStatusFilterUnrestricted(allVisible)).toBe(false); // pending unknown/on
    expect(availableDiffReviewStatuses({ pendingCount: 0 })).toEqual([
      'unresolved',
      'resolved',
    ]);

    // Default unresolved+pending with pendingCount 0 → effective unresolved only
    const def = createDefaultDiffReviewFilter();
    expect(effectiveDiffReviewStatuses(def, { pendingCount: 0 })).toEqual([
      'unresolved',
    ]);
    expect(isStatusFilterUnrestricted(def, { pendingCount: 0 })).toBe(false);

    // Only ghost pending left (user cleared unresolved) → empty effective → all
    const ghostPending = normalizeDiffReviewFilter({ statuses: ['pending'] });
    expect(effectiveDiffReviewStatuses(ghostPending, { pendingCount: 0 })).toEqual(
      []
    );
    expect(isStatusFilterUnrestricted(ghostPending, { pendingCount: 0 })).toBe(
      true
    );
    const roots = filterReviewRootsForDiffNav(
      commentsFixture().map((c) =>
        c.id === 3 ? { ...c, pending: false } : c
      ),
      ghostPending,
      null,
      { pendingCount: 0 }
    );
    // unrestricted: all roots (fixture with pending cleared still has 1,2,3,4 roots)
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
    // File list is no longer scoped by review multi-filter (threads only)
    const files = [
      { filename: 'a.ts' },
      { filename: 'b.ts' },
      { filename: 'c.ts' },
    ];
    expect(
      filterFilesByDiffReviewFilter(files, commentsFixture(), def).map(
        (f) => f.filename
      )
    ).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  test('jump-widen path in App uses unrestricted not default', () => {
    const app = readFileSync(
      resolve(root, 'src/modal/hooks/useDiffConversationNav.ts'),
      'utf8'
    );
    expect(app).toMatch(/createUnrestrictedDiffReviewFilter/);
    expect(app).toMatch(
      /Widen to unrestricted[\s\S]{0,400}createUnrestrictedDiffReviewFilter/
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
    ) as { statuses: string[] };
    expect(next.statuses).toContain('resolved');
    expect(next.statuses).toContain('unresolved');
    // null current seeds default (unresolved+pending) then toggles target
    const fromNull = toggleReviewFilter(null, 'resolved') as {
      statuses: string[];
    };
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

  test('filterFilesByDiffReviewFilter is identity (threads-only policy)', () => {
    const files = [
      { filename: 'a.ts' },
      { filename: 'b.ts' },
      { filename: 'c.ts' },
      { filename: 'z.ts' },
    ];
    const f = createDefaultDiffReviewFilter();
    const out = filterFilesByDiffReviewFilter(files, commentsFixture(), f);
    expect(out.map((x) => x.filename).sort()).toEqual([
      'a.ts',
      'b.ts',
      'c.ts',
      'z.ts',
    ]);
  });

  test('listReviewAuthorsFromComments unique sorted with avatars', () => {
    const withAv = commentsFixture().map((c) =>
      c.id === 1
        ? { ...c, avatarUrl: 'https://example.com/alice.png' }
        : c
    );
    expect(listReviewAuthorsFromComments(withAv)).toEqual([
      { login: 'alice', avatarUrl: 'https://example.com/alice.png' },
      { login: 'bob', avatarUrl: null },
      { login: 'carol', avatarUrl: null },
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
    // Labels via i18n keys (locale catalogs hold English copy)
    expect(tb).toMatch(/hide_outdated_comments/);
    expect(tb).toMatch(/reviewed_by/);
    expect(tb).toMatch(/IconGear/);
    expect(tb).toMatch(/Avatar/);
    expect(tb).toMatch(/prp-diff-review-settings__author/);
    // Display options live in the gear popover (not primary toolbar row)
    expect(tb).toMatch(/hide_whitespace/);
    expect(tb).toMatch(/data-prp-hide-whitespace/);
    expect(tb).toMatch(/value="unified"/);
    expect(tb).toMatch(/value="split"/);
    // Portaled so Diff shell overflow never clips Reviewed-by / Diff view
    expect(tb).toMatch(/createPortal/);
    expect(tb).toMatch(/prp-diff-review-settings--portal/);
    // StepNav stays when filters yield 0 mapped roots but PR has threads
    expect(tb).toMatch(/showReviewFilter \|\|/);
    expect(tb).toMatch(/filtered_review_threads|Filtered review threads/);
    // No exclusive single-select assignment of string modes only
    expect(tb).not.toMatch(/reviewFilter === 'unresolved' \? null : 'unresolved'/);
  });

  test('PrModalApp defaults to createDefaultDiffReviewFilter', () => {
    const app = [
      'src/modal/app/PrModalShell.tsx',
      'src/modal/hooks/useDiffConversationNav.ts',
    ]
      .map((rel) => readFileSync(resolve(root, rel), 'utf8'))
      .join('\n');
    expect(app).toMatch(/createDefaultDiffReviewFilter/);
    expect(app).toMatch(/filterReviewRootsForDiffNav/);
    expect(app).toMatch(/filterFilesCommentedOnly/);
    expect(app).not.toMatch(/filterFilesByDiffReviewFilter\(/);
    expect(app).toMatch(/onPatchReviewFilter/);
  });

  test('PrModalApp schedules filter writes via startTransition (not urgent-only)', () => {
    const app = [
      'src/modal/app/PrModalShell.tsx',
      'src/modal/hooks/useDiffConversationNav.ts',
    ]
      .map((rel) => readFileSync(resolve(root, rel), 'utf8'))
      .join('\n');
    expect(app).toMatch(/startTransition/);
    expect(app).toMatch(/function scheduleDiffReviewFilter/);
    // Toggle + patch go through the low-priority scheduler
    expect(app).toMatch(/scheduleDiffReviewFilter\(\(prev\)/);
    // Jump-widen also uses concurrent scheduling
    expect(app).toMatch(
      /startTransition\(\(\)\s*=>\s*\{\s*setDiffReviewFilter\(createUnrestrictedDiffReviewFilter/
    );
    // Must not only rely on useDeferredValue for the write path
    expect(app).toMatch(/useDeferredValue\(diffReviewFilter\)/);
  });

  test('setDiffReviewHideOutdated + author multi-select pure path', () => {
    let f = createDefaultDiffReviewFilter();
    f = setDiffReviewHideOutdated(f, true);
    expect(f.hideOutdated).toBe(true);
    // status defaults preserved
    expect(f.statuses).toEqual(
      expect.arrayContaining(['unresolved', 'pending'])
    );
    f = toggleDiffReviewAuthor(f, 'carol');
    expect(f.authors.map((a) => a.toLowerCase())).toContain('carol');
    const roots = filterReviewRootsForDiffNav(commentsFixture(), f);
    // carol id=4 unresolved, not outdated
    expect(roots.map((r) => r.id)).toEqual([4]);
    // hide outdated drops bob's resolved outdated even if statuses widen
    f = normalizeDiffReviewFilter({
      statuses: [],
      hideOutdated: true,
      authors: [],
    });
    const all = filterReviewRootsForDiffNav(commentsFixture(), f);
    expect(all.map((r) => r.id).sort()).toEqual([1, 3, 4]);
    expect(all.some((r) => r.id === 2)).toBe(false);
  });

  test('StepNav count is variable width; arrow cells equal fixed', () => {
    const css = readFileSync(
      resolve(root, 'src/modal/views/conversation/CommentNavigator.css'),
      'utf8'
    );
    // count (max-content) | ↑ fixed | ↓ fixed
    expect(css).toMatch(
      /grid-template-columns:\s*max-content\s+var\(--prp-step-nav-btn/
    );
    expect(css).toMatch(/\.prp-step-nav__meta\s*\{[^}]*width:\s*auto/s);
    expect(css).toMatch(
      /\.prp-step-nav__btn\s*\{[^}]*width:\s*var\(--prp-step-nav-btn/s
    );
    expect(css).toMatch(/\.prp-step-nav__btn\s*\{[^}]*padding:\s*0/s);
    expect(css).toMatch(/\.prp-step-nav__btn\s*\{[^}]*margin:\s*0/s);
  });
});
