/** @module modal/lib/search-index */
/**
 * Full-corpus search index for modal Ctrl+F.
 * Indexes header fields + every virtual row text so unmounted rows are findable.
 *
 * Large PRs: build once (caller memos docs); search is chunked + cancellable so
 * typing does not freeze the main thread.
 */

/**
 * @typedef {{ id: string, kind: string, filePath?: string, text: string, textLower?: string, rowIndex?: number, anchorId?: string, commentId?: string|number }} SearchDoc
 * @typedef {{ docId: string, kind: string, filePath?: string, text: string, rowIndex?: number, start: number, end: number, anchorId?: string, commentId?: string|number }} SearchHit
 */

/** Hard cap so short queries (e.g. "a") cannot allocate millions of hits. */
export const SEARCH_MAX_HITS = 2000;
/** Cap occurrences per doc (one line can match many times for 1-char queries). */
export const SEARCH_MAX_HITS_PER_DOC = 8;
/** Docs processed per slice before yielding to the event loop. */
export const SEARCH_CHUNK_SIZE = 400;

function pushDoc(docs, id, kind, text, extra: any = {}) {
  const t = (text == null ? '' : String(text)).trim();
  if (!t) return;
  docs.push({ id, kind, text: t, textLower: t.toLowerCase(), ...extra });
}

/**
 * Conversation / detail view corpus only:
 * description body, issue comments, review events, review threads + replies.
 * No commits, refs, or diff lines.
 *
 * @param {object} prDetail
 * @returns {SearchDoc[]}
 */
export function buildConversationSearchIndex(prDetail) {
  const docs = [];
  const pr = prDetail || {};

  pushDoc(docs, 'body', 'body', pr.body, { anchorId: 'body' });

  if (Array.isArray(pr.comments)) {
    pr.comments.forEach((c, i) => {
      const id = c?.id ?? i;
      pushDoc(docs, `issue-comment-${id}`, 'issue-comment', c?.body || '', {
        anchorId: `issue-comment:${id}`,
        commentId: id,
      });
    });
  }

  if (Array.isArray(pr.reviews)) {
    pr.reviews.forEach((r, i) => {
      if (!r?.body) return;
      const id = r.id ?? i;
      pushDoc(docs, `review-${id}`, 'review', r.body || '', {
        anchorId: `review:${id}`,
        commentId: id,
      });
    });
  }

  // Review thread roots + replies (each reply is its own navigable hit)
  if (Array.isArray(pr.reviewComments)) {
    pr.reviewComments.forEach((c, i) => {
      if (!c) return;
      const id = c.id ?? i;
      const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
      const isReply = parentId != null;
      pushDoc(
        docs,
        `review-comment-${id}`,
        isReply ? 'review-reply' : 'review-comment',
        c.body || '',
        {
          anchorId: `review-comment:${id}`,
          commentId: id,
          filePath: c.path || '',
          rowIndex: c.rowIndex,
        }
      );
    });
  }

  return docs;
}

/**
 * Build docs from PR detail payload + flattened virtual rows (Diff / full corpus).
 * @param {object} prDetail
 * @param {Array<{ kind: string, filePath?: string, text: string, rowIndex: number }>} virtualRows
 * @param {{ mode?: 'full'|'conversation' }} [opts]
 * @returns {SearchDoc[]}
 */
export function buildSearchIndex(prDetail, virtualRows, opts: any = {}) {
  if (opts.mode === 'conversation') {
    return buildConversationSearchIndex(prDetail);
  }

  const docs = [];
  const pr = prDetail || {};

  // Full mode still includes conversation fields + diff rows
  pushDoc(docs, 'body', 'body', pr.body, { anchorId: 'body' });

  if (Array.isArray(pr.comments)) {
    pr.comments.forEach((c, i) => {
      const id = c?.id ?? i;
      pushDoc(docs, `issue-comment-${id}`, 'issue-comment', c?.body || '', {
        anchorId: `issue-comment:${id}`,
        commentId: id,
      });
    });
  }
  if (Array.isArray(pr.reviewComments)) {
    pr.reviewComments.forEach((c, i) => {
      if (!c) return;
      const id = c.id ?? i;
      const parentId = c.inReplyToId ?? c.in_reply_to_id ?? null;
      pushDoc(
        docs,
        `review-comment-${id}`,
        parentId != null ? 'review-reply' : 'review-comment',
        c.body || '',
        {
          anchorId: `review-comment:${id}`,
          commentId: id,
          filePath: c.path || '',
          rowIndex: c.rowIndex,
        }
      );
    });
  }
  if (Array.isArray(pr.reviews)) {
    pr.reviews.forEach((r, i) => {
      if (!r?.body) return;
      const id = r.id ?? i;
      pushDoc(docs, `review-${id}`, 'review', r.body || '', {
        anchorId: `review:${id}`,
        commentId: id,
      });
    });
  }

  if (Array.isArray(virtualRows)) {
    for (const row of virtualRows) {
      pushDoc(docs, `row-${row.rowIndex}`, row.kind || 'diff', row.text, {
        filePath: row.filePath,
        rowIndex: row.rowIndex,
      });
    }
  }

  return docs;
}

/**
 * Scan a single doc for query matches (mutates hits).
 * @returns {boolean} true if global maxHits reached
 */
function collectDocHits(doc, lower, qLen, hits, maxHits, maxPerDoc) {
  const text = doc.text || '';
  const hay = doc.textLower || text.toLowerCase();
  let from = 0;
  let perDoc = 0;
  while (from < hay.length && hits.length < maxHits && perDoc < maxPerDoc) {
    const at = hay.indexOf(lower, from);
    if (at < 0) break;
    hits.push({
      docId: doc.id,
      kind: doc.kind,
      filePath: doc.filePath,
      text: text.slice(Math.max(0, at - 40), at + qLen + 40),
      rowIndex: doc.rowIndex,
      anchorId: doc.anchorId || null,
      commentId: doc.commentId ?? null,
      start: at,
      end: at + qLen,
    });
    perDoc += 1;
    from = at + Math.max(1, qLen);
  }
  return hits.length >= maxHits;
}

/**
 * Case-insensitive substring search over all docs (sync).
 * Prefer {@link searchIndexAsync} on the UI thread for large corpora.
 * @param {SearchDoc[]} docs
 * @param {string} query
 * @param {{ maxHits?: number, maxPerDoc?: number }} [opts]
 * @returns {SearchHit[]}
 */
export function searchIndex(docs, query, opts: any = {}) {
  const q = (query || '').trim();
  if (!q || !Array.isArray(docs) || docs.length === 0) return [];

  const lower = q.toLowerCase();
  const maxHits =
    Number.isFinite(opts.maxHits) && opts.maxHits > 0
      ? Math.floor(opts.maxHits)
      : SEARCH_MAX_HITS;
  const maxPerDoc =
    Number.isFinite(opts.maxPerDoc) && opts.maxPerDoc > 0
      ? Math.floor(opts.maxPerDoc)
      : SEARCH_MAX_HITS_PER_DOC;
  const hits = [];

  for (const doc of docs) {
    if (collectDocHits(doc, lower, q.length, hits, maxHits, maxPerDoc)) break;
  }

  return hits;
}

/**
 * Yield to the event loop (macrotask) so input/paint can run.
 */
function yieldToMain() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Chunked async search — same results as {@link searchIndex}, but yields every
 * {@link SEARCH_CHUNK_SIZE} docs so typing stays responsive on huge diffs.
 *
 * @param {SearchDoc[]} docs
 * @param {string} query
 * @param {{
 *   maxHits?: number,
 *   maxPerDoc?: number,
 *   chunkSize?: number,
 *   isCancelled?: () => boolean,
 * }} [opts]
 * @returns {Promise<SearchHit[]>}
 */
export async function searchIndexAsync(docs, query, opts: any = {}) {
  const q = (query || '').trim();
  if (!q || !Array.isArray(docs) || docs.length === 0) return [];

  const lower = q.toLowerCase();
  const maxHits =
    Number.isFinite(opts.maxHits) && opts.maxHits > 0
      ? Math.floor(opts.maxHits)
      : SEARCH_MAX_HITS;
  const maxPerDoc =
    Number.isFinite(opts.maxPerDoc) && opts.maxPerDoc > 0
      ? Math.floor(opts.maxPerDoc)
      : SEARCH_MAX_HITS_PER_DOC;
  const chunkSize =
    Number.isFinite(opts.chunkSize) && opts.chunkSize > 0
      ? Math.floor(opts.chunkSize)
      : SEARCH_CHUNK_SIZE;
  const isCancelled =
    typeof opts.isCancelled === 'function' ? opts.isCancelled : () => false;

  const hits = [];
  const n = docs.length;

  // Small corpora: finish sync (no yield overhead)
  if (n <= chunkSize) {
    if (isCancelled()) return [];
    return searchIndex(docs, query, { maxHits, maxPerDoc });
  }

  for (let i = 0; i < n; i += chunkSize) {
    if (isCancelled()) return [];
    const end = Math.min(i + chunkSize, n);
    for (let j = i; j < end; j++) {
      if (collectDocHits(docs[j], lower, q.length, hits, maxHits, maxPerDoc)) {
        return hits;
      }
    }
    // Yield between chunks (skip after last)
    if (end < n) {
      await yieldToMain();
    }
  }

  return hits;
}

/**
 * Next hit index wrapping around.
 */
export function nextHitIndex(current, total, delta) {
  if (!total || total <= 0) return -1;
  if (current < 0) return delta >= 0 ? 0 : total - 1;
  return (current + delta + total) % total;
}

/**
 * React search wiring contract for a **query change** (typing / new search).
 * Always returns shouldJump when any hit exists so stagnant hitIndex=0 still
 * scrolls to the correct (possibly different) row for a refined query.
 *
 * @param {SearchDoc[]} docs
 * @param {string} query
 * @returns {{ hits: SearchHit[], hitIndex: number, activeHit: SearchHit|null, shouldJump: boolean }}
 */
/**
 * Prefer a hit we can navigate to: conversation anchorId, else diff rowIndex.
 */
export function firstNavigableHitIndex(hits) {
  const list = Array.isArray(hits) ? hits : [];
  for (let i = 0; i < list.length; i++) {
    const h = list[i];
    if (h?.anchorId) return i;
    if (h?.rowIndex != null && Number.isFinite(Number(h.rowIndex))) return i;
  }
  return list.length ? 0 : -1;
}

/** True if hit can be jumped to in the active layout. */
export function isNavigableSearchHit(hit) {
  if (!hit) return false;
  if (hit.anchorId) return true;
  return hit.rowIndex != null && Number.isFinite(Number(hit.rowIndex));
}

export function resolveQuerySearchState(docs, query) {
  const hits = searchIndex(docs, query);
  if (!hits.length) {
    return { hits, hitIndex: -1, activeHit: null, shouldJump: false };
  }
  const hitIndex = firstNavigableHitIndex(hits);
  return {
    hits,
    hitIndex,
    activeHit: hits[hitIndex] || hits[0],
    shouldJump: true,
  };
}

/**
 * Async counterpart of {@link resolveQuerySearchState} for UI typing path.
 * @param {SearchDoc[]} docs
 * @param {string} query
 * @param {{ isCancelled?: () => boolean }} [opts]
 */
export async function resolveQuerySearchStateAsync(docs, query, opts: any = {}) {
  const hits = await searchIndexAsync(docs, query, opts);
  if (typeof opts.isCancelled === 'function' && opts.isCancelled()) {
    return { hits: [], hitIndex: -1, activeHit: null, shouldJump: false, cancelled: true };
  }
  if (!hits.length) {
    return { hits, hitIndex: -1, activeHit: null, shouldJump: false, cancelled: false };
  }
  const hitIndex = firstNavigableHitIndex(hits);
  return {
    hits,
    hitIndex,
    activeHit: hits[hitIndex] || hits[0],
    shouldJump: true,
    cancelled: false,
  };
}

/**
 * Escape HTML entities (for mark wrappers; keep local to avoid UI deps).
 */
function escapeHtmlLocal(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Wrap every case-insensitive occurrence of `query` in `text` with
 * `<mark class="prp-search-mark">`. The match at `currentStart` (if any)
 * gets `prp-search-mark--current` for the active find result.
 *
 * @param {string} text
 * @param {string} query
 * @param {{ currentStart?: number|null }} [opts]
 * @returns {string} safe HTML
 */
export function markSearchInText(text, query, opts: any = {}) {
  const src = text == null ? '' : String(text);
  const q = (query || '').trim();
  if (!src) return '';
  if (!q) return escapeHtmlLocal(src);

  const lower = src.toLowerCase();
  const ql = q.toLowerCase();
  const currentStart =
    opts.currentStart != null && Number.isFinite(Number(opts.currentStart))
      ? Number(opts.currentStart)
      : null;

  let out = '';
  let i = 0;
  while (i < src.length) {
    const at = lower.indexOf(ql, i);
    if (at < 0) {
      out += escapeHtmlLocal(src.slice(i));
      break;
    }
    out += escapeHtmlLocal(src.slice(i, at));
    const isCurrent = currentStart != null && at === currentStart;
    const cls = isCurrent
      ? 'prp-search-mark prp-search-mark--current'
      : 'prp-search-mark';
    out += `<mark class="${cls}">${escapeHtmlLocal(src.slice(at, at + q.length))}</mark>`;
    i = at + Math.max(1, q.length);
  }
  return out;
}

/**
 * Map a hit's start offset from indexed `row.text` into the displayed string
 * (`code` / left / right). Returns null if the hit is not for this row.
 *
 * @param {object} row virtual row
 * @param {{ rowIndex?: number, start?: number, end?: number }|null} hit
 * @param {'text'|'code'|'left'|'right'} [field='code']
 */
export function mapHitStartToDisplay(row, hit, field: any = 'code') {
  if (!row || !hit || hit.rowIndex == null) return null;
  if (Number(hit.rowIndex) !== Number(row.rowIndex)) return null;
  if (hit.start == null || !Number.isFinite(Number(hit.start))) return null;
  const start = Number(hit.start);
  const indexed = row.text != null ? String(row.text) : '';
  let display =
    field === 'left'
      ? String(row.leftCode ?? '')
      : field === 'right'
        ? String(row.rightCode ?? '')
        : field === 'text'
          ? indexed
          : String(row.code ?? row.text ?? '');

  if (!display) return null;
  if (display === indexed) return start;

  // Unified: indexed text is often "+code" while display is "code"
  if (
    indexed.length === display.length + 1 &&
    (indexed[0] === '+' || indexed[0] === '-' || indexed[0] === ' ')
  ) {
    return Math.max(0, start - 1);
  }

  // Split rows: indexed text is a padded multi-column line — fall back to
  // first occurrence of the matched slice inside display.
  const slice = indexed.slice(start, Number(hit.end) || start);
  if (slice) {
    const at = display.toLowerCase().indexOf(slice.toLowerCase());
    if (at >= 0) return at;
  }
  return null;
}

/**
 * Row indexes that have at least one search hit (for row chrome highlight).
 * @param {Array<{ rowIndex?: number }>} hits
 * @returns {Set<number>}
 */
export function searchHitRowIndexSet(hits) {
  const set = new Set();
  for (const h of Array.isArray(hits) ? hits : []) {
    if (h?.rowIndex != null && Number.isFinite(Number(h.rowIndex))) {
      set.add(Number(h.rowIndex));
    }
  }
  return set;
}

/**
 * 0-based index of the active hit among hits that share the same rowIndex.
 * Used to pick which on-screen occurrence gets `prp-search-mark--current`.
 *
 * @param {Array<{ rowIndex?: number }>} hits
 * @param {number} hitIndex
 * @returns {number}
 */
export function occurrenceIndexAmongRowHits(hits, hitIndex) {
  const list = Array.isArray(hits) ? hits : [];
  const idx = Number(hitIndex);
  if (!Number.isFinite(idx) || idx < 0 || idx >= list.length) return 0;
  const cur = list[idx];
  if (!cur || cur.rowIndex == null) return 0;
  const row = Number(cur.rowIndex);
  let occ = 0;
  for (let i = 0; i < idx; i++) {
    if (list[i] && Number(list[i].rowIndex) === row) occ += 1;
  }
  return occ;
}

/**
 * Start offset of the n-th case-insensitive occurrence of query in text.
 * @param {string} text
 * @param {string} query
 * @param {number} n 0-based
 * @returns {number|null}
 */
export function startOfNthOccurrence(text, query, n) {
  const src = text == null ? '' : String(text);
  const q = (query || '').trim();
  const want = Number(n);
  if (!src || !q || !Number.isFinite(want) || want < 0) return null;
  const lower = src.toLowerCase();
  const ql = q.toLowerCase();
  let from = 0;
  let found = 0;
  while (from < src.length) {
    const at = lower.indexOf(ql, from);
    if (at < 0) return null;
    if (found === want) return at;
    found += 1;
    from = at + Math.max(1, q.length);
  }
  return null;
}

/**
 * Resolve the display-string offset for the active mark on a row.
 * Prefers occurrence index (stable across text/code prefix skew) then mapped start.
 *
 * @param {string} displayText
 * @param {string} query
 * @param {object} row
 * @param {object|null} activeHit
 * @param {number} occurrenceIndex
 * @param {'text'|'code'|'left'|'right'} field
 */
export function resolveActiveMarkStart(
  displayText,
  query,
  row,
  activeHit,
  occurrenceIndex,
  field: any = 'code'
) {
  if (!activeHit || activeHit.rowIndex == null) return null;
  if (Number(activeHit.rowIndex) !== Number(row?.rowIndex)) return null;
  const byOcc = startOfNthOccurrence(displayText, query, occurrenceIndex);
  if (byOcc != null) return byOcc;
  return mapHitStartToDisplay(row, activeHit, field);
}

/**
 * React search wiring contract for next/prev navigation.
 * shouldJump is true whenever a hit exists — including a single-hit wrap
 * where hitIndex stays 0 so the user can re-scroll to the only match.
 *
 * @param {SearchHit[]} hits
 * @param {number} hitIndex
 * @param {number} delta
 */
export function resolveNavSearchState(hits, hitIndex, delta) {
  const list = Array.isArray(hits) ? hits : [];
  if (!list.length) {
    return { hits: list, hitIndex: -1, activeHit: null, shouldJump: false };
  }
  const next = nextHitIndex(hitIndex, list.length, delta);
  return {
    hits: list,
    hitIndex: next,
    activeHit: list[next],
    shouldJump: next >= 0,
  };
}
