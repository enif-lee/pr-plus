/**
 * Pure merge-box status copy + primary CTA presentation from PR detail fields.
 * Mirrors GitHub's merge box role: one headline, one helper, clear CTAs.
 */

export type MergeBoxTone = 'ok' | 'warn' | 'danger' | 'muted' | 'draft';

/** Button visual variant (maps to prp-btn--*). */
export type MergeCtaVariant = 'ok' | 'warn' | 'danger' | 'default';

export type MergeMethod = 'merge' | 'squash' | 'rebase';

export interface MergeBoxStatus {
  kind: 'merged' | 'draft' | 'blocked' | 'clean' | 'unstable' | 'unknown';
  tone: MergeBoxTone;
  /** Primary status line (GitHub-like). */
  headline: string;
  /** Supporting explanation under the headline. */
  helper: string;
  /** Optional single-line checks summary (null = omit). */
  checksLine: string | null;
  /** Show primary merge control. */
  showMerge: boolean;
  /** Merge button enabled (clickable). */
  canMerge: boolean;
  /**
   * Viewer may force-merge / bypass (only when detail signals permission).
   * When true on a blocked PR, canMerge is also true and CTA uses force wording.
   */
  forceMerge: boolean;
  /** Primary merge button visual tone — never unqualified green when blocked/warn. */
  ctaVariant: MergeCtaVariant;
  showUpdateBranch: boolean;
  /** 'ready' | 'draft' | null when toggle not shown */
  draftToggle: 'ready' | 'draft' | null;
}

export const MERGE_METHODS: Array<{ id: MergeMethod; label: string; description: string }> = [
  {
    id: 'merge',
    label: 'Create a merge commit',
    description:
      'All commits from this branch will be added to the base branch via a merge commit.',
  },
  {
    id: 'squash',
    label: 'Squash and merge',
    description:
      'The commits from this branch will be combined into one commit in the base branch.',
  },
  {
    id: 'rebase',
    label: 'Rebase and merge',
    description:
      'The commits from this branch will be rebased and added to the base branch.',
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

/**
 * Label for the primary merge control.
 * @param opts.force when true, prefix with Force (admin / bypass path)
 */
export function mergeMethodButtonLabel(
  method: MergeMethod,
  opts: { force?: boolean } = {}
): string {
  const force = Boolean(opts.force);
  if (method === 'squash') {
    return force ? 'Force squash and merge' : 'Squash and merge';
  }
  if (method === 'rebase') {
    return force ? 'Force rebase and merge' : 'Rebase and merge';
  }
  return force ? 'Force merge pull request' : 'Merge pull request';
}

/**
 * Whether detail snapshot says the viewer may force-merge / bypass rules.
 * Defaults false when permission is unknown (no false-green force CTA).
 */
export function viewerMayForceMerge(detail: any): boolean {
  const d = detail || {};
  if (d.viewerCanMergeAsAdmin === true) return true;
  if (d.canForceMerge === true) return true;
  if (d.viewerAdmin === true) return true;
  if (d.viewerPermission === 'admin') return true;
  if (String(d.viewerPermission || '').toLowerCase() === 'admin') return true;
  return false;
}

/**
 * Count real status/check-run rows. Prefer array lengths; fall back to totalCount.
 * GitHub combined status reports state:"pending" with total_count:0 when empty —
 * that must not count as "checks still running".
 */
export function checksItemCount(detail: any): number {
  const c = detail?.checks || {};
  const fromArrays =
    (Array.isArray(c.statuses) ? c.statuses.length : 0) +
    (Array.isArray(c.checkRuns)
      ? c.checkRuns.length
      : Array.isArray(c.check_runs)
        ? c.check_runs.length
        : 0);
  if (fromArrays > 0) return fromArrays;
  const t = Number(c.totalCount);
  return Number.isFinite(t) && t > 0 ? t : 0;
}

/**
 * Effective checks state for merge-box UX. Empty payload → unknown (not pending).
 */
export function effectiveChecksState(detail: any): string {
  if (checksItemCount(detail) === 0) return 'unknown';
  return String(detail?.checks?.state || 'unknown')
    .trim()
    .toLowerCase() || 'unknown';
}

function checksLineFrom(d: any): string | null {
  const count = checksItemCount(d);
  const checksState = effectiveChecksState(d);
  if (!count || !checksState || checksState === 'unknown') return null;
  return `Checks: ${checksState} (${count})`;
}

/**
 * Build merge-box presentation + primary CTA from a PR detail snapshot.
 */
export function buildMergeBoxStatus(detail: any): MergeBoxStatus {
  const d = detail || {};
  const checksState = effectiveChecksState(d);
  const checksLine = checksLineFrom(d);
  const mergeableState = String(d.mergeableState || d.mergeable_state || '')
    .trim()
    .toLowerCase();
  const forceAllowed = viewerMayForceMerge(d);

  if (d.merged) {
    return {
      kind: 'merged',
      tone: 'ok',
      headline: 'Pull request successfully merged and closed',
      helper: 'This pull request has been merged.',
      checksLine: null,
      showMerge: false,
      canMerge: false,
      forceMerge: false,
      ctaVariant: 'default',
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
      forceMerge: false,
      ctaVariant: 'default',
      showUpdateBranch: false,
      draftToggle: null,
    };
  }

  if (d.draft) {
    return {
      kind: 'draft',
      tone: 'draft',
      headline: 'This pull request is still a work in progress',
      helper:
        'Draft pull requests cannot be merged. Mark it ready for review when you are done.',
      checksLine,
      showMerge: false,
      canMerge: false,
      forceMerge: false,
      ctaVariant: 'default',
      showUpdateBranch: true,
      draftToggle: 'ready',
    };
  }

  // Conflicts (dirty / mergeable=false without policy "blocked") cannot be
  // force-merged via the API — only resolve conflicts. Force CTA is only for
  // policy-blocked PRs when the viewer may bypass rules (admin).
  const isDirty =
    mergeableState === 'dirty' ||
    (d.mergeable === false && mergeableState !== 'blocked');
  const isPolicyBlocked = mergeableState === 'blocked';

  if (isDirty) {
    return {
      kind: 'blocked',
      tone: 'danger',
      headline: 'This branch has conflicts that must be resolved',
      helper:
        'You can resolve conflicts via the command line or GitHub web UI, then update this branch.',
      checksLine,
      showMerge: true,
      canMerge: false,
      forceMerge: false,
      ctaVariant: 'danger',
      showUpdateBranch: true,
      draftToggle: 'draft',
    };
  }

  if (isPolicyBlocked || d.mergeable === false) {
    // mergeable=false + blocked (or blocked alone): checks / branch protection
    const canForce = forceAllowed;
    return {
      kind: 'blocked',
      tone: 'danger',
      headline: 'Required status checks must pass before merging',
      helper: canForce
        ? 'Repository rules block a normal merge. You can force-merge if you accept the risk.'
        : 'Fix failing checks or update the branch, then try again.',
      checksLine,
      showMerge: true,
      canMerge: canForce,
      forceMerge: canForce,
      ctaVariant: 'danger',
      showUpdateBranch: true,
      draftToggle: 'draft',
    };
  }

  // Still computing mergeability — do not show green success CTA
  if (d.mergeable == null && mergeableState !== 'clean' && mergeableState !== 'unstable') {
    return {
      kind: 'unknown',
      tone: 'muted',
      headline: 'Checking if this branch can be merged…',
      helper: 'Mergeability is still being calculated. Try again in a moment.',
      checksLine,
      showMerge: true,
      canMerge: false,
      forceMerge: false,
      ctaVariant: 'default',
      showUpdateBranch: true,
      draftToggle: 'draft',
    };
  }

  // Unstable: mergeable but failing/pending checks (real items only).
  // Empty checks with legacy state:"pending" or GitHub combined default must not warn.
  const hasRealChecks = checksItemCount(d) > 0;
  const unstable =
    (hasRealChecks &&
      (checksState === 'failure' ||
        checksState === 'pending' ||
        checksState === 'error')) ||
    (mergeableState === 'unstable' && hasRealChecks);
  if (unstable && d.mergeable !== false) {
    return {
      kind: 'unstable',
      tone: 'warn',
      headline:
        checksState === 'pending'
          ? 'Some checks are still running'
          : 'Merging is blocked by failing or pending checks',
      helper:
        'You can still attempt a merge if repository rules allow it; checks may be incomplete.',
      checksLine,
      showMerge: true,
      canMerge: true,
      forceMerge: false,
      ctaVariant: 'warn',
      showUpdateBranch: true,
      draftToggle: 'draft',
    };
  }

  // Clean / ready
  return {
    kind: 'clean',
    tone: 'ok',
    headline: 'This branch has no conflicts with the base branch',
    helper: 'Merging can be performed automatically.',
    checksLine,
    showMerge: true,
    canMerge: true,
    forceMerge: false,
    ctaVariant: 'ok',
    showUpdateBranch: true,
    draftToggle: 'draft',
  };
}
