/**
 * Post-merge optional delete head branch — pure gates + request builders.
 */

export type DeleteHeadBranchTarget = {
  owner: string;
  repo: string;
  /** Branch name without refs/heads/ */
  branch: string;
  ref: string;
};

/**
 * When to offer "Delete branch" after merge.
 * - PR must be merged
 * - Head ref present
 * - Not already deleted (local flag)
 * - Prefer not to offer deleting the repo default branch when known
 */
export function shouldShowDeleteHeadBranch(detail: any): boolean {
  const d = detail || {};
  if (!d.merged) return false;
  if (d.headBranchDeleted === true || d.headRefDeleted === true) return false;
  const branch = String(d.headRef || d.head_ref || '')
    .trim()
    .replace(/^refs\/heads\//, '');
  if (!branch) return false;
  const defaultBranch = String(
    d.defaultBranch || d.default_branch || d.baseRef || d.base_ref || ''
  )
    .trim()
    .replace(/^refs\/heads\//, '');
  if (defaultBranch && branch === defaultBranch) return false;
  const owner = String(d.headOwner || d.head_owner || d.owner || '').trim();
  const repo = String(d.headRepo || d.head_repo || d.repo || '').trim();
  if (!owner || !repo) return false;
  return true;
}

/** Resolve owner/repo/branch for DELETE git ref. */
export function resolveDeleteHeadBranchTarget(
  detail: any
): DeleteHeadBranchTarget | null {
  if (!shouldShowDeleteHeadBranch(detail)) return null;
  const d = detail || {};
  const branch = String(d.headRef || d.head_ref || '')
    .trim()
    .replace(/^refs\/heads\//, '');
  const owner = String(d.headOwner || d.head_owner || d.owner || '').trim();
  const repo = String(d.headRepo || d.head_repo || d.repo || '').trim();
  if (!branch || !owner || !repo) return null;
  return {
    owner,
    repo,
    branch,
    ref: `heads/${branch}`,
  };
}

/**
 * REST DELETE /repos/{owner}/{repo}/git/refs/heads/{branch}
 * Branch segments are encoded (slashes preserved as path segments).
 */
export function buildDeleteHeadBranchRequest(
  owner: string,
  repo: string,
  branch: string,
  opts: { restBase?: string } = {}
) {
  const o = encodeURIComponent(String(owner || '').trim());
  const r = encodeURIComponent(String(repo || '').trim());
  const b = String(branch || '')
    .trim()
    .replace(/^refs\/heads\//, '');
  const branchPath = b
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const base = String(opts.restBase || 'https://api.github.com').replace(
    /\/+$/,
    ''
  );
  return {
    method: 'DELETE',
    url: `${base}/repos/${o}/${r}/git/refs/heads/${branchPath}`,
  };
}

export function buildDeleteHeadBranchFromDetail(detail: any) {
  const t = resolveDeleteHeadBranchTarget(detail);
  if (!t) return null;
  return {
    ...buildDeleteHeadBranchRequest(t.owner, t.repo, t.branch),
    target: t,
  };
}

export function deleteHeadBranchButtonLabel(detail: any): string {
  const branch = String(detail?.headRef || detail?.head_ref || '')
    .trim()
    .replace(/^refs\/heads\//, '');
  return branch ? `Delete branch ${branch}` : 'Delete branch';
}

/**
 * Terminal open→closed auto-close for the modal shell.
 * After a successful merge we keep the modal open so optional delete-head-branch
 * is usable; closed-without-merge (e.g. Close PR) may auto-close.
 */
export function shouldAutoCloseOnTerminalTransition(opts: {
  wasTerminal: boolean | null;
  isTerminal: boolean;
  merged?: boolean;
}): boolean {
  if (!opts.isTerminal) return false;
  if (opts.wasTerminal !== false) return false;
  if (opts.merged) return false;
  return true;
}
