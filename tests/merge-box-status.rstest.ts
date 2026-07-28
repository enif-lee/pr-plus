/**
 * Merge box status — Update branch only when head is behind base.
 */
import { describe, expect, test } from '@rstest/core';
import {
  buildMergeBoxStatus,
  canUpdateBranch,
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
