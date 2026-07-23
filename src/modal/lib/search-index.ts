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
/** True when hit maps to a virtualized Diff row. */
export function searchHitHasRowIndex(hit) {
  return hit?.rowIndex != null && Number.isFinite(Number(hit.rowIndex));
}

/**
 * Prefer a hit we can navigate to.
 * In Diff/full mode, prefer rowIndex first so we do not open Conversation on
 * the first body/issue match when code hits also exist.
 *
 * @param {SearchHit[]} hits
 * @param {{ preferDiff?: boolean, mode?: string }} [opts]
 */
export function firstNavigableHitIndex(hits, opts: any = {}) {
  const list = Array.isArray(hits) ? hits : [];
  const mode = String(opts.mode || '');
  const preferDiff =
    opts.preferDiff === true || mode === 'diff' || mode === 'full';

  if (preferDiff) {
    for (let i = 0; i < list.length; i++) {
      if (searchHitHasRowIndex(list[i])) return i;
    }
  }
  for (let i = 0; i < list.length; i++) {
    const h = list[i];
    if (h?.anchorId) return i;
    if (searchHitHasRowIndex(h)) return i;
  }
  return list.length ? 0 : -1;
}

/** True if hit can be jumped to in some layout. */
export function isNavigableSearchHit(hit) {
  if (!hit) return false;
  if (hit.anchorId) return true;
  return searchHitHasRowIndex(hit);
}

/**
 * Whether the hit can be shown without an unexpected layout flip.
 * Diff: code / inline review rows only (rowIndex). Conversation-only anchors
 * (body, issue comments, review summaries) stay out of Diff next/prev so
 * "previous" never yanks the shell to Conversation.
 * Conversation: anchors, or rows (may open Diff).
 *
 * @param {SearchHit|null|undefined} hit
 * @param {string} layoutMode 'diff' | 'centered' | …
 */
export function isSearchHitVisibleInLayout(hit, layoutMode) {
  if (!hit) return false;
  const inDiff =
    layoutMode === 'diff' ||
    layoutMode === 'LAYOUT_DIFF' ||
    String(layoutMode).toLowerCase() === 'diff';

  if (inDiff) {
    // Inline review threads and code lines live in the Diff virtual list.
    if (searchHitHasRowIndex(hit)) return true;
    // review-comment without mapped row can still be opened via expand/jump,
    // but pure body / issue-comment / review events must not force Conversation.
    const aid = String(hit.anchorId || '');
    const kind = String(hit.kind || '');
    if (
      aid.startsWith('review-comment:') ||
      kind === 'review-comment' ||
      kind === 'review-reply'
    ) {
      return true;
    }
    return false;
  }

  // Conversation (or unknown): any navigable hit
  return isNavigableSearchHit(hit);
}

/**
 * Advance hitIndex by delta, skipping hits that are not showable in layoutMode.
 * Wraps at most once through the list.
 *
 * @param {SearchHit[]} hits
 * @param {number} hitIndex
 * @param {number} delta
 * @param {string} [layoutMode]
 */
export function resolveNavSearchStateForLayout(
  hits,
  hitIndex,
  delta,
  layoutMode = 'centered'
) {
  const list = Array.isArray(hits) ? hits : [];
  if (!list.length) {
    return { hits: list, hitIndex: -1, activeHit: null, shouldJump: false };
  }
  let st = resolveNavSearchState(list, hitIndex, delta);
  let guard = 0;
  const start = st.hitIndex;
  while (
    st.activeHit &&
    (!isNavigableSearchHit(st.activeHit) ||
      !isSearchHitVisibleInLayout(st.activeHit, layoutMode)) &&
    guard < list.length
  ) {
    st = resolveNavSearchState(list, st.hitIndex, delta);
    guard += 1;
    if (st.hitIndex === start && guard > 0) break;
  }
  // If nothing in this layout is navigable, do not jump / thrash layout
  if (
    st.activeHit &&
    !isSearchHitVisibleInLayout(st.activeHit, layoutMode)
  ) {
    return {
      hits: list,
      hitIndex: Number.isFinite(hitIndex) ? hitIndex : -1,
      activeHit: list[hitIndex] || null,
      shouldJump: false,
    };
  }
  return st;
}

/**
 * @param {SearchDoc[]} docs
 * @param {string} query
 * @param {{ mode?: 'conversation'|'diff'|'full', detail?: object }} [opts]
 */
export function resolveQuerySearchState(docs, query, opts: any = {}) {
  let hits = searchIndex(docs, query);
  if (opts.mode || opts.detail) {
    hits = sortSearchHitsForUi(hits, opts.mode || 'conversation', opts.detail || null);
  }
  if (!hits.length) {
    return { hits, hitIndex: -1, activeHit: null, shouldJump: false };
  }
  const hitIndex = firstNavigableHitIndex(hits, { mode: opts.mode });
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
 * @param {{ isCancelled?: () => boolean, mode?: string, detail?: object }} [opts]
 */
export async function resolveQuerySearchStateAsync(docs, query, opts: any = {}) {
  let hits = await searchIndexAsync(docs, query, opts);
  if (typeof opts.isCancelled === 'function' && opts.isCancelled()) {
    return { hits: [], hitIndex: -1, activeHit: null, shouldJump: false, cancelled: true };
  }
  if (opts.mode || opts.detail) {
    hits = sortSearchHitsForUi(hits, opts.mode || 'conversation', opts.detail || null);
  }
  if (!hits.length) {
    return { hits, hitIndex: -1, activeHit: null, shouldJump: false, cancelled: false };
  }
  const hitIndex = firstNavigableHitIndex(hits, { mode: opts.mode });
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
 * Decode a short HTML entity / numeric char ref at `html[i]` (must be '&').
 * Returns { ch, end } or null.
 */
function decodeEntityAt(html, i) {
  if (html[i] !== '&') return null;
  const semi = html.indexOf(';', i + 1);
  if (semi < 0 || semi - i > 12) return null;
  const body = html.slice(i + 1, semi);
  if (body[0] === '#') {
    const hex = body[1] === 'x' || body[1] === 'X';
    const num = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    if (!Number.isFinite(num)) return null;
    return { ch: String.fromCodePoint(num), end: semi + 1 };
  }
  const map = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: '\u00a0',
  };
  const ch = map[body.toLowerCase()];
  if (!ch) return null;
  return { ch, end: semi + 1 };
}

/**
 * Inject search `<mark>` tags into **already-rendered HTML** (markdown output,
 * syntax-highlighted code, etc.) without destroying tags/structure.
 *
 * Offsets for `currentStart` / match discovery use **decoded text content**
 * order (same as a browser textContent walk), not raw HTML string indexes.
 *
 * @param {string} html
 * @param {string} query
 * @param {{ currentStart?: number|null, occurrenceIndex?: number|null }} [opts]
 * @returns {string}
 */
export function markSearchInHtml(html, query, opts: any = {}) {
  const src = html == null ? '' : String(html);
  const q = (query || '').trim();
  if (!src) return '';
  if (!q) return src;

  const ql = q.toLowerCase();
  const qLen = q.length;

  // 1) Flatten to decoded plain text + map each plain index → HTML [start,end)
  const plainChars = [];
  /** @type {Array<{ hStart: number, hEnd: number }>} */
  const plainToHtml = [];
  let i = 0;
  let inTag = false;
  while (i < src.length) {
    const c = src[i];
    if (inTag) {
      if (c === '>') inTag = false;
      i += 1;
      continue;
    }
    if (c === '<') {
      inTag = true;
      i += 1;
      continue;
    }
    if (c === '&') {
      const ent = decodeEntityAt(src, i);
      if (ent) {
        plainChars.push(ent.ch);
        plainToHtml.push({ hStart: i, hEnd: ent.end });
        i = ent.end;
        continue;
      }
    }
    plainChars.push(c);
    plainToHtml.push({ hStart: i, hEnd: i + 1 });
    i += 1;
  }

  const plain = plainChars.join('');
  const plainLower = plain.toLowerCase();

  // 2) Collect match ranges in plain-text space
  /** @type {Array<{ start: number, end: number, current: boolean }>} */
  const ranges = [];
  let from = 0;
  let occ = 0;
  const wantOcc =
    opts.occurrenceIndex != null && Number.isFinite(Number(opts.occurrenceIndex))
      ? Number(opts.occurrenceIndex)
      : null;
  const currentStart =
    opts.currentStart != null && Number.isFinite(Number(opts.currentStart))
      ? Number(opts.currentStart)
      : null;

  while (from < plainLower.length) {
    const at = plainLower.indexOf(ql, from);
    if (at < 0) break;
    let isCurrent = false;
    if (currentStart != null && at === currentStart) isCurrent = true;
    else if (wantOcc != null && occ === wantOcc) isCurrent = true;
    ranges.push({ start: at, end: at + qLen, current: isCurrent });
    occ += 1;
    from = at + Math.max(1, qLen);
  }
  if (!ranges.length) return src;

  // 3) Rebuild HTML: copy tags verbatim; wrap matching text runs
  let out = '';
  let plainIdx = 0;
  let htmlIdx = 0;
  inTag = false;

  const openMark = (current) =>
    current
      ? '<mark class="prp-search-mark prp-search-mark--current">'
      : '<mark class="prp-search-mark">';
  const closeMark = '</mark>';

  /** Active mark range covering plainIdx, if any */
  const rangeAt = (p) => {
    for (const r of ranges) {
      if (p >= r.start && p < r.end) return r;
    }
    return null;
  };

  let openRange = null;
  while (htmlIdx < src.length) {
    const c = src[htmlIdx];
    if (inTag) {
      out += c;
      if (c === '>') inTag = false;
      htmlIdx += 1;
      continue;
    }
    if (c === '<') {
      if (openRange) {
        out += closeMark;
        openRange = null;
      }
      inTag = true;
      out += c;
      htmlIdx += 1;
      continue;
    }

    // Text node / entity — consume one plain char
    const map = plainToHtml[plainIdx];
    if (!map || map.hStart !== htmlIdx) {
      // Desync fallback: copy rest raw
      out += src.slice(htmlIdx);
      break;
    }
    const r = rangeAt(plainIdx);
    if (r && (!openRange || openRange.start !== r.start)) {
      if (openRange) out += closeMark;
      out += openMark(r.current);
      openRange = r;
    } else if (!r && openRange) {
      out += closeMark;
      openRange = null;
    }
    out += src.slice(map.hStart, map.hEnd);
    htmlIdx = map.hEnd;
    plainIdx += 1;
    if (openRange && plainIdx >= openRange.end) {
      out += closeMark;
      openRange = null;
    }
  }
  if (openRange) out += closeMark;
  return out;
}

/**
 * Sort hits to match visible UI order for the active layout.
 * Conversation: description body first, then timeline newest-first (by `at`),
 * then within a doc by start offset. Diff: rowIndex then start.
 *
 * @param {SearchHit[]} hits
 * @param {'conversation'|'diff'|'full'} mode
 * @param {object} [detail]
 * @returns {SearchHit[]}
 */
export function sortSearchHitsForUi(hits, mode, detail = null) {
  const list = Array.isArray(hits) ? hits.slice() : [];
  if (!list.length) return list;

  if (mode === 'diff' || mode === 'full') {
    list.sort((a, b) => {
      const ar = a.rowIndex != null ? Number(a.rowIndex) : Number.POSITIVE_INFINITY;
      const br = b.rowIndex != null ? Number(b.rowIndex) : Number.POSITIVE_INFINITY;
      if (ar !== br) return ar - br;
      // Conversation anchors without row: after all rows, keep doc order
      const aa = String(a.anchorId || a.docId || '');
      const bb = String(b.anchorId || b.docId || '');
      if (ar === Number.POSITIVE_INFINITY && aa !== bb) return aa.localeCompare(bb);
      return (Number(a.start) || 0) - (Number(b.start) || 0);
    });
    return list;
  }

  // Conversation UI order
  const timeByAnchor = new Map();
  const putTime = (anchorId, at) => {
    if (!anchorId) return;
    timeByAnchor.set(String(anchorId), String(at || ''));
  };
  putTime('body', detail?.createdAt || detail?.updatedAt || '');
  for (const c of detail?.comments || []) {
    putTime(`issue-comment:${c.id}`, c.createdAt);
  }
  for (const r of detail?.reviews || []) {
    putTime(`review:${r.id}`, r.submittedAt);
  }
  for (const c of detail?.reviewComments || []) {
    putTime(`review-comment:${c.id}`, c.createdAt);
  }

  const kindRank = (h) => {
    const k = String(h.kind || '');
    if (k === 'body' || h.anchorId === 'body') return 0;
    if (k === 'issue-comment') return 1;
    if (k === 'review') return 2;
    if (k === 'review-comment' || k === 'review-reply') return 3;
    return 9;
  };

  list.sort((a, b) => {
    const ka = kindRank(a);
    const kb = kindRank(b);
    // body always first (description is above the timeline)
    if (ka === 0 && kb !== 0) return -1;
    if (kb === 0 && ka !== 0) return 1;
    const ta = timeByAnchor.get(String(a.anchorId || '')) || '';
    const tb = timeByAnchor.get(String(b.anchorId || '')) || '';
    // Newest first (matches conversation timeline)
    if (ta !== tb) return String(tb).localeCompare(String(ta));
    if (ka !== kb) return ka - kb;
    const aa = String(a.anchorId || a.docId || '');
    const bb = String(b.anchorId || b.docId || '');
    if (aa !== bb) return aa.localeCompare(bb);
    return (Number(a.start) || 0) - (Number(b.start) || 0);
  });
  return list;
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
