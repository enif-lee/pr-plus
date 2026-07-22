/**
 * Pure merge-box status copy + action flags from PR detail fields.
 * Mirrors GitHub's merge box role: one headline, one helper, clear CTAs.
 */

export type MergeBoxTone = 'ok' | 'warn' | 'danger' | 'muted' | 'draft';

export type MergeMethod = 'merge' | 'squash' | 'rebase';

export interface MergeBoxStatus {
  kind: 'merged' | 'draft' | 'blocked' | 'clean' | 'unknown';
  tone: MergeBoxTone;
  /** Primary status line (GitHub-like). */
  headline: string;
  /** Supporting explanation under the headline. */
  helper: string;
  /** Optional single-line checks summary (null = omit). */
  checksLine: string | null;
  /** Show primary merge control. */
  showMerge: boolean;
  /** Merge button enabled. */
  canMerge: boolean;
  showUpdateBranch: boolean;
  /** 'ready' | 'draft' | null when toggle not shown */
  draftToggle: 'ready' | 'draft' | null;
}

export const MERGE_METHODS: Array<{ id: MergeMethod; label: string; description: string }> = [
  {
    id: 'merge',
    label: 'Create a merge commit',
    description: 'All commits from this branch will be added to the base branch via a merge commit.',
  },
  {
    id: 'squash',
    label: 'Squash and merge',
    description: 'The commits from this branch will be combined into one commit in the base branch.',
  },
  {
    id: 'rebase',
    label: 'Rebase and merge',
    description: 'The commits from this branch will be rebased and added to the base branch.',
  },
];

export function normalizeMergeMethod(raw: unknown): MergeMethod {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (v === 'squash') return 'squash';
  if (v === 'rebase') return 'rebase';
  return 'merge';
}

export function mergeMethodButtonLabel(method: MergeMethod): string {
  if (method === 'squash') return 'Squash and merge';
  if (method === 'rebase') return 'Rebase and merge';
  return 'Merge pull request';
}

/**
 * Build merge-box presentation from a PR detail snapshot.
 */
export function buildMergeBoxStatus(detail: any): MergeBoxStatus {
  const d = detail || {};
  const checksState = d.checks?.state ? String(d.checks.state) : '';
  const checksLine = checksState
    ? `Checks: ${checksState}${
        Number.isFinite(d.checks?.totalCount) ? ` (${d.checks.totalCount})` : ''
      }`
    : null;

  if (d.merged) {
    return {
      kind: 'merged',
      tone: 'ok',
      headline: 'Pull request successfully merged and closed',
      helper: 'This pull request has been merged.',
      checksLine: null,
      showMerge: false,
      canMerge: false,
      showUpdateBranch: false,
      draftToggle: null,
    };
  }

  const isOpen = String(d.state || 'open') === 'open';
  if (!isOpen) {
    return {
      kind: 'unknown',
      tone: 'muted',
      headline: 'Pull request is closed',
      helper: 'Reopen the pull request to merge or update the branch.',
      checksLine,
      showMerge: false,
      canMerge: false,
      showUpdateBranch: false,
      draftToggle: null,
    };
  }

  if (d.draft) {
    return {
      kind: 'draft',
      tone: 'draft',
      headline: 'This pull request is still a work in progress',
      helper: 'Draft pull requests cannot be merged. Mark it ready for review when you are done.',
      checksLine,
      showMerge: false,
      canMerge: false,
      showUpdateBranch: true,
      draftToggle: 'ready',
    };
  }

  if (d.mergeable === false) {
    const blockedByChecks =
      checksState === 'failure' || checksState === 'error';
    return {
      kind: 'blocked',
      tone: 'danger',
      headline: blockedByChecks
        ? 'Required status checks must pass before merging'
        : 'This branch has conflicts that must be resolved',
      helper: blockedByChecks
        ? 'Fix failing checks or update the branch, then try again.'
        : 'You can resolve conflicts via the command line or GitHub web UI, then update this branch.',
      checksLine,
      showMerge: true,
      canMerge: false,
      showUpdateBranch: true,
      draftToggle: 'draft',
    };
  }

  // clean / unknown mergeable
  const unstable = String(d.mergeableState || '') === 'unstable';
  return {
    kind: 'clean',
    tone: unstable ? 'warn' : 'ok',
    headline: unstable
      ? 'Merging is blocked by failing or pending checks'
      : 'This branch has no conflicts with the base branch',
    helper: unstable
      ? 'You can still attempt a merge if repository rules allow it; checks may be incomplete.'
      : 'Merging can be performed automatically.',
    checksLine,
    showMerge: true,
    canMerge: true,
    showUpdateBranch: true,
    draftToggle: 'draft',
  };
}
