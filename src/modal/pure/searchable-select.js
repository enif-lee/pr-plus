/**
 * Pure helpers for searchable select / combobox filtering.
 */

/**
 * @typedef {{ id: string, label: string, keywords?: string[], disabled?: boolean, meta?: object }} SelectOption
 */

/**
 * Filter options by free-text query (label + keywords + id).
 * @param {SelectOption[]} options
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 * @returns {SelectOption[]}
 */
function filterSelectOptions(options, query, opts = {}) {
  const list = Array.isArray(options) ? options : [];
  const limit =
    Number.isFinite(opts.limit) && opts.limit > 0 ? Math.floor(opts.limit) : 50;
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return list.filter((o) => o && !o.disabled).slice(0, limit);
  const words = q.split(/\s+/).filter(Boolean);
  return list
    .filter((o) => {
      if (!o || o.disabled) return false;
      const hay = [o.id, o.label, ...(o.keywords || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .slice(0, limit);
}

/**
 * Build people options from logins + optional status map.
 * @param {string[]} logins
 * @param {Record<string, string>} [statusByLogin]
 * @returns {SelectOption[]}
 */
function buildPeopleOptions(logins, statusByLogin = {}) {
  const seen = new Set();
  const out = [];
  for (const login of logins || []) {
    const raw = String(login || '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const status = statusByLogin[key] || statusByLogin[raw] || '';
    out.push({
      id: raw,
      label: raw,
      keywords: [raw, status].filter(Boolean),
      meta: { status, login: raw },
    });
  }
  return out;
}

/**
 * Build label options from label objects or strings.
 * @param {Array<string|{name:string,color?:string}>} labels
 */
function buildLabelOptions(labels) {
  const out = [];
  const seen = new Set();
  for (const l of labels || []) {
    const name = typeof l === 'string' ? l : l?.name;
    const raw = String(name || '').trim();
    if (!raw || seen.has(raw.toLowerCase())) continue;
    seen.add(raw.toLowerCase());
    out.push({
      id: raw,
      label: raw,
      keywords: [raw],
      meta: typeof l === 'object' ? l : { name: raw },
    });
  }
  return out;
}

/**
 * Build branch options from open PR list + current base/head.
 * @param {Array<{ headRef?: string, baseRef?: string }>} prs
 * @param {{ baseRef?: string, headRef?: string, extra?: string[] }} [ctx]
 */
function buildBranchOptions(prs, ctx = {}) {
  const names = new Set();
  for (const p of prs || []) {
    if (p?.headRef) names.add(String(p.headRef));
    if (p?.baseRef) names.add(String(p.baseRef));
  }
  if (ctx.baseRef) names.add(String(ctx.baseRef));
  if (ctx.headRef) names.add(String(ctx.headRef));
  for (const e of ctx.extra || []) if (e) names.add(String(e));
  // Common defaults
  for (const d of ['main', 'master', 'develop', 'dev', 'trunk']) names.add(d);
  return [...names]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      id: name,
      label: name,
      keywords: [name],
      meta: { branch: name },
    }));
}

/**
 * Merge reviewer logins + latest review state into display rows.
 * @returns {Array<{ login: string, status: string }>}
 */
function buildUnifiedReviewerRows(detail) {
  const d = detail || {};
  const statusBy = new Map();
  for (const r of d.reviews || []) {
    if (!r?.author) continue;
    statusBy.set(String(r.author).toLowerCase(), String(r.state || 'COMMENTED'));
  }
  const rows = new Map();
  for (const login of d.requestedReviewers || []) {
    const raw = String(login || '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    rows.set(key, { login: raw, status: statusBy.get(key) || 'PENDING' });
  }
  for (const [key, state] of statusBy) {
    if (rows.has(key)) {
      rows.get(key).status = state;
    } else {
      // use original casing from reviews
      const rev = (d.reviews || []).find(
        (r) => String(r.author || '').toLowerCase() === key
      );
      rows.set(key, { login: rev?.author || key, status: state });
    }
  }
  return [...rows.values()].sort((a, b) => a.login.localeCompare(b.login));
}

const api = {
  filterSelectOptions,
  buildPeopleOptions,
  buildLabelOptions,
  buildBranchOptions,
  buildUnifiedReviewerRows,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalSearchableSelect = api;
}
