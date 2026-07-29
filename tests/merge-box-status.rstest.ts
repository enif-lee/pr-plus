/**
 * Merge box status — Update branch + repository merge method settings.
 */
import { describe, expect, test } from '@rstest/core';
import {
  allowedMergeMethods,
  buildMergeBoxStatus,
  canUpdateBranch,
  coerceMergeMethod,
  defaultMergeMethod,
  mergeMethodsForUi,
} from '../src/modal/lib/merge-box-status';

describe('canUpdateBranch', () => {
  test('false when merged or closed', () => {
    expect(canUpdateBranch({ state: 'open', merged: true, behindBy: 3 })).toBe(
      false
    );
    expect(canUpdateBranch({ state: 'closed', behindBy: 3 })).toBe(false);
  });

  test('true when behindBy > 0', () => {
    expect(
      canUpdateBranch({ state: 'open', mergeableState: 'clean', behindBy: 2 })
    ).toBe(true);
  });

  test('false when behindBy is 0 even if open', () => {
    expect(
      canUpdateBranch({ state: 'open', mergeableState: 'blocked', behindBy: 0 })
    ).toBe(false);
  });

  test('true for mergeable_state behind / GraphQL BEHIND', () => {
    expect(canUpdateBranch({ state: 'open', mergeableState: 'behind' })).toBe(
      true
    );
    expect(
      canUpdateBranch({ state: 'open', mergeStateStatus: 'BEHIND' })
    ).toBe(true);
  });

  test('false for clean / unstable without behind count', () => {
    expect(canUpdateBranch({ state: 'open', mergeableState: 'clean' })).toBe(
      false
    );
    expect(
      canUpdateBranch({ state: 'open', mergeableState: 'unstable' })
    ).toBe(false);
    expect(canUpdateBranch({ state: 'open', mergeStateStatus: 'CLEAN' })).toBe(
      false
    );
  });

  test('false for blocked/dirty without behind signal', () => {
    expect(canUpdateBranch({ state: 'open', mergeableState: 'blocked' })).toBe(
      false
    );
    expect(canUpdateBranch({ state: 'open', mergeableState: 'dirty' })).toBe(
      false
    );
  });
});

describe('buildMergeBoxStatus terminal states', () => {
  test('merged uses purple tone', () => {
    const ms = buildMergeBoxStatus({
      state: 'closed',
      merged: true,
    });
    expect(ms.kind).toBe('merged');
    expect(ms.tone).toBe('merged');
    expect(ms.showMerge).toBe(false);
  });

  test('closed (not merged) uses closed/red tone', () => {
    const ms = buildMergeBoxStatus({
      state: 'closed',
      merged: false,
    });
    expect(ms.kind).toBe('closed');
    expect(ms.tone).toBe('closed');
    expect(ms.showMerge).toBe(false);
  });
});

describe('buildMergeBoxStatus showUpdateBranch', () => {
  test('hides Update branch on clean up-to-date PR', () => {
    const ms = buildMergeBoxStatus({
      state: 'open',
      merged: false,
      draft: false,
      mergeable: true,
      mergeableState: 'clean',
      behindBy: 0,
    });
    expect(ms.kind).toBe('clean');
    expect(ms.showUpdateBranch).toBe(false);
  });

  test('shows Update branch when behind', () => {
    const ms = buildMergeBoxStatus({
      state: 'open',
      merged: false,
      draft: false,
      mergeable: true,
      mergeableState: 'behind',
      behindBy: 4,
    });
    expect(ms.showUpdateBranch).toBe(true);
  });

  test('hides when merged', () => {
    const ms = buildMergeBoxStatus({
      state: 'closed',
      merged: true,
      mergeableState: 'behind',
      behindBy: 2,
    });
    expect(ms.showUpdateBranch).toBe(false);
  });
});

describe('allowedMergeMethods (repo settings)', () => {
  test('unknown flags → all three methods', () => {
    expect(allowedMergeMethods({})).toEqual(['merge', 'squash', 'rebase']);
    expect(allowedMergeMethods({ allowMergeCommit: null })).toEqual([
      'merge',
      'squash',
      'rebase',
    ]);
  });

  test('filters by allow_* / camelCase', () => {
    expect(
      allowedMergeMethods({
        allowMergeCommit: false,
        allowSquashMerge: true,
        allowRebaseMerge: false,
      })
    ).toEqual(['squash']);
    expect(
      allowedMergeMethods({
        allow_merge_commit: true,
        allow_squash_merge: false,
        allow_rebase_merge: true,
      })
    ).toEqual(['merge', 'rebase']);
  });

  test('all disabled → empty list', () => {
    expect(
      allowedMergeMethods({
        allowMergeCommit: false,
        allowSquashMerge: false,
        allowRebaseMerge: false,
      })
    ).toEqual([]);
  });

  test('mergeMethodsForUi preserves labels for allowed only', () => {
    const rows = mergeMethodsForUi({
      allowMergeCommit: false,
      allowSquashMerge: true,
      allowRebaseMerge: true,
    });
    expect(rows.map((r) => r.id)).toEqual(['squash', 'rebase']);
    expect(rows[0].label).toMatch(/Squash/i);
  });

  test('defaultMergeMethod prefers first allowed / keeps preferred', () => {
    const detail = {
      allowMergeCommit: false,
      allowSquashMerge: true,
      allowRebaseMerge: true,
    };
    expect(defaultMergeMethod(detail)).toBe('squash');
    expect(defaultMergeMethod(detail, 'rebase')).toBe('rebase');
    expect(defaultMergeMethod(detail, 'merge')).toBe('squash');
  });

  test('coerceMergeMethod returns null when none allowed', () => {
    expect(
      coerceMergeMethod(
        {
          allowMergeCommit: false,
          allowSquashMerge: false,
          allowRebaseMerge: false,
        },
        'merge'
      )
    ).toBe(null);
    expect(
      coerceMergeMethod(
        {
          allowMergeCommit: false,
          allowSquashMerge: true,
          allowRebaseMerge: false,
        },
        'merge'
      )
    ).toBe('squash');
  });

  test('buildMergeBoxStatus hides merge CTA when all methods disabled', () => {
    const ms = buildMergeBoxStatus({
      state: 'open',
      merged: false,
      draft: false,
      mergeable: true,
      mergeableState: 'clean',
      allowMergeCommit: false,
      allowSquashMerge: false,
      allowRebaseMerge: false,
    });
    expect(ms.showMerge).toBe(false);
    expect(ms.canMerge).toBe(false);
    expect(ms.headline).toMatch(/disabled/i);
  });

  test('buildMergeBoxStatus keeps merge CTA when only squash allowed', () => {
    const ms = buildMergeBoxStatus({
      state: 'open',
      merged: false,
      draft: false,
      mergeable: true,
      mergeableState: 'clean',
      allowMergeCommit: false,
      allowSquashMerge: true,
      allowRebaseMerge: false,
    });
    expect(ms.showMerge).toBe(true);
    expect(ms.canMerge).toBe(true);
    expect(ms.kind).toBe('clean');
  });
});
