/**
 * Merge box status — Update branch + repository merge method settings.
 */
import { describe, expect, test } from '@rstest/core';
import {
  allowedMergeMethods,
  buildMergeBoxStatus,
  BYPASS_RULES_CHECKBOX_LABEL,
  canUpdateBranch,
  coerceMergeMethod,
  defaultMergeMethod,
  detailCommitCount,
  mergeMethodButtonLabel,
  mergeMethodDescription,
  mergeMethodsForUi,
  resolveMergePrimaryAction,
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

  test('merged_at alone is terminal merged (not "checking mergeability")', () => {
    const ms = buildMergeBoxStatus({
      state: 'closed',
      merged: false,
      merged_at: '2026-07-28T08:13:19Z',
      mergeable: null,
      mergeableState: 'unknown',
    });
    expect(ms.kind).toBe('merged');
    expect(ms.tone).toBe('merged');
    expect(ms.headline).toMatch(/merged/i);
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

  test('mergeMethodDescription uses GitHub copy + commit count', () => {
    expect(mergeMethodDescription('merge', 5)).toMatch(/merge commit/i);
    expect(mergeMethodDescription('squash', 5)).toBe(
      'The 5 commits from this branch will be combined into one commit in the base branch.'
    );
    expect(mergeMethodDescription('rebase', 1)).toBe(
      'The 1 commit from this branch will be rebased and added to the base branch.'
    );
    expect(mergeMethodDescription('squash', null)).toMatch(/The commits from this branch/);
  });

  test('detailCommitCount prefers commits array', () => {
    expect(detailCommitCount({ commits: [{}, {}, {}] })).toBe(3);
    expect(detailCommitCount({ commitsTotal: 7 })).toBe(7);
    expect(detailCommitCount({})).toBe(null);
  });

  test('mergeMethodsForUi injects commit count into squash/rebase copy', () => {
    const rows = mergeMethodsForUi({
      allowMergeCommit: true,
      allowSquashMerge: true,
      allowRebaseMerge: true,
      commits: [{}, {}, {}, {}, {}],
    });
    const squash = rows.find((r) => r.id === 'squash');
    expect(squash?.description).toMatch(/5 commits/);
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

  test('unstable (mergeable + failing checks) is mergeable, not blocked — GH parity', () => {
    // callabo-server#2571 style: mergeable=true, mergeable_state=unstable,
    // optional non-required check failures (e.g. claude-review).
    const ms = buildMergeBoxStatus({
      state: 'open',
      merged: false,
      draft: false,
      mergeable: true,
      mergeableState: 'unstable',
      mergeStateStatus: 'UNSTABLE',
      checks: {
        state: 'failure',
        totalCount: 2,
        checkRuns: [
          { name: 'claude-review', conclusion: 'failure', status: 'completed' },
          { name: 'test', conclusion: 'success', status: 'completed' },
        ],
      },
      allowMergeCommit: true,
      allowSquashMerge: true,
      allowRebaseMerge: true,
    });
    expect(ms.kind).toBe('unstable');
    expect(ms.canMerge).toBe(true);
    expect(ms.showMerge).toBe(true);
    expect(ms.forceMerge).toBe(false);
    expect(ms.ctaVariant).toBe('ok');
    expect(ms.tone).toBe('ok');
    expect(ms.headline).toMatch(/no conflicts/i);
    expect(ms.headline).not.toMatch(/blocked/i);
    expect(ms.helper).toMatch(/Merging can be performed automatically/i);
    expect(ms.helper).not.toMatch(/blocked/i);
  });

  test('GraphQL MERGEABLE string + UNSTABLE still mergeable', () => {
    const ms = buildMergeBoxStatus({
      state: 'open',
      merged: false,
      draft: false,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'UNSTABLE',
      checks: {
        state: 'failure',
        checkRuns: [{ name: 'x', conclusion: 'failure', status: 'completed' }],
      },
      allowMergeCommit: true,
    });
    expect(ms.kind).toBe('unstable');
    expect(ms.canMerge).toBe(true);
    expect(ms.ctaVariant).toBe('ok');
    expect(ms.headline).not.toMatch(/blocked/i);
  });

  test('policy blocked still blocks (required checks / reviews)', () => {
    const ms = buildMergeBoxStatus({
      state: 'open',
      merged: false,
      draft: false,
      mergeable: false,
      mergeableState: 'blocked',
      allowMergeCommit: true,
    });
    expect(ms.kind).toBe('blocked');
    expect(ms.canMerge).toBe(false);
    expect(ms.offerBypassRules).toBe(false);
    expect(ms.headline).toMatch(/blocked/i);
  });
});

describe('bypass rules opt-in (GitHub parity)', () => {
  const blockedAdmin = {
    state: 'open',
    merged: false,
    draft: false,
    mergeable: false,
    mergeableState: 'blocked',
    viewerCanMergeAsAdmin: true,
    allowMergeCommit: true,
    allowSquashMerge: true,
    allowRebaseMerge: true,
  };

  const blockedNoAdmin = {
    ...blockedAdmin,
    viewerCanMergeAsAdmin: false,
    canForceMerge: false,
    viewerAdmin: false,
    viewerPermission: 'write',
  };

  test('blocked + can-bypass offers checkbox; merge disabled until accepted', () => {
    const ms = buildMergeBoxStatus(blockedAdmin);
    expect(ms.kind).toBe('blocked');
    expect(ms.offerBypassRules).toBe(true);
    expect(ms.showMerge).toBe(true);
    expect(ms.canMerge).toBe(false);

    const off = resolveMergePrimaryAction(ms, { bypassRulesAccepted: false });
    expect(off.showBypassCheckbox).toBe(true);
    expect(off.bypassCheckboxLabel).toBe(BYPASS_RULES_CHECKBOX_LABEL);
    expect(off.mergeEnabled).toBe(false);
    expect(off.buttonLabel('merge')).toBe('Merge pull request');
    expect(off.bypassWording).toBe(false);

    const on = resolveMergePrimaryAction(ms, { bypassRulesAccepted: true });
    expect(on.showBypassCheckbox).toBe(true);
    expect(on.mergeEnabled).toBe(true);
    expect(on.bypassWording).toBe(true);
    expect(on.buttonLabel('merge')).toBe('Bypass rules and merge');
    expect(on.buttonLabel('squash')).toMatch(/Bypass rules and squash/i);
    expect(on.ctaVariant).toBe('danger');
  });

  test('blocked without admin permission: no bypass checkbox', () => {
    const ms = buildMergeBoxStatus(blockedNoAdmin);
    expect(ms.kind).toBe('blocked');
    expect(ms.offerBypassRules).toBe(false);
    expect(ms.canMerge).toBe(false);
    const act = resolveMergePrimaryAction(ms, { bypassRulesAccepted: true });
    expect(act.showBypassCheckbox).toBe(false);
    expect(act.mergeEnabled).toBe(false);
  });

  test('clean / unstable never offer bypass checkbox', () => {
    for (const state of ['clean', 'unstable'] as const) {
      const ms = buildMergeBoxStatus({
        state: 'open',
        merged: false,
        draft: false,
        mergeable: true,
        mergeableState: state,
        viewerCanMergeAsAdmin: true,
        allowMergeCommit: true,
        checks:
          state === 'unstable'
            ? {
                state: 'failure',
                checkRuns: [
                  { name: 'x', conclusion: 'failure', status: 'completed' },
                ],
              }
            : undefined,
      });
      expect(ms.offerBypassRules).toBe(false);
      expect(ms.canMerge).toBe(true);
      const act = resolveMergePrimaryAction(ms, { bypassRulesAccepted: true });
      expect(act.showBypassCheckbox).toBe(false);
      expect(act.mergeEnabled).toBe(true);
      expect(act.buttonLabel('merge')).toBe('Merge pull request');
    }
  });

  test('conflicts never offer force-bypass merge path', () => {
    const ms = buildMergeBoxStatus({
      state: 'open',
      merged: false,
      draft: false,
      mergeable: false,
      mergeableState: 'dirty',
      viewerCanMergeAsAdmin: true,
      allowMergeCommit: true,
    });
    expect(ms.kind).toBe('conflicts');
    expect(ms.offerBypassRules).toBe(false);
    expect(ms.showMerge).toBe(false);
    const act = resolveMergePrimaryAction(ms, { bypassRulesAccepted: true });
    expect(act.showBypassCheckbox).toBe(false);
    expect(act.mergeEnabled).toBe(false);
  });

  test('mergeMethodButtonLabel bypass wording', () => {
    expect(mergeMethodButtonLabel('merge', { bypass: true })).toBe(
      'Bypass rules and merge'
    );
    expect(mergeMethodButtonLabel('rebase', { bypass: true })).toMatch(
      /Bypass rules and rebase/
    );
  });

});
