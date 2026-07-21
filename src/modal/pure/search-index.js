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
function buildSearchIndex(prDetail, virtualRows) {
  const docs = [];
  const pr = prDetail || {};

  const push = (id, kind, text, extra = {}) => {
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
function searchIndex(docs, query) {
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
function nextHitIndex(current, total, delta) {
  if (!total || total <= 0) return -1;
  if (current < 0) return delta >= 0 ? 0 : total - 1;
  return (current + delta + total) % total;
}

const api = {
  buildSearchIndex,
  searchIndex,
  nextHitIndex,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalSearch = api;
}
