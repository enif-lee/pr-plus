/** @module modal/lib/ui-polish */
/**
 * Pure helpers for modal UI polish: unique people, entity URLs, magic links, stack strip.
 */

export function uniqueLogins(list) {
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
export function uniqueReviewsByAuthor(reviews) {
  const by = new Map();
  for (const r of reviews || []) {
    if (!r || !r.author) continue;
    const key = String(r.author).toLowerCase();
    by.set(key, r);
  }
  return [...by.values()];
}

export function githubUserUrl(login) {
  const u = String(login || '')
    .trim()
    .replace(/^@/, '');
  if (!u) return '';
  return `https://github.com/${encodeURIComponent(u)}`;
}

export function githubLabelUrl(owner, repo, labelName) {
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const name = String(labelName || '').trim();
  if (!o || !r || !name) return '';
  return `https://github.com/${encodeURIComponent(o)}/${encodeURIComponent(r)}/labels/${encodeURIComponent(name)}`;
}

export function githubIssueUrl(owner, repo, number) {
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n) || n <= 0) return '';
  return `https://github.com/${encodeURIComponent(o)}/${encodeURIComponent(r)}/issues/${n}`;
}

export function githubPullUrl(owner, repo, number) {
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n) || n <= 0) return '';
  return `https://github.com/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pull/${n}`;
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
export function linkifyMentionsAndIssues(html, ctx: any = {}) {
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
export function applyMagicLinksToHtml(html, magicLinks) {
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
export function enhanceMarkdownHtml(html: any, { owner, repo, magicLinks }: any = {}) {
  let out = String(html || '');
  out = linkifyMentionsAndIssues(out, { owner, repo });
  out = applyMagicLinksToHtml(out, magicLinks);
  return out;
}

/**
 * Build stacked-PR strip for the open PR from same-repo open PR list (base/head chain).
 * Order: root → … → current → … → deepest child path through current.
 * @param {Array} prs flat open PR descriptors
 * @param {number|string} currentNumber
 * @returns {Array<{ number: number, title: string, headRef: string, baseRef: string, htmlUrl: string, current: boolean, depth: number }>}
 */
export function buildStackStrip(prs, currentNumber) {
  const list = Array.isArray(prs) ? prs : [];
  const curNum = Number(currentNumber);
  if (!list.length || !Number.isFinite(curNum)) return [];

  const byNumber = new Map();
  const byHead = new Map();
  for (const pr of list) {
    if (!pr || pr.number == null) continue;
    byNumber.set(Number(pr.number), pr);
    if (pr.headRef) byHead.set(pr.headRef, pr);
  }
  const current = byNumber.get(curNum);
  if (!current) {
    // Only current known — single-node strip
    return [
      {
        number: curNum,
        title: '',
        headRef: '',
        baseRef: '',
        htmlUrl: '',
        current: true,
        depth: 0,
      },
    ];
  }

  // Walk parents (base → head of parent)
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

  // Walk one child chain preferring child that continues stack (first by number)
  const childrenOf = new Map();
  for (const pr of list) {
    if (!pr?.baseRef || !pr.headRef) continue;
    if (!childrenOf.has(pr.baseRef)) childrenOf.set(pr.baseRef, []);
    childrenOf.get(pr.baseRef).push(pr);
  }
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => Number(b.number) - Number(a.number));
  }

  const descendants = [];
  const seenDown = new Set([current.number]);
  let node = current;
  while (node?.headRef) {
    const kids = childrenOf.get(node.headRef) || [];
    const child = kids.find((c) => !seenDown.has(c.number));
    if (!child) break;
    seenDown.add(child.number);
    descendants.push(child);
    node = child;
  }

  const chain = [...ancestors, current, ...descendants];
  return chain.map((pr, depth) => ({
    number: Number(pr.number),
    title: pr.title || '',
    headRef: pr.headRef || '',
    baseRef: pr.baseRef || '',
    htmlUrl: pr.htmlUrl || pr.html_url || '',
    draft: Boolean(pr.draft),
    current: Number(pr.number) === curNum,
    depth,
  }));
}
