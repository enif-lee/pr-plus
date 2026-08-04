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

/**
 * Public GitHub avatar URL for a login (no API required).
 * size is the requested pixel width (GitHub serves a square PNG).
 */
export function githubAvatarUrl(login, size = 40) {
  const u = String(login || '')
    .trim()
    .replace(/^@/, '');
  if (!u) return '';
  const s = Number(size);
  const px = Number.isFinite(s) && s > 0 ? Math.min(460, Math.floor(s)) : 40;
  return `https://github.com/${encodeURIComponent(u)}.png?size=${px}`;
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

export type GithubPrPageUrlOpts = {
  owner?: string;
  repo?: string;
  number?: number | string;
  htmlUrl?: string | null;
  webOrigin?: string | null;
};

/**
 * Canonical GitHub (or GHES) PR detail page URL for open/copy actions.
 * Prefer API `htmlUrl` when present; otherwise build from webOrigin + owner/repo/number.
 */
export function buildGithubPrPageUrl(opts: GithubPrPageUrlOpts = {}): string {
  const html = String(opts.htmlUrl || '').trim();
  if (html) {
    // Strip hash/query noise for clipboard; keep path
    try {
      const u = new URL(html);
      if (/\/pull\/\d+/i.test(u.pathname)) {
        return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
      }
      // Some payloads use full html_url already clean
      if (/^https?:\/\//i.test(html)) return html.replace(/\/$/, '');
    } catch {
      if (/^https?:\/\//i.test(html) && /\/pull\/\d+/i.test(html)) {
        return html.split(/[?#]/)[0].replace(/\/$/, '');
      }
    }
  }
  const o = String(opts.owner || '').trim();
  const r = String(opts.repo || '').trim();
  const n = Number(opts.number);
  if (!o || !r || !Number.isFinite(n) || n <= 0) return '';
  let origin = String(opts.webOrigin || 'https://github.com').trim();
  if (!origin) origin = 'https://github.com';
  origin = origin.replace(/\/$/, '');
  if (!/^https?:\/\//i.test(origin)) origin = `https://${origin}`;
  return `${origin}/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pull/${n}`;
}

/** Encode a git ref for a path (keep `/` as path separators). */
export function encodeGitRefPath(ref) {
  const raw = String(ref || '').trim();
  if (!raw) return '';
  return raw
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

/** Branch / tag tree page: /owner/repo/tree/ref */
export function githubTreeUrl(owner, repo, ref) {
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const path = encodeGitRefPath(ref);
  if (!o || !r || !path) return '';
  return `https://github.com/${encodeURIComponent(o)}/${encodeURIComponent(r)}/tree/${path}`;
}

/** Commit page: /owner/repo/commit/sha */
export function githubCommitUrl(owner, repo, sha) {
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
 * Index open PRs for stack walks.
 * @returns {{ byNumber: Map, byHead: Map, childrenOf: Map<string, Array> }}
 */
export function indexStackPulls(prs) {
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
    // Stable “first branch” = highest number first (matches tree list ordering)
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

/**
 * Pick child at a branch: pathSelections[parentHeadRef] or first kid.
 * @param {Array} kids
 * @param {string} parentHeadRef
 * @param {Record<string, number|string>} pathSelections
 */
export function pickStackChild(kids, parentHeadRef, pathSelections: any = {}) {
  const list = Array.isArray(kids) ? kids : [];
  if (!list.length) return null;
  const pref = pathSelections?.[parentHeadRef];
  if (pref != null) {
    const hit = list.find((c) => Number(c.number) === Number(pref));
    if (hit) return hit;
  }
  return list[0];
}

/**
 * Full stack path model: strip items + branch points (degree ≥ 2) for path select UI.
 * @param {Array} prs
 * @param {number|string} currentNumber
 * @param {Record<string, number|string>} [pathSelections] parentHeadRef → child PR number
 * @returns {{ items: Array, branches: Array }}
 */
export function buildStackPathModel(prs, currentNumber, pathSelections: any = {}) {
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

  // Walk descendants with pathSelections (prefer first branch by default)
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

  /**
   * For every node on the visible path: if it has siblings under the same
   * parent, expose a path picker on **that node’s chip** listing those siblings
   * (other branches at this degree).
   */
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
    // Prefer pathSelections, else the node actually on the chain
    let selected = pickStackChild(kids, parentHeadRef, pathSelections);
    const onChain = kids.find((c) =>
      chain.some((x) => Number(x.number) === Number(c.number))
    );
    if (pathSelections?.[parentHeadRef] == null && onChain) selected = onChain;
    if (!selected) selected = pr;
    branches.push({
      parentNumber: Number(parent.number),
      parentHeadRef,
      /** Anchor chip = this degree’s node on the strip */
      levelNumber: Number(selected.number),
      selectedNumber: Number(selected.number),
      depth,
      options: kids.map(toOption),
    });
  }

  const items = chain.map((pr, depth) => stripItem(pr, curNum, depth));
  return { items, branches };
}

/**
 * Build stacked-PR strip for the open PR from same-repo open PR list (base/head chain).
 * Order: root → … → current → … → deepest child path through current.
 * When a level has degree ≥ 2, pathSelections picks the child (default: first branch).
 * @param {Array} prs flat open PR descriptors
 * @param {number|string} currentNumber
 * @param {Record<string, number|string>} [pathSelections]
 * @returns {Array}
 */
export function buildStackStrip(prs, currentNumber, pathSelections: any = {}) {
  return buildStackPathModel(prs, currentNumber, pathSelections).items;
}

/** Hover dwell before opening floating stack path picker (ms). */
export const STACK_PATH_HOVER_MS = 450;

/**
 * Whether a branch control should expose a path picker (degree ≥ 2).
 */
export function stackBranchHasPathPicker(branch) {
  return Boolean(branch && Array.isArray(branch.options) && branch.options.length >= 2);
}

/**
 * Map a stack branch to SearchableSelect options.
 * @param {{ options?: Array, selectedNumber?: number }} branch
 * @returns {Array<{ id: string, label: string, keywords?: string[], meta?: object }>}
 */
export function buildStackBranchSelectOptions(branch) {
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

/**
 * Pure hover-open state machine for stack path picker.
 * @param {{ openKey: string|null, armedKey: string|null }} state
 * @param {{ type: string, key?: string|null }} event
 * @returns {{ openKey: string|null, armedKey: string|null, scheduleOpen: boolean, cancelTimer: boolean }}
 */
export function reduceStackPathHover(state, event) {
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
    // Leaving chip: cancel pending open; keep open panel until outside click / explicit close
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
