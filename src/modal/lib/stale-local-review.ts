/**
 * Unverified local-cache-only review/issue comments paint as "user" +
 * MarkdownView "_No content_". GitHub is SoT — drop these ghosts on merge.
 */

/**
 * Empty body + missing/generic author, not pending.
 * Shells with a real author stay; pending attach races stay.
 */
export function isUnverifiedLocalOnlyReviewComment(c: any): boolean {
  if (!c || c.id == null) return false;
  if (c.pending) return false;
  // GraphQL deferred shell placeholders (empty until expand) are intentional
  if (c._commentsPending || c.commentsLoaded === false) return false;
  if (String(c.id).startsWith('shell:')) return false;
  const body = String(c.body ?? c.bodyText ?? c.bodyHTML ?? '').trim();
  if (body) return false;
  const author = String(
    c.author || c.user?.login || c.user?.name || ''
  ).trim();
  if (author && author.toLowerCase() !== 'user') return false;
  return true;
}

/** Drop unverified ghosts from a reviewComments list (stable order). */
export function stripUnverifiedLocalOnlyReviewComments(
  list: any[] | null | undefined
): any[] {
  const arr = Array.isArray(list) ? list : [];
  return arr.filter((c) => c && !isUnverifiedLocalOnlyReviewComment(c));
}

/**
 * Reconcile local vs remote reviewComments.
 * Remote rows win by id; local-only ghosts dropped when remote is present
 * or remoteAuthoritative.
 */
export function reconcileReviewCommentsAgainstRemote(
  localComments: any[] | null | undefined,
  remoteComments: any[] | null | undefined,
  opts: { remoteAuthoritative?: boolean } = {}
): any[] {
  const local = Array.isArray(localComments) ? localComments : [];
  const remote = Array.isArray(remoteComments) ? remoteComments : [];
  const remoteAuthoritative = Boolean(opts.remoteAuthoritative);

  if (!remote.length && !remoteAuthoritative) {
    return stripUnverifiedLocalOnlyReviewComments(local);
  }

  const byId = new Map<string, any>();
  for (const c of remote) {
    if (!c || c.id == null) continue;
    if (isUnverifiedLocalOnlyReviewComment(c)) continue;
    byId.set(String(c.id), c);
  }
  for (const c of local) {
    if (!c || c.id == null) continue;
    const key = String(c.id);
    if (byId.has(key)) continue;
    if (isUnverifiedLocalOnlyReviewComment(c)) continue;
    byId.set(key, c);
  }
  return [...byId.values()];
}
