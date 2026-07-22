/**
 * Pure helpers for markdown composers: attachment insert + optimistic detail merge.
 */

/**
 * Insert an attachment markdown snippet at a cursor offset (or append).
 * Images → ![name](url); other files → [name](url)
 */
export function buildAttachmentMarkdown(
  fileName: string,
  url: string,
  opts: { isImage?: boolean } = {}
): string {
  const name = String(fileName || 'file').replace(/[[\]]/g, '');
  const href = String(url || '').trim();
  if (!href) return '';
  const image =
    opts.isImage != null
      ? Boolean(opts.isImage)
      : /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(name) ||
        /^data:image\//i.test(href);
  return image ? `![${name}](${href})` : `[${name}](${href})`;
}

/**
 * @returns {{ text: string, cursor: number }}
 */
export function insertMarkdownAtCursor(
  text: string,
  cursor: number,
  snippet: string
): { text: string; cursor: number } {
  const src = text == null ? '' : String(text);
  const snip = String(snippet || '');
  if (!snip) return { text: src, cursor: Math.max(0, Math.min(cursor || 0, src.length)) };
  let c = Number(cursor);
  if (!Number.isFinite(c) || c < 0) c = src.length;
  if (c > src.length) c = src.length;
  // Prefer blank-line separation when inserting mid/end of non-empty draft
  let prefix = src.slice(0, c);
  let suffix = src.slice(c);
  let insert = snip;
  if (prefix && !/\n$/.test(prefix)) insert = `\n${insert}`;
  if (suffix && !/^\n/.test(suffix)) insert = `${insert}\n`;
  const next = prefix + insert + suffix;
  return { text: next, cursor: prefix.length + insert.length };
}

/**
 * Guess content-type from file name for uploads.
 */
export function guessContentType(fileName: string, fileType?: string): string {
  if (fileType && String(fileType).includes('/')) return String(fileType);
  const n = String(fileName || '').toLowerCase();
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.gif')) return 'image/gif';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.svg')) return 'image/svg+xml';
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.md')) return 'text/markdown';
  if (n.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

function samePrIdentity(a: any, b: any): boolean {
  if (!a || !b) return false;
  const an = a.number;
  const bn = b.number;
  if (an != null && bn != null && Number(an) !== Number(bn)) return false;
  if ((an == null) !== (bn == null)) return false;
  const ao = String(a.owner || '').toLowerCase();
  const bo = String(b.owner || '').toLowerCase();
  const ar = String(a.repo || '').toLowerCase();
  const br = String(b.repo || '').toLowerCase();
  if ((ao || bo) && ao !== bo) return false;
  if ((ar || br) && ar !== br) return false;
  return true;
}

function labelKey(l: any): string {
  return String(typeof l === 'string' ? l : l?.name || '')
    .trim()
    .toLowerCase();
}

function labelsFingerprint(list: any[]): string {
  return (Array.isArray(list) ? list : [])
    .map(labelKey)
    .filter(Boolean)
    .sort()
    .join('\0');
}

function assigneesFingerprint(list: any[]): string {
  return (Array.isArray(list) ? list : [])
    .map((x) => String(x || '').trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('\0');
}

/**
 * Merge host detail onto optimistic local detail without dropping newer local
 * review comments / replies (fixes flash-then-revert after reply).
 *
 * Assignees/labels use `_metaSeq`: local meta writes bump the seq so a mid-flight
 * host re-render (stale detail still mounted while refresh loads) cannot clobber
 * the write. Host snapshots win again once their seq catches up, or when the
 * host payload already matches the local write (seq can drop).
 */
export function mergeDetailPreserveOptimistic(prev: any, next: any): any {
  if (!next) return prev || next;
  if (!prev) return next;
  // Switching PRs — never carry optimistic meta/comments across issues
  if (!samePrIdentity(prev, next)) return next;

  const prevRc = Array.isArray(prev.reviewComments) ? prev.reviewComments : [];
  const nextRc = Array.isArray(next.reviewComments) ? next.reviewComments : [];
  // Host has no PENDING review → drop local pending-only rows only when local
  // also cleared viewerPendingReview (explicit discard/submit strip). If local
  // still has viewerPendingReview (just-posted optimistic), keep pending rows
  // across a racey refresh that hasn't seen the PENDING yet.
  // `_dropPending` is set by stripPendingReviewFromDetail after Discard/Submit so
  // a racey merge cannot resurrect pending via raceKeep before React applies strip.
  const nextHasPendingReview = Boolean(next.viewerPendingReview?.id);
  const nextHasAnyPendingComment = nextRc.some((c) => c && c.pending);
  const prevHoldsPendingReview = Boolean(prev.viewerPendingReview?.id);
  const explicitDropPending = Boolean(prev._dropPending) && !nextHasPendingReview && !nextHasAnyPendingComment;
  const dropLocalPending =
    explicitDropPending ||
    (!nextHasPendingReview && !nextHasAnyPendingComment && !prevHoldsPendingReview);
  const byId = new Map<string, any>();
  for (const c of nextRc) {
    if (c && c.id != null) byId.set(String(c.id), c);
  }
  for (const c of prevRc) {
    if (!c || c.id == null) continue;
    const key = String(c.id);
    if (!byId.has(key)) {
      // Do not resurrect pending-only comments after discard/submit (host no longer has them)
      if (c.pending && dropLocalPending) continue;
      // Keep optimistic-only rows (temp ids or not yet in host snapshot)
      byId.set(key, c);
    } else {
      // Prefer host row but keep optimistic threadNodeId if host lacks it
      const host = byId.get(key);
      byId.set(key, {
        ...c,
        ...host,
        // Host without pending flag wins when review was discarded
        pending: host.pending ?? false,
        pendingReviewId: host.pending ? host.pendingReviewId ?? c.pendingReviewId : null,
        threadNodeId: host.threadNodeId || c.threadNodeId || null,
      });
    }
  }
  const prevComments = Array.isArray(prev.comments) ? prev.comments : [];
  const nextComments = Array.isArray(next.comments) ? next.comments : [];
  const cById = new Map<string, any>();
  for (const c of nextComments) {
    if (c && c.id != null) cById.set(String(c.id), c);
  }
  for (const c of prevComments) {
    if (c && c.id != null && !cById.has(String(c.id))) cById.set(String(c.id), c);
  }

  const prevAssignees = Array.isArray(prev.assignees) ? prev.assignees : [];
  const nextAssignees = Array.isArray(next.assignees) ? next.assignees : [];
  const prevLabels = Array.isArray(prev.labels) ? prev.labels : [];
  const nextLabels = Array.isArray(next.labels) ? next.labels : [];

  const prevSeq = Number(prev._metaSeq) || 0;
  const nextSeq = Number(next._metaSeq) || 0;
  // Host matches what we just wrote → adopt host (incl. colors) and allow seq to settle
  const metaInSync =
    assigneesFingerprint(prevAssignees) === assigneesFingerprint(nextAssignees) &&
    labelsFingerprint(prevLabels) === labelsFingerprint(nextLabels);
  const holdLocalMeta = prevSeq > nextSeq && !metaInSync;

  const assignees = holdLocalMeta
    ? prevAssignees
    : Array.isArray(next.assignees)
      ? nextAssignees
      : prevAssignees;
  const labels = holdLocalMeta
    ? prevLabels
    : Array.isArray(next.labels)
      ? nextLabels
      : prevLabels;
  // Drop the lock once host matches local write; otherwise keep the higher seq.
  const metaSeq = holdLocalMeta
    ? prevSeq
    : metaInSync
      ? 0
      : Math.max(prevSeq, nextSeq);

  const avatarUrls = holdLocalMeta
    ? {
        ...(next.avatarUrls && typeof next.avatarUrls === 'object' ? next.avatarUrls : {}),
        ...(prev.avatarUrls && typeof prev.avatarUrls === 'object' ? prev.avatarUrls : {}),
      }
    : {
        ...(prev.avatarUrls && typeof prev.avatarUrls === 'object' ? prev.avatarUrls : {}),
        ...(next.avatarUrls && typeof next.avatarUrls === 'object' ? next.avatarUrls : {}),
      };

  const mergedRc = [...byId.values()];
  const mergedHasPending = mergedRc.some((c) => c && c.pending);
  // Prefer host viewerPendingReview when present. If host is empty but we still
  // hold pending comment rows (post→refresh race), keep prev.viewerPendingReview
  // so Submit/Discard keep working. Explicit strip sets prev.viewerPendingReview=null
  // and `_dropPending` so we never resurrect after Discard/Submit.
  let viewerPendingReview = next.viewerPendingReview;
  if (viewerPendingReview === undefined) {
    viewerPendingReview = prev.viewerPendingReview ?? null;
  } else if (
    !viewerPendingReview?.id &&
    prev.viewerPendingReview?.id &&
    mergedHasPending &&
    !explicitDropPending
  ) {
    viewerPendingReview = prev.viewerPendingReview;
  }
  if (explicitDropPending) {
    viewerPendingReview = null;
  }

  // Keep drop flag only while host still has no PENDING (discard not fully
  // confirmed on a later snapshot). Clear as soon as host shows PENDING again
  // (new Start review) so we never strip a freshly posted review.
  const dropPending =
    !nextHasPendingReview &&
    !nextHasAnyPendingComment &&
    (explicitDropPending || Boolean(prev._dropPending));

  return {
    ...prev,
    ...next,
    viewerPendingReview,
    reviewComments: mergedRc,
    comments: [...cById.values()],
    assignees,
    labels,
    avatarUrls,
    _metaSeq: metaSeq,
    _dropPending: dropPending ? true : undefined,
  };
}

/**
 * Remove all PENDING review comments/replies and clear viewerPendingReview
 * (local optimistic discard after DELETE succeeds).
 * Sets `_dropPending` so mergeDetailPreserveOptimistic will not resurrect
 * pending rows across a racey host refresh.
 */
export function stripPendingReviewFromDetail(detail: any): any {
  if (!detail) return detail;
  const list = Array.isArray(detail.reviewComments) ? detail.reviewComments : [];
  return {
    ...detail,
    viewerPendingReview: null,
    reviewComments: list.filter((c) => c && !c.pending),
    _dropPending: true,
  };
}

/**
 * Build a safe asset path under the repo for Contents API uploads.
 */
export function buildAssetRepoPath(fileName: string, opts: { prefix?: string } = {}): string {
  const base = String(fileName || 'file.bin')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);
  const prefix = (opts.prefix || '.pr-plus-assets').replace(/\/$/, '');
  const stamp = Date.now().toString(36);
  return `${prefix}/${stamp}-${base || 'file.bin'}`;
}
