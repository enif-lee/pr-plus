/** @module modal/lib/search-index */
/**
 * Full-corpus search index for modal Ctrl+F.
 * Indexes header fields + every virtual row text so unmounted rows are findable.
 */

/**
 * @typedef {{ id: string, kind: string, filePath?: string, text: string, rowIndex?: number }} SearchDoc
 * @typedef {{ docId: string, kind: string, filePath?: string, text: string, rowIndex?: number, start: number, end: number }} SearchHit
 */

/**
 * Build docs from PR detail payload + flattened virtual rows.
 * @param {object} prDetail
 * @param {Array<{ kind: string, filePath?: string, text: string, rowIndex: number }>} virtualRows
 * @returns {SearchDoc[]}
 */
export function buildSearchIndex(prDetail, virtualRows) {
  const docs = [];
  const pr = prDetail || {};

  const push = (id, kind, text, extra: any = {}) => {
    const t = (text == null ? '' : String(text)).trim();
    if (!t) return;
    docs.push({ id, kind, text: t, ...extra });
  };

  push('title', 'title', pr.title);
  push('body', 'body', pr.body);
  push('author', 'author', pr.author);
  push('base', 'ref', pr.baseRef);
  push('head', 'ref', pr.headRef);

  if (Array.isArray(pr.comments)) {
    pr.comments.forEach((c, i) => {
      push(`comment-${i}`, 'comment', `${c.author || ''}: ${c.body || ''}`);
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

/**
 * Case-insensitive substring search over all docs.
 * @param {SearchDoc[]} docs
 * @param {string} query
 * @returns {SearchHit[]}
 */
export function searchIndex(docs, query) {
  const q = (query || '').trim();
  if (!q || !Array.isArray(docs) || docs.length === 0) return [];

  const lower = q.toLowerCase();
  const hits = [];

  for (const doc of docs) {
    const text = doc.text || '';
    const hay = text.toLowerCase();
    let from = 0;
    while (from < hay.length) {
      const at = hay.indexOf(lower, from);
      if (at < 0) break;
      hits.push({
        docId: doc.id,
        kind: doc.kind,
        filePath: doc.filePath,
        text: text.slice(Math.max(0, at - 40), at + q.length + 40),
        rowIndex: doc.rowIndex,
        start: at,
        end: at + q.length,
      });
      from = at + Math.max(1, q.length);
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
export function resolveQuerySearchState(docs, query) {
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
