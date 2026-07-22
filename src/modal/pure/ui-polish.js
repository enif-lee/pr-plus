/**
 * Pure helpers for modal UI polish: unique people, entity URLs, magic links, stack strip.
 */

function uniqueLogins(list) {
  const out = [];
  const seen = new Set();
  for (const item of list || []) {
    const login =
      typeof item === 'string'
        ? item
        : item?.login || item?.author || item?.name || '';
    const raw = String(login || '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

/**
 * One row per author (last review wins) for review-status lists.
 * @param {Array<{ author?: string, state?: string, id?: * }>} reviews
 */
function uniqueReviewsByAuthor(reviews) {
  const by = new Map();
  for (const r of reviews || []) {
    if (!r || !r.author) continue;
    const key = String(r.author).toLowerCase();
    by.set(key, r);
  }
  return [...by.values()];
}

function githubAvatarUrl(login, size) {
  const u = String(login || '')
    .trim()
    .replace(/^@/, '');
  if (!u) return '';
  const s = Number(size);
  const px = Number.isFinite(s) && s > 0 ? Math.min(460, Math.floor(s)) : 40;
  return `https://github.com/${encodeURIComponent(u)}.png?size=${px}`;
}

function githubUserUrl(login) {
  const u = String(login || '')
    .trim()
    .replace(/^@/, '');
  if (!u) return '';
  return `https://github.com/${encodeURIComponent(u)}`;
}

function githubLabelUrl(owner, repo, labelName) {
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const name = String(labelName || '').trim();
  if (!o || !r || !name) return '';
  return `https://github.com/${encodeURIComponent(o)}/${encodeURIComponent(r)}/labels/${encodeURIComponent(name)}`;
}

function githubIssueUrl(owner, repo, number) {
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n) || n <= 0) return '';
  return `https://github.com/${encodeURIComponent(o)}/${encodeURIComponent(r)}/issues/${n}`;
}

function githubPullUrl(owner, repo, number) {
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n) || n <= 0) return '';
  return `https://github.com/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pull/${n}`;
}

/** Encode a git ref for a path (keep `/` as path separators). */
function encodeGitRefPath(ref) {
  const raw = String(ref || '').trim();
  if (!raw) return '';
  return raw
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

/** Branch / tag tree page: /owner/repo/tree/ref */
function githubTreeUrl(owner, repo, ref) {
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const path = encodeGitRefPath(ref);
  if (!o || !r || !path) return '';
  return `https://github.com/${encodeURIComponent(o)}/${encodeURIComponent(r)}/tree/${path}`;
}

/** Commit page: /owner/repo/commit/sha */
function githubCommitUrl(owner, repo, sha) {
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const s = String(sha || '').trim();
  if (!o || !r || !s) return '';
  return `https://github.com/${encodeURIComponent(o)}/${encodeURIComponent(r)}/commit/${encodeURIComponent(s)}`;
}

function escapeHtmlLite(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Linkify @mentions and #issue refs inside HTML (skip existing tags/attributes).
 * @param {string} html
 * @param {{ owner?: string, repo?: string }} ctx
 */
function linkifyMentionsAndIssues(html, ctx = {}) {
  const owner = ctx.owner || '';
  const repo = ctx.repo || '';
  let out = String(html || '');
  // Split by tags so we only rewrite text nodes
  const parts = out.split(/(<[^>]+>)/g);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith('<')) continue;
    let t = parts[i];
    t = t.replace(/(^|[^A-Za-z0-9_/-])@([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)/g, (m, pre, user) => {
      const href = githubUserUrl(user);
      if (!href) return m;
      return `${pre}<a class="prp-entity-link prp-entity-link--user" href="${href}" target="_blank" rel="noreferrer">@${escapeHtmlLite(user)}</a>`;
    });
    if (owner && repo) {
      t = t.replace(/(^|[^A-Za-z0-9_/])#(\d+)\b/g, (m, pre, num) => {
        const href = githubIssueUrl(owner, repo, num);
        if (!href) return m;
        return `${pre}<a class="prp-entity-link prp-entity-link--issue" href="${href}" target="_blank" rel="noreferrer">#${num}</a>`;
      });
    }
    parts[i] = t;
  }
  return parts.join('');
}

/**
 * Apply repo magic-link keys into HTML text nodes.
 * @param {string} html
 * @param {Array<{ key: string, url: string }>} magicLinks
 */
function applyMagicLinksToHtml(html, magicLinks) {
  const links = Array.isArray(magicLinks) ? magicLinks : [];
  if (!links.length) return String(html || '');
  // Longer keys first to avoid partial clobber
  const sorted = links
    .filter((l) => l && l.key && l.url)
    .slice()
    .sort((a, b) => String(b.key).length - String(a.key).length);
  const parts = String(html || '').split(/(<[^>]+>)/g);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith('<')) continue;
    let t = parts[i];
    for (const { key, url } of sorted) {
      const safeKey = String(key);
      if (!safeKey || t.indexOf(safeKey) === -1) continue;
      // Avoid double-linking
      const re = new RegExp(
        `(?<![\\w/])(${safeKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\w/])`,
        'g'
      );
      t = t.replace(re, (m) => {
        return `<a class="prp-entity-link prp-entity-link--magic" href="${escapeHtmlLite(url)}" target="_blank" rel="noreferrer">${escapeHtmlLite(m)}</a>`;
      });
    }
    parts[i] = t;
  }
  return parts.join('');
}

/**
 * Full post-process after markdown HTML generation.
 */
function enhanceMarkdownHtml(html, { owner, repo, magicLinks } = {}) {
  let out = String(html || '');
  out = linkifyMentionsAndIssues(out, { owner, repo });
  out = applyMagicLinksToHtml(out, magicLinks);
  return out;
}

function indexStackPulls(prs) {
  const list = Array.isArray(prs) ? prs : [];
  const byNumber = new Map();
  const byHead = new Map();
  const childrenOf = new Map();
  for (const pr of list) {
    if (!pr || pr.number == null) continue;
    byNumber.set(Number(pr.number), pr);
    if (pr.headRef) byHead.set(pr.headRef, pr);
    if (pr.baseRef && pr.headRef) {
      if (!childrenOf.has(pr.baseRef)) childrenOf.set(pr.baseRef, []);
      childrenOf.get(pr.baseRef).push(pr);
    }
  }
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => Number(b.number) - Number(a.number));
  }
  return { byNumber, byHead, childrenOf };
}

function stripItem(pr, curNum, depth) {
  return {
    number: Number(pr.number),
    title: pr.title || '',
    headRef: pr.headRef || '',
    baseRef: pr.baseRef || '',
    htmlUrl: pr.htmlUrl || pr.html_url || '',
    draft: Boolean(pr.draft),
    current: Number(pr.number) === curNum,
    depth,
  };
}

function pickStackChild(kids, parentHeadRef, pathSelections = {}) {
  const list = Array.isArray(kids) ? kids : [];
  if (!list.length) return null;
  const pref = pathSelections?.[parentHeadRef];
  if (pref != null) {
    const hit = list.find((c) => Number(c.number) === Number(pref));
    if (hit) return hit;
  }
  return list[0];
}

function buildStackPathModel(prs, currentNumber, pathSelections = {}) {
  const curNum = Number(currentNumber);
  const empty = { items: [], branches: [] };
  if (!Number.isFinite(curNum)) return empty;
  const { byNumber, byHead, childrenOf } = indexStackPulls(prs);
  const current = byNumber.get(curNum);
  if (!current) {
    return {
      items: [
        {
          number: curNum,
          title: '',
          headRef: '',
          baseRef: '',
          htmlUrl: '',
          current: true,
          depth: 0,
        },
      ],
      branches: [],
    };
  }
  const ancestors = [];
  const seenUp = new Set();
  let p = current;
  while (p && p.baseRef && byHead.has(p.baseRef)) {
    const parent = byHead.get(p.baseRef);
    if (!parent || parent === p) break;
    if (seenUp.has(parent.number)) break;
    seenUp.add(parent.number);
    ancestors.unshift(parent);
    p = parent;
  }
  const toOption = (c) => ({
    number: Number(c.number),
    title: c.title || '',
    headRef: c.headRef || '',
    baseRef: c.baseRef || '',
    htmlUrl: c.htmlUrl || c.html_url || '',
    draft: Boolean(c.draft),
  });
  const descendants = [];
  const seenDown = new Set([current.number]);
  let node = current;
  while (node?.headRef) {
    const kids = (childrenOf.get(node.headRef) || []).filter(
      (c) => !seenDown.has(c.number)
    );
    if (!kids.length) break;
    const child = pickStackChild(kids, node.headRef, pathSelections);
    if (!child) break;
    seenDown.add(child.number);
    descendants.push(child);
    node = child;
  }
  const chain = [...ancestors, current, ...descendants];
  const branches = [];
  const seenParents = new Set();
  for (let depth = 0; depth < chain.length; depth++) {
    const pr = chain[depth];
    if (!pr?.baseRef) continue;
    const parent = byHead.get(pr.baseRef);
    if (!parent?.headRef) continue;
    const parentHeadRef = parent.headRef;
    if (seenParents.has(parentHeadRef)) continue;
    const kids = childrenOf.get(parentHeadRef) || [];
    if (kids.length < 2) continue;
    seenParents.add(parentHeadRef);
    let selected = pickStackChild(kids, parentHeadRef, pathSelections);
    const onChain = kids.find((c) =>
      chain.some((x) => Number(x.number) === Number(c.number))
    );
    if (pathSelections?.[parentHeadRef] == null && onChain) selected = onChain;
    if (!selected) selected = pr;
    branches.push({
      parentNumber: Number(parent.number),
      parentHeadRef,
      levelNumber: Number(selected.number),
      selectedNumber: Number(selected.number),
      depth,
      options: kids.map(toOption),
    });
  }
  const items = chain.map((pr, depth) => stripItem(pr, curNum, depth));
  return { items, branches };
}

function buildStackStrip(prs, currentNumber, pathSelections = {}) {
  return buildStackPathModel(prs, currentNumber, pathSelections).items;
}

const STACK_PATH_HOVER_MS = 450;

function stackBranchHasPathPicker(branch) {
  return Boolean(branch && Array.isArray(branch.options) && branch.options.length >= 2);
}

function buildStackBranchSelectOptions(branch) {
  const opts = Array.isArray(branch?.options) ? branch.options : [];
  return opts.map((o) => {
    const num = Number(o.number);
    const title = o.title ? String(o.title) : '';
    const head = o.headRef ? String(o.headRef) : '';
    return {
      id: String(num),
      label: title ? `#${num} · ${title}` : `#${num}${head ? ` (${head})` : ''}`,
      keywords: [title, head, o.baseRef, String(num)].filter(Boolean),
      meta: {
        kind: 'pr',
        number: num,
        headRef: head,
        baseRef: o.baseRef || '',
        htmlUrl: o.htmlUrl || '',
        selected: Number(branch?.selectedNumber) === num,
      },
    };
  });
}

function reduceStackPathHover(state, event) {
  const cur = state || { openKey: null, armedKey: null };
  const type = event?.type;
  const key = event?.key == null ? null : String(event.key);

  if (type === 'enter') {
    if (!key) {
      return { openKey: cur.openKey, armedKey: null, scheduleOpen: false, cancelTimer: true };
    }
    if (cur.openKey === key) {
      return { openKey: cur.openKey, armedKey: key, scheduleOpen: false, cancelTimer: true };
    }
    return { openKey: cur.openKey, armedKey: key, scheduleOpen: true, cancelTimer: true };
  }
  if (type === 'leave') {
    return { openKey: cur.openKey, armedKey: null, scheduleOpen: false, cancelTimer: true };
  }
  if (type === 'timer-fire') {
    if (cur.armedKey && cur.armedKey === key) {
      return { openKey: key, armedKey: null, scheduleOpen: false, cancelTimer: true };
    }
    return { openKey: cur.openKey, armedKey: cur.armedKey, scheduleOpen: false, cancelTimer: false };
  }
  if (type === 'close') {
    return { openKey: null, armedKey: null, scheduleOpen: false, cancelTimer: true };
  }
  if (type === 'open-now') {
    return { openKey: key, armedKey: null, scheduleOpen: false, cancelTimer: true };
  }
  return { openKey: cur.openKey, armedKey: cur.armedKey, scheduleOpen: false, cancelTimer: false };
}

const api = {
  uniqueLogins,
  uniqueReviewsByAuthor,
  githubAvatarUrl,
  githubUserUrl,
  githubLabelUrl,
  githubIssueUrl,
  githubPullUrl,
  encodeGitRefPath,
  githubTreeUrl,
  githubCommitUrl,
  linkifyMentionsAndIssues,
  applyMagicLinksToHtml,
  enhanceMarkdownHtml,
  indexStackPulls,
  pickStackChild,
  buildStackPathModel,
  buildStackStrip,
  STACK_PATH_HOVER_MS,
  stackBranchHasPathPicker,
  buildStackBranchSelectOptions,
  reduceStackPathHover,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalUiPolish = api;
}
