(function(){
/**
 * Full-corpus search index for modal Ctrl+F.
 * Indexes header fields + every virtual row text so unmounted rows are findable.
 *
 * Large PRs: build once (caller memos docs); search is chunked + cancellable so
 * typing does not freeze the main thread.
 */

/** Hard cap so short queries cannot allocate millions of hits. */
const SEARCH_MAX_HITS = 2000;
/** Cap occurrences per doc. */
const SEARCH_MAX_HITS_PER_DOC = 8;
/** Docs processed per slice before yielding. */
const SEARCH_CHUNK_SIZE = 400;

/**
 * Build docs from PR detail payload + flattened virtual rows.
 * @param {object} prDetail
 * @param {Array} virtualRows
 * @returns {Array}
 */
function buildSearchIndex(prDetail, virtualRows) {
  const docs = [];
  const pr = prDetail || {};

  const push = (id, kind, text, extra = {}) => {
    const t = (text == null ? '' : String(text)).trim();
    if (!t) return;
    docs.push({ id, kind, text: t, textLower: t.toLowerCase(), ...extra });
  };

  push('title', 'title', pr.title);
  push('body', 'body', pr.body);
  push('author', 'author', pr.author);
  push('base', 'ref', pr.baseRef);
  push('head', 'ref', pr.headRef);

  if (Array.isArray(pr.comments)) {
    pr.comments.forEach((c, i) => {
      push(`comment-${c.id ?? i}`, 'comment', `${c.author || ''}: ${c.body || ''}`);
    });
  }
  if (Array.isArray(pr.reviewComments)) {
    pr.reviewComments.forEach((c, i) => {
      push(
        `review-comment-${c.id ?? i}`,
        'review-comment',
        `${c.author || ''}: ${c.body || ''} ${c.path || ''}${
          c.line != null ? `:${c.line}` : ''
        }`,
        {
          filePath: c.path,
          rowIndex: c.rowIndex,
        }
      );
    });
  }
  if (Array.isArray(pr.reviews)) {
    pr.reviews.forEach((r, i) => {
      push(
        `review-${i}`,
        'review',
        `${r.author || ''} ${r.state || ''}: ${r.body || ''}`
      );
    });
  }
  if (Array.isArray(pr.commits)) {
    pr.commits.forEach((c, i) => {
      push(
        `commit-${i}`,
        'commit',
        `${c.sha || ''} ${c.message || ''} ${c.author || ''}`
      );
    });
  }

  if (Array.isArray(virtualRows)) {
    for (const row of virtualRows) {
      push(`row-${row.rowIndex}`, row.kind || 'diff', row.text, {
        filePath: row.filePath,
        rowIndex: row.rowIndex,
      });
    }
  }

  return docs;
}

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
 */
function searchIndex(docs, query, opts = {}) {
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
 * Chunked async search for UI typing path.
 */
async function searchIndexAsync(docs, query, opts = {}) {
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
    if (end < n) {
      await yieldToMain();
    }
  }

  return hits;
}

function nextHitIndex(current, total, delta) {
  if (!total || total <= 0) return -1;
  if (current < 0) return delta >= 0 ? 0 : total - 1;
  return (current + delta + total) % total;
}

function resolveQuerySearchState(docs, query) {
  const hits = searchIndex(docs, query);
  if (!hits.length) {
    return { hits, hitIndex: -1, activeHit: null, shouldJump: false };
  }
  return {
    hits,
    hitIndex: 0,
    activeHit: hits[0],
    shouldJump: true,
  };
}

async function resolveQuerySearchStateAsync(docs, query, opts = {}) {
  const hits = await searchIndexAsync(docs, query, opts);
  if (typeof opts.isCancelled === 'function' && opts.isCancelled()) {
    return { hits: [], hitIndex: -1, activeHit: null, shouldJump: false, cancelled: true };
  }
  if (!hits.length) {
    return { hits, hitIndex: -1, activeHit: null, shouldJump: false, cancelled: false };
  }
  return {
    hits,
    hitIndex: 0,
    activeHit: hits[0],
    shouldJump: true,
    cancelled: false,
  };
}

function resolveNavSearchState(hits, hitIndex, delta) {
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

const api = {
  buildSearchIndex,
  searchIndex,
  searchIndexAsync,
  resolveQuerySearchState,
  resolveQuerySearchStateAsync,
  resolveNavSearchState,
  SEARCH_MAX_HITS,
  SEARCH_MAX_HITS_PER_DOC,
  SEARCH_CHUNK_SIZE,
};
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof globalThis !== "undefined") globalThis.PRModalSearchIndex = api;
})();
