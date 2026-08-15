/**
 * Pure merge-box status copy + primary CTA presentation from PR detail fields.
 * Mirrors GitHub's merge box role: one headline, one helper, clear CTAs.
 */

export type MergeBoxTone =
  | 'ok'
  | 'warn'
  | 'danger'
  | 'muted'
  | 'draft'
  /** GitHub merged purple */
  | 'merged'
  /** Closed without merge — red */
  | 'closed';

/** Button visual variant (maps to prp-btn--*). */
export type MergeCtaVariant = 'ok' | 'warn' | 'danger' | 'default';

export type MergeMethod = 'merge' | 'squash' | 'rebase';

export interface MergeBoxStatus {
  kind:
    | 'merged'
    | 'closed'
    | 'draft'
    | 'blocked'
    | 'conflicts'
    | 'clean'
    | 'unstable'
    | 'unknown';
  tone: MergeBoxTone;
  /** Primary status line (GitHub-like). */
  headline: string;
  /** Supporting explanation under the headline. */
  helper: string;
  /** Optional single-line checks summary (null = omit). */
  checksLine: string | null;
  /** Show primary merge control. */
  showMerge: boolean;
  /**
   * Baseline merge enablement from status alone (before bypass opt-in).
   * For blocked+bypass-offer, this is false until the UI applies opt-in via
   * `resolveMergePrimaryAction`.
   */
  canMerge: boolean;
  /**
   * True when the primary action uses force/bypass wording after opt-in.
   * Baseline from `buildMergeBoxStatus` is false; live CTA uses
   * `resolveMergePrimaryAction({ bypassRulesAccepted })`.
   */
  forceMerge: boolean;
  /**
   * Show GitHub-style "Merge without waiting for requirements… (bypass rules)"
   * checkbox. Only for policy-blocked PRs when the viewer may admin-bypass.
   */
  offerBypassRules: boolean;
  /** Primary merge button visual tone — never unqualified green when blocked/warn. */
  ctaVariant: MergeCtaVariant;
  showUpdateBranch: boolean;
  /** 'ready' | 'draft' | null when toggle not shown */
  draftToggle: 'ready' | 'draft' | null;
  /** Merge conflicts with base — show Resolve conflicts CTA (not force-merge). */
  showResolveConflicts: boolean;
  /** Paths that conflict (may be empty while still dirty). */
  conflictFiles: string[];
  /** Absolute URL to GitHub's web conflict editor, or null. */
  resolveConflictsUrl: string | null;
}

/** GitHub checkbox copy for admin rule bypass. */
export const BYPASS_RULES_CHECKBOX_LABEL =
  'Merge without waiting for requirements to be met (bypass rules)';

function emptyConflictFields(): Pick<
  MergeBoxStatus,
  'showResolveConflicts' | 'conflictFiles' | 'resolveConflictsUrl'
> {
  return {
    showResolveConflicts: false,
    conflictFiles: [],
    resolveConflictsUrl: null,
  };
}

/**
 * Normalize conflict file paths from a detail snapshot.
 */
export function normalizeConflictFiles(detail: any): string[] {
  const raw =
    detail?.conflictFiles ??
    detail?.conflict_files ??
    detail?.conflictingFiles ??
    null;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const p =
      typeof item === 'string'
        ? item.trim()
        : String(item?.path || item?.filename || item?.filePath || '').trim();
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/**
 * GitHub web UI conflict editor for this PR.
 * https://github.com/{owner}/{repo}/pull/{n}/conflicts
 */
export function buildResolveConflictsUrl(detail: any): string | null {
  const d = detail || {};
  const html = String(d.htmlUrl || d.html_url || '').trim().replace(/\/+$/, '');
  if (html && /\/pull\/\d+/i.test(html)) {
    return `${html}/conflicts`;
  }
  const owner = String(d.owner || '').trim();
  const repo = String(d.repo || '').trim();
  const num = Number(d.number);
  if (!owner || !repo || !Number.isFinite(num) || num <= 0) return null;
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pull/${num}/conflicts`;
}

/**
 * Whether GitHub would offer "Update branch" (head is out of date with base).
 * Prefer explicit behind signals; never show when clearly up-to-date (clean/unstable).
 */
export function canUpdateBranch(detail: any): boolean {
  const d = detail || {};
  if (d.merged) return false;
  if (String(d.state || 'open').toLowerCase() !== 'open') return false;

  const behindBy = Number(d.behindBy ?? d.behind_by);
  if (Number.isFinite(behindBy)) return behindBy > 0;

  const mss = String(d.mergeStateStatus || d.merge_state_status || '')
    .trim()
    .toUpperCase();
  if (mss === 'BEHIND') return true;
  // Up-to-date GraphQL statuses — no update
  if (
    mss === 'CLEAN' ||
    mss === 'UNSTABLE' ||
    mss === 'HAS_HOOKS' ||
    mss === 'DRAFT'
  ) {
    return false;
  }

  const ms = String(d.mergeableState || d.mergeable_state || '')
    .trim()
    .toLowerCase();
  if (ms === 'behind') return true;
  // REST up-to-date
  if (ms === 'clean' || ms === 'unstable' || ms === 'has_hooks') return false;

  // blocked / dirty / unknown without a behind count — treat as not updateable
  // so we never show a dead control on an already-current branch.
  return false;
}

/**
 * REST mergeable_state with GraphQL mergeStateStatus fallback.
 * GitHub: clean | unstable | blocked | dirty | behind | has_hooks | unknown | draft
 *
 * Prefer REST when present — GraphQL mergeStateStatus can lag or differ during
 * subscription patches; REST mergeable_state is what the merge box historically uses.
 */
export function effectiveMergeableState(detail: any): string {
  const d = detail || {};
  const rest = String(d.mergeableState || d.mergeable_state || '')
    .trim()
    .toLowerCase();
  if (rest) return rest;
  const mss = String(d.mergeStateStatus || d.merge_state_status || '')
    .trim()
    .toUpperCase();
  switch (mss) {
    case 'CLEAN':
      return 'clean';
    case 'UNSTABLE':
      return 'unstable';
    case 'BLOCKED':
      return 'blocked';
    case 'DIRTY':
      return 'dirty';
    case 'BEHIND':
      return 'behind';
    case 'HAS_HOOKS':
      return 'has_hooks';
    case 'DRAFT':
      return 'draft';
    case 'UNKNOWN':
      return 'unknown';
    default:
      return '';
  }
}

/**
 * Normalize REST boolean or GraphQL mergeable enum to true | false | null.
 * GraphQL: MERGEABLE | CONFLICTING | UNKNOWN
 */
export function normalizeMergeableFlag(detail: any): boolean | null {
  const d = detail || {};
  const raw = d.mergeable;
  if (raw === true || raw === false) return raw;
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toUpperCase();
  if (s === 'MERGEABLE' || s === 'TRUE' || s === '1') return true;
  if (s === 'CONFLICTING' || s === 'FALSE' || s === '0') return false;
  if (s === 'UNKNOWN') return null;
  return null;
}

/**
 * True when GitHub reports merge conflicts (dirty / mergeable=false not policy-blocked).
 */
export function isMergeConflictState(detail: any): boolean {
  const d = detail || {};
  const mergeableState = effectiveMergeableState(d);
  if (mergeableState === 'dirty') return true;
  if (d.mergeable === false && mergeableState !== 'blocked') return true;
  // GraphQL-style string enums sometimes stored on detail
  const gq = String(d.mergeable || '').toUpperCase();
  if (gq === 'CONFLICTING') return true;
  const mss = String(d.mergeStateStatus || d.merge_state_status || '')
    .trim()
    .toUpperCase();
  if (mss === 'DIRTY') return true;
  return false;
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

/**
 * Commit count for merge-method copy (GitHub: "The N commits from this branch…").
 * Prefers loaded commits array; falls back to totalCount-style fields.
 */
export function detailCommitCount(detail: any): number | null {
  const d = detail || {};
  if (Array.isArray(d.commits) && d.commits.length > 0) return d.commits.length;
  for (const k of [
    'commitsTotal',
    'commitCount',
    'commits_total',
    'totalCommits',
  ]) {
    const n = Number(d[k]);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return null;
}

/**
 * GitHub-style helper text for a merge method.
 * Squash / rebase include the commit count when known.
 */
export function mergeMethodDescription(
  method: MergeMethod,
  commitCount?: number | null
): string {
  const n = Number(commitCount);
  const hasN = Number.isFinite(n) && n > 0;
  const commitsPhrase = hasN
    ? `${n} commit${n === 1 ? '' : 's'}`
    : 'commits';
  if (method === 'squash') {
    return hasN
      ? `The ${commitsPhrase} from this branch will be combined into one commit in the base branch.`
      : 'The commits from this branch will be combined into one commit in the base branch.';
  }
  if (method === 'rebase') {
    return hasN
      ? `The ${commitsPhrase} from this branch will be rebased and added to the base branch.`
      : 'The commits from this branch will be rebased and added to the base branch.';
  }
  return 'All commits from this branch will be added to the base branch via a merge commit.';
}

export type RepoMergeMethodFlags = {
  allowMergeCommit: boolean | null;
  allowSquashMerge: boolean | null;
  allowRebaseMerge: boolean | null;
};

function boolFlagOrNull(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  return null;
}

/**
 * Read repository merge-method toggles from a PR detail snapshot.
 * Accepts camelCase (our detail) or snake_case (raw REST).
 * `null` means unknown / not yet loaded.
 */
export function readRepoMergeMethodFlags(detail: any): RepoMergeMethodFlags {
  const d = detail || {};
  return {
    allowMergeCommit: boolFlagOrNull(
      d.allowMergeCommit ?? d.allow_merge_commit
    ),
    allowSquashMerge: boolFlagOrNull(
      d.allowSquashMerge ?? d.allow_squash_merge
    ),
    allowRebaseMerge: boolFlagOrNull(
      d.allowRebaseMerge ?? d.allow_rebase_merge
    ),
  };
}

/**
 * Merge methods enabled by repository settings (Settings → General → Pull Requests).
 * When flags are unknown (all null), return all three so the UI does not hide
 * controls before settings load. When any flag is known, only methods with
 * `true` are returned (empty when the repo disabled every method).
 */
export function allowedMergeMethods(detail: any): MergeMethod[] {
  const f = readRepoMergeMethodFlags(detail);
  const known =
    f.allowMergeCommit != null ||
    f.allowSquashMerge != null ||
    f.allowRebaseMerge != null;
  if (!known) return ['merge', 'squash', 'rebase'];
  const out: MergeMethod[] = [];
  if (f.allowMergeCommit === true) out.push('merge');
  if (f.allowSquashMerge === true) out.push('squash');
  if (f.allowRebaseMerge === true) out.push('rebase');
  return out;
}

/** MERGE_METHODS rows allowed by the repository (order preserved). */
export function mergeMethodsForUi(
  detail: any
): Array<{ id: MergeMethod; label: string; description: string }> {
  const allowed = new Set(allowedMergeMethods(detail));
  const count = detailCommitCount(detail);
  return MERGE_METHODS.filter((m) => allowed.has(m.id)).map((m) => ({
    id: m.id,
    label: m.label,
    description: mergeMethodDescription(m.id, count),
  }));
}

export function normalizeMergeMethod(raw: unknown): MergeMethod {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (v === 'squash') return 'squash';
  if (v === 'rebase') return 'rebase';
  return 'merge';
}

/**
 * Prefer `preferred` when still allowed; otherwise first repo-allowed method.
 * Falls back to `'merge'` only when settings are unknown / empty.
 */
export function defaultMergeMethod(
  detail: any,
  preferred?: MergeMethod | null
): MergeMethod {
  const allowed = allowedMergeMethods(detail);
  if (preferred && allowed.includes(preferred)) return preferred;
  if (allowed.length > 0) return allowed[0];
  return 'merge';
}

/**
 * Coerce a requested method onto an allowed one, or null when none enabled.
 */
export function coerceMergeMethod(
  detail: any,
  requested?: unknown
): MergeMethod | null {
  const allowed = allowedMergeMethods(detail);
  if (allowed.length === 0) return null;
  const m = normalizeMergeMethod(requested);
  return allowed.includes(m) ? m : allowed[0];
}

/**
 * Label for the primary merge control.
 * @param opts.force when true, prefix with Force (admin / bypass path)
 * @param opts.bypass when true, GitHub-style "Bypass rules and …" wording
 */
export function mergeMethodButtonLabel(
  method: MergeMethod,
  opts: { force?: boolean; bypass?: boolean } = {}
): string {
  if (opts.bypass) {
    if (method === 'squash') return 'Bypass rules and squash and merge';
    if (method === 'rebase') return 'Bypass rules and rebase and merge';
    return 'Bypass rules and merge';
  }
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
 * Live merge primary CTA from baseline status + UI bypass checkbox state.
 * Pure: UI holds `bypassRulesAccepted` (default false).
 */
export function resolveMergePrimaryAction(
  status: MergeBoxStatus | null | undefined,
  opts: { bypassRulesAccepted?: boolean } = {}
): {
  showBypassCheckbox: boolean;
  bypassCheckboxLabel: string;
  mergeEnabled: boolean;
  forceWording: boolean;
  bypassWording: boolean;
  ctaVariant: MergeCtaVariant;
  buttonLabel: (method: MergeMethod) => string;
} {
  const s = status || ({} as MergeBoxStatus);
  const showBypass = Boolean(s.offerBypassRules && s.showMerge);
  const accepted = Boolean(opts.bypassRulesAccepted);

  if (!showBypass) {
    const force = Boolean(s.forceMerge);
    return {
      showBypassCheckbox: false,
      bypassCheckboxLabel: BYPASS_RULES_CHECKBOX_LABEL,
      mergeEnabled: Boolean(s.canMerge && s.showMerge),
      forceWording: force,
      bypassWording: false,
      ctaVariant: s.ctaVariant || 'default',
      buttonLabel: (method) =>
        mergeMethodButtonLabel(method, { force }),
    };
  }

  // Blocked + can bypass: merge disabled until explicit opt-in
  return {
    showBypassCheckbox: true,
    bypassCheckboxLabel: BYPASS_RULES_CHECKBOX_LABEL,
    mergeEnabled: accepted,
    forceWording: accepted,
    bypassWording: accepted,
    ctaVariant: accepted ? 'danger' : 'default',
    buttonLabel: (method) =>
      mergeMethodButtonLabel(method, {
        bypass: accepted,
        force: accepted,
      }),
  };
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
 * When the repository has disabled every merge method, hide the merge CTA.
 * (Unknown settings → keep status as-is.)
 */
function applyRepoMergeMethodGate(
  status: MergeBoxStatus,
  detail: any
): MergeBoxStatus {
  if (!status.showMerge) return status;
  const f = readRepoMergeMethodFlags(detail);
  const known =
    f.allowMergeCommit != null ||
    f.allowSquashMerge != null ||
    f.allowRebaseMerge != null;
  if (!known) return status;
  if (allowedMergeMethods(detail).length > 0) return status;
  return {
    ...status,
    showMerge: false,
    canMerge: false,
    forceMerge: false,
    offerBypassRules: false,
    ctaVariant: 'default',
    tone: status.kind === 'clean' ? 'muted' : status.tone,
    headline:
      status.kind === 'clean' || status.kind === 'unstable'
        ? 'Merging is disabled for this repository'
        : status.headline,
    helper:
      'All pull request merge methods are disabled in repository settings.',
  };
}



/**
 * Build merge-box presentation + primary CTA from a PR detail snapshot.
 */
export function buildMergeBoxStatus(detail: any): MergeBoxStatus {
  const d = detail || {};
  const checksState = effectiveChecksState(d);
  const checksLine = checksLineFrom(d);
  const mergeableState = effectiveMergeableState(d);
  const forceAllowed = viewerMayForceMerge(d);
  const showUpdateBranch = canUpdateBranch(d);

  // REST sometimes omits `merged` on partial/sketch payloads while still
  // carrying merged_at / closed+merged lifecycle — treat all as terminal merged.
  const isMerged =
    Boolean(d.merged) ||
    Boolean(d.mergedAt || d.merged_at) ||
    String(d.state || '')
      .trim()
      .toLowerCase() === 'merged';
  if (isMerged) {
    return {
      kind: 'merged',
      tone: 'merged',
      headline: 'Pull request successfully merged and closed',
      helper: 'This pull request has been merged.',
      checksLine: null,
      showMerge: false,
      canMerge: false,
      forceMerge: false,
      offerBypassRules: false,
      ctaVariant: 'default',
      showUpdateBranch: false,
      draftToggle: null,
      ...emptyConflictFields(),
    };
  }

  const isOpen = String(d.state || 'open') === 'open';
  if (!isOpen) {
    return {
      kind: 'closed',
      tone: 'closed',
      headline: 'Pull request is closed',
      helper: 'Reopen the pull request to merge or update the branch.',
      checksLine,
      showMerge: false,
      canMerge: false,
      forceMerge: false,
      offerBypassRules: false,
      ctaVariant: 'default',
      showUpdateBranch: false,
      draftToggle: null,
      ...emptyConflictFields(),
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
      offerBypassRules: false,
      ctaVariant: 'default',
      showUpdateBranch,
      draftToggle: 'ready',
      ...emptyConflictFields(),
    };
  }

  // Conflicts (dirty / mergeable=false without policy "blocked") cannot be
  // force-merged via the API — only resolve conflicts. Force CTA is only for
  // policy-blocked PRs when the viewer may bypass rules (admin).
  const isDirty = isMergeConflictState(d);
  const mergeableFlag = normalizeMergeableFlag(d);
  // Policy block = branch protection / required checks (not optional CI noise).
  // Never treat mergeable_state "unstable" as blocked — that is still mergeable.
  const isPolicyBlocked = mergeableState === 'blocked';
  const conflictFiles = normalizeConflictFiles(d);
  const resolveConflictsUrl = buildResolveConflictsUrl(d);

  if (isDirty) {
    const n = conflictFiles.length;
    const helper =
      n > 0
        ? `Use the web editor or the command line to resolve conflicts before continuing. ${n} conflicting file${n === 1 ? '' : 's'} listed below.`
        : 'Use the web editor or the command line to resolve conflicts before continuing.';
    return {
      kind: 'conflicts',
      tone: 'danger',
      headline: 'This branch has conflicts that must be resolved',
      helper,
      checksLine,
      showMerge: false,
      canMerge: false,
      forceMerge: false,
      offerBypassRules: false,
      ctaVariant: 'danger',
      showUpdateBranch,
      draftToggle: 'draft',
      showResolveConflicts: true,
      conflictFiles,
      resolveConflictsUrl,
    };
  }

  // GitHub: mergeable=true + unstable ≠ blocked. Only explicit blocked state
  // (or mergeable=false without dirty) is a hard block.
  if (isPolicyBlocked || mergeableFlag === false) {
    const canBypass = forceAllowed;
    return applyRepoMergeMethodGate(
      {
        kind: 'blocked',
        tone: 'danger',
        headline: 'Merging is blocked',
        helper: canBypass
          ? 'Repository rules prevent merging until requirements are met. Admins can bypass rules below.'
          : 'Fix failing checks, obtain required reviews, or update the branch, then try again.',
        checksLine,
        showMerge: true,
        // Merge stays disabled until the UI checkbox is checked
        canMerge: false,
        forceMerge: false,
        offerBypassRules: canBypass,
        ctaVariant: 'default',
        showUpdateBranch,
        draftToggle: 'draft',
        ...emptyConflictFields(),
      },
      d
    );
  }

  // Still computing mergeability — do not show green success CTA
  if (
    mergeableFlag == null &&
    mergeableState !== 'clean' &&
    mergeableState !== 'unstable' &&
    mergeableState !== 'has_hooks'
  ) {
    return applyRepoMergeMethodGate(
      {
        kind: 'unknown',
        tone: 'muted',
        headline: 'Checking if this branch can be merged…',
        helper: 'Mergeability is still being calculated. Try again in a moment.',
        checksLine,
        showMerge: true,
        canMerge: false,
        forceMerge: false,
        offerBypassRules: false,
        ctaVariant: 'default',
        showUpdateBranch,
        draftToggle: 'draft',
        ...emptyConflictFields(),
      },
      d
    );
  }

  // Unstable: REST "unstable" / GraphQL UNSTABLE — PR is mergeable; optional
  // checks may fail. GitHub still shows green "no conflicts" + enabled Merge.
  // Callabo #2571: mergeable=true, mergeable_state=unstable, failed claude-review.
  const hasRealChecks = checksItemCount(d) > 0;
  const checksUnsettled =
    hasRealChecks &&
    (checksState === 'failure' ||
      checksState === 'pending' ||
      checksState === 'error');
  // Past the blocked branch above: mergeableFlag is not false (true | null-handled).
  // Do not re-compare mergeableFlag to false — TS narrows it away.
  const unstable =
    mergeableState === 'unstable' ||
    (checksUnsettled && mergeableState !== 'blocked');
  if (unstable && mergeableState !== 'blocked') {
    return applyRepoMergeMethodGate(
      {
        kind: 'unstable',
        tone: 'ok',
        headline: 'This branch has no conflicts with the base branch',
        // Same primary helper as clean — check failures live in MergeBoxChecks
        helper: 'Merging can be performed automatically.',
        checksLine,
        showMerge: true,
        canMerge: true,
        forceMerge: false,
        offerBypassRules: false,
        ctaVariant: 'ok',
        showUpdateBranch,
        draftToggle: 'draft',
        ...emptyConflictFields(),
      },
      d
    );
  }

  // Clean / ready
  return applyRepoMergeMethodGate(
    {
      kind: 'clean',
      tone: 'ok',
      headline: 'This branch has no conflicts with the base branch',
      helper: 'Merging can be performed automatically.',
      checksLine,
      showMerge: true,
      canMerge: true,
      forceMerge: false,
      offerBypassRules: false,
      ctaVariant: 'ok',
      showUpdateBranch,
      draftToggle: 'draft',
      ...emptyConflictFields(),
    },
    d
  );
}
