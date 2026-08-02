/**
 * Track e2e-posted GitHub comments and delete them in hygiene/teardown.
 *
 * Pure registry is unit-testable without agent-browser. Live delete uses `gh api`
 * (same auth as meta reverse/hygiene steps).
 */
import { execFileSync } from 'node:child_process';

/** Defaults match harness DEMO_PR / REPO (avoid importing harness → browser deps). */
export const COMMENT_CLEANUP_REPO = 'enif-lee/pr-plus';
export const COMMENT_CLEANUP_PR = 7;
const REPO = COMMENT_CLEANUP_REPO;
const DEMO_PR = COMMENT_CLEANUP_PR;

/**
 * @typedef {{ kind: 'issue' | 'review', id: number | null, mark: string, repo?: string, number?: number, body?: string }} TrackedComment
 */

/**
 * Create an in-memory tracker for comments posted during e2e.
 * @returns {{
 *   track: (entry: TrackedComment) => TrackedComment,
 *   list: () => TrackedComment[],
 *   clear: () => void,
 *   size: () => number,
 *   takeAll: () => TrackedComment[],
 * }}
 */
export function createCommentTracker() {
  /** @type {TrackedComment[]} */
  const items = [];
  return {
    track(entry) {
      if (!entry || typeof entry !== 'object') {
        throw new Error('track requires an entry object');
      }
      const mark = String(entry.mark || '').trim();
      if (!mark) throw new Error('track requires non-empty mark');
      const kind = entry.kind === 'review' ? 'review' : 'issue';
      const id =
        entry.id == null || entry.id === ''
          ? null
          : Number(entry.id);
      const row = {
        kind,
        id: Number.isFinite(id) && id > 0 ? id : null,
        mark,
        repo: entry.repo != null ? String(entry.repo) : undefined,
        number:
          entry.number != null && Number.isFinite(Number(entry.number))
            ? Number(entry.number)
            : undefined,
        body: entry.body != null ? String(entry.body) : undefined,
      };
      items.push(row);
      return row;
    },
    list() {
      return items.map((x) => ({ ...x }));
    },
    clear() {
      items.length = 0;
    },
    size() {
      return items.length;
    },
    takeAll() {
      const out = items.map((x) => ({ ...x }));
      items.length = 0;
      return out;
    },
  };
}

/** Suite-wide default tracker (shared across feature modules). */
export const defaultCommentTracker = createCommentTracker();

/**
 * Unique body mark so list-and-delete works when id is unknown at post time.
 * @param {string} [prefix]
 */
export function makeE2eCommentMark(prefix = 'e2e-comment') {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${t}-${r}`;
}

/**
 * Build draft body containing the mark (main conversation issue comment).
 * @param {string} mark
 * @param {string} [note]
 */
export function e2eCommentBody(mark, note = 'composer cmd-enter') {
  const m = String(mark || '').trim();
  if (!m) throw new Error('e2eCommentBody requires mark');
  return `${m} ${note}`.trim();
}

/**
 * Filter comment list rows that contain the mark in body.
 * @param {Array<{ id?: number, body?: string }>} comments
 * @param {string} mark
 */
export function findCommentsByMark(comments, mark) {
  const m = String(mark || '').trim();
  if (!m) return [];
  const list = Array.isArray(comments) ? comments : [];
  return list.filter((c) => {
    const body = String(c?.body || '');
    return body.includes(m);
  });
}

/**
 * Resolve delete plan for tracked rows (id preferred; mark as lookup key).
 * Pure — no network.
 * @param {TrackedComment[]} tracked
 */
export function planDeletes(tracked) {
  const list = Array.isArray(tracked) ? tracked : [];
  return list.map((t) => ({
    kind: t.kind === 'review' ? 'review' : 'issue',
    id: t.id != null && Number(t.id) > 0 ? Number(t.id) : null,
    mark: String(t.mark || ''),
    repo: t.repo || REPO,
    number: t.number != null ? Number(t.number) : DEMO_PR,
  }));
}

// ── Live gh helpers ─────────────────────────────────────────────────

function ghJson(args, input = null) {
  try {
    const out = execFileSync('gh', args, {
      encoding: 'utf8',
      input: input || undefined,
      timeout: 45_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const t = String(out || '').trim();
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch {
      return t;
    }
  } catch (e) {
    return {
      _error: true,
      message: String(e?.stderr || e?.message || e).slice(0, 400),
      status: e?.status,
    };
  }
}

/**
 * List issue comments on a PR/issue (newest first page).
 * @param {string} [repo]
 * @param {number} [n]
 */
export function ghListIssueComments(repo = REPO, n = DEMO_PR) {
  const data = ghJson([
    'api',
    `repos/${repo}/issues/${Number(n)}/comments?per_page=100`,
    '--jq',
    '[.[] | {id, body, user: .user.login}]',
  ]);
  if (data?._error) return [];
  return Array.isArray(data) ? data : [];
}

/**
 * List review (inline) comments on a pull request.
 * @param {string} [repo]
 * @param {number} [n]
 */
export function ghListReviewComments(repo = REPO, n = DEMO_PR) {
  const data = ghJson([
    'api',
    `repos/${repo}/pulls/${Number(n)}/comments?per_page=100`,
    '--jq',
    '[.[] | {id, body, user: .user.login, path, line}]',
  ]);
  if (data?._error) return [];
  return Array.isArray(data) ? data : [];
}

/**
 * DELETE issue comment by id.
 * @returns {{ ok: boolean, status?: number, message?: string }}
 */
export function ghDeleteIssueComment(repo, commentId) {
  const id = Number(commentId);
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, message: 'invalid issue comment id' };
  }
  try {
    execFileSync(
      'gh',
      [
        'api',
        '-X',
        'DELETE',
        `repos/${repo}/issues/comments/${id}`,
        '--silent',
      ],
      { encoding: 'utf8', timeout: 30_000 }
    );
    return { ok: true };
  } catch (e) {
    // 404 = already gone → treat as success for hygiene
    const msg = String(e?.stderr || e?.message || e);
    if (/\b404\b|Not Found/i.test(msg)) return { ok: true, status: 404 };
    return { ok: false, message: msg.slice(0, 400) };
  }
}

/**
 * DELETE review comment by id.
 * @returns {{ ok: boolean, status?: number, message?: string }}
 */
export function ghDeleteReviewComment(repo, commentId) {
  const id = Number(commentId);
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, message: 'invalid review comment id' };
  }
  try {
    execFileSync(
      'gh',
      [
        'api',
        '-X',
        'DELETE',
        `repos/${repo}/pulls/comments/${id}`,
        '--silent',
      ],
      { encoding: 'utf8', timeout: 30_000 }
    );
    return { ok: true };
  } catch (e) {
    const msg = String(e?.stderr || e?.message || e);
    if (/\b404\b|Not Found/i.test(msg)) return { ok: true, status: 404 };
    return { ok: false, message: msg.slice(0, 400) };
  }
}

/**
 * Resolve id for a tracked row via mark if id missing.
 * @param {TrackedComment} row
 */
export function resolveTrackedId(row) {
  if (row?.id != null && Number(row.id) > 0) {
    return { id: Number(row.id), via: 'tracked' };
  }
  const mark = String(row?.mark || '');
  if (!mark) return { id: null, via: 'none' };
  const repo = row.repo || REPO;
  const n = row.number != null ? Number(row.number) : DEMO_PR;
  if (row.kind === 'review') {
    const hits = findCommentsByMark(ghListReviewComments(repo, n), mark);
    if (hits[0]?.id != null) return { id: Number(hits[0].id), via: 'mark-review' };
  } else {
    const hits = findCommentsByMark(ghListIssueComments(repo, n), mark);
    if (hits[0]?.id != null) return { id: Number(hits[0].id), via: 'mark-issue' };
  }
  return { id: null, via: 'not-found' };
}

/**
 * After successful post, look up the new comment by mark and track it.
 * @param {{ mark: string, kind?: 'issue'|'review', repo?: string, number?: number, body?: string, tracker?: ReturnType<typeof createCommentTracker> }} opts
 */
export function trackPostedCommentByMark(opts) {
  const tracker = opts.tracker || defaultCommentTracker;
  const mark = String(opts.mark || '').trim();
  if (!mark) throw new Error('trackPostedCommentByMark requires mark');
  const kind = opts.kind === 'review' ? 'review' : 'issue';
  const repo = opts.repo || REPO;
  const number = opts.number != null ? Number(opts.number) : DEMO_PR;
  const resolved = resolveTrackedId({ kind, id: null, mark, repo, number });
  return tracker.track({
    kind,
    id: resolved.id,
    mark,
    repo,
    number,
    body: opts.body,
  });
}

/**
 * Delete all tracked comments; fail-closed if a tracked id still exists after DELETE.
 * Empty tracker is a soft success (nothing posted).
 *
 * @param {{
 *   tracker?: ReturnType<typeof createCommentTracker>,
 *   failClosed?: boolean,
 *   log?: (msg: string) => void,
 * }} [opts]
 * @returns {{ deleted: number, skipped: number, errors: string[], remaining: TrackedComment[] }}
 */
export function cleanupTrackedComments(opts = {}) {
  const tracker = opts.tracker || defaultCommentTracker;
  const failClosed = opts.failClosed !== false;
  const log = typeof opts.log === 'function' ? opts.log : () => {};
  const planned = planDeletes(tracker.takeAll());
  if (!planned.length) {
    log('  comment cleanup: nothing tracked (ok)');
    return { deleted: 0, skipped: 0, errors: [], remaining: [] };
  }

  let deleted = 0;
  let skipped = 0;
  /** @type {string[]} */
  const errors = [];
  /** @type {TrackedComment[]} */
  const remaining = [];

  for (const row of planned) {
    const resolved = resolveTrackedId(row);
    if (resolved.id == null) {
      // Post may have soft-failed (draft never landed) — soft skip
      log(
        `  comment cleanup: no id for mark=${JSON.stringify(row.mark)} (${resolved.via}) — skip`
      );
      skipped += 1;
      continue;
    }
    const del =
      row.kind === 'review'
        ? ghDeleteReviewComment(row.repo, resolved.id)
        : ghDeleteIssueComment(row.repo, resolved.id);
    if (!del.ok) {
      const msg = `delete ${row.kind} #${resolved.id} failed: ${del.message || 'unknown'}`;
      errors.push(msg);
      remaining.push({ ...row, id: resolved.id });
      log(`  comment cleanup ERROR: ${msg}`);
      continue;
    }
    deleted += 1;
    log(
      `  comment cleanup: deleted ${row.kind} #${resolved.id} mark=${JSON.stringify(row.mark)} via=${resolved.via}`
    );

    // Fail-closed: re-list and ensure mark/id gone
    const still =
      row.kind === 'review'
        ? findCommentsByMark(ghListReviewComments(row.repo, row.number), row.mark)
        : findCommentsByMark(ghListIssueComments(row.repo, row.number), row.mark);
    if (still.length) {
      const msg = `comment still present after DELETE mark=${JSON.stringify(row.mark)} ids=${still.map((c) => c.id).join(',')}`;
      errors.push(msg);
      remaining.push({ ...row, id: resolved.id });
      log(`  comment cleanup ERROR: ${msg}`);
    }
  }

  if (failClosed && errors.length) {
    throw new Error(
      `e2e comment cleanup failed (${errors.length}): ${errors.join('; ')}`
    );
  }
  return { deleted, skipped, errors, remaining };
}

/**
 * True when a comment body looks like an e2e-posted row (new unique marks or
 * legacy fixed draft text from older P1.10 runs).
 * @param {string} body
 * @param {string} [prefix]
 */
export function isE2eCommentBody(body, prefix = 'e2e-comment-') {
  const b = String(body || '');
  if (b.includes(prefix)) return true;
  // Legacy P1.10 fixed draft before unique marks
  if (/e2e composer cmd-enter/i.test(b)) return true;
  return false;
}

/**
 * Sweep DEMO_PR for any leftover e2e-comment-* marks (safety net).
 * @param {{ repo?: string, number?: number, markPrefix?: string, log?: (s: string) => void }} [opts]
 */
export function sweepE2eCommentMarks(opts = {}) {
  const repo = opts.repo || REPO;
  const number = opts.number != null ? Number(opts.number) : DEMO_PR;
  const prefix = opts.markPrefix || 'e2e-comment-';
  const log = typeof opts.log === 'function' ? opts.log : () => {};
  const issue = ghListIssueComments(repo, number).filter((c) =>
    isE2eCommentBody(c?.body, prefix)
  );
  const review = ghListReviewComments(repo, number).filter((c) =>
    isE2eCommentBody(c?.body, prefix)
  );
  let deleted = 0;
  for (const c of issue) {
    const r = ghDeleteIssueComment(repo, c.id);
    if (r.ok) {
      deleted += 1;
      log(`  sweep deleted issue #${c.id}`);
    }
  }
  for (const c of review) {
    const r = ghDeleteReviewComment(repo, c.id);
    if (r.ok) {
      deleted += 1;
      log(`  sweep deleted review #${c.id}`);
    }
  }
  return { deleted, issueHits: issue.length, reviewHits: review.length };
}
