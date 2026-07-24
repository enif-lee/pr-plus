/**
 * Pure helpers: Create-and-apply eligibility, tags∩commits, aside search/full-load.
 */

function shouldOfferCreateAndApply(filteredCount, query) {
  const n = Number(filteredCount);
  const q = String(query || '').trim();
  return Boolean(q) && Number.isFinite(n) && n === 0;
}

function resolveCreateAndApplyConfirmLabel(
  filteredCount,
  query,
  defaultLabel
) {
  return shouldOfferCreateAndApply(filteredCount, query)
    ? 'Create and apply'
    : String(defaultLabel || 'Apply');
}

function mergeCreateAndApplyLabelIds(selectedIds, query, createMode) {
  const selected = Array.isArray(selectedIds)
    ? selectedIds.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (!createMode) return selected;
  const name = String(query || '').trim();
  if (!name) return selected;
  const lower = name.toLowerCase();
  if (selected.some((s) => s.toLowerCase() === lower)) return selected;
  return selected.concat([name]);
}

function tagsIntersectingCommits(tags, commits) {
  const commitShas = new Set();
  for (const c of Array.isArray(commits) ? commits : []) {
    const sha =
      typeof c === 'string'
        ? c.trim().toLowerCase()
        : String(c?.sha || '')
            .trim()
            .toLowerCase();
    if (sha) commitShas.add(sha);
  }
  const out = [];
  const seen = new Set();
  for (const t of Array.isArray(tags) ? tags : []) {
    const name = String(t?.name || '').trim();
    const sha = String(t?.sha || '')
      .trim()
      .toLowerCase();
    if (!name || !sha || seen.has(name.toLowerCase())) continue;
    let hit = commitShas.has(sha);
    if (!hit) {
      for (const cs of commitShas) {
        if (cs.startsWith(sha) || sha.startsWith(cs)) {
          hit = true;
          break;
        }
      }
    }
    if (!hit) continue;
    seen.add(name.toLowerCase());
    out.push({ name, sha: String(t?.sha || sha) });
  }
  return out;
}

function filterCommitsByQuery(commits, query) {
  const list = Array.isArray(commits) ? commits : [];
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return list.slice();
  return list.filter((c) => {
    const msg = String(c?.message || '').toLowerCase();
    const sha = String(c?.sha || '').toLowerCase();
    const author = String(c?.author || '').toLowerCase();
    return msg.includes(q) || sha.includes(q) || author.includes(q);
  });
}

function filterFilesByQuery(files, query) {
  const list = Array.isArray(files) ? files : [];
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return list.slice();
  return list.filter((f) => {
    const path = String(f?.filename || f?.path || f?.name || '').toLowerCase();
    return path.includes(q);
  });
}

function needsFullCorpusLoad(opts) {
  const o = opts || {};
  if (o.fullyLoaded) return false;
  const q = String(o.query || '').trim();
  return Boolean(o.loadMore) || Boolean(q);
}

const api = {
  shouldOfferCreateAndApply,
  resolveCreateAndApplyConfirmLabel,
  mergeCreateAndApplyLabelIds,
  tagsIntersectingCommits,
  filterCommitsByQuery,
  filterFilesByQuery,
  needsFullCorpusLoad,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalCreateAndApply = api;
}
