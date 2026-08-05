/**
 * DOM manipulation for GitHub PR list tree view.
 * Keeps native list rows; applies stack depth via left indent and reordering.
 */

const PR_TREE_TOGGLE_ID = 'pr-tree-toggle';
const PR_TREE_INDENT_CLASS = 'pr-tree-indented';
const PR_TREE_ACTIVE_CLASS = 'pr-tree-active';
const PR_TREE_DECORATED_CLASS = 'pr-tree-decorated';
const PR_TREE_META_CLASS = 'pr-tree-row-meta';
const PR_TREE_META_HOST_CLASS = 'pr-tree-meta-host';

const PR_ROW_SELECTORS = [
  '.js-navigation-container .js-issue-row',
  '.js-issue-row:has(.octicon-git-pull-request)',
  '.js-issue-row:has(.octicon-git-pull-request-draft)',
  'li[role="listitem"]:has(a[data-hovercard-url*="/pull"])',
  'li[role="listitem"]:has(h3 a[href*="/pull/"])',
  'li[role="listitem"]:has(a[href*="/pull/"])',
  '#js-issues-results [id^="issue_"]',
  '[data-testid="issue-pr-row"]',
  'div[id^="issue_"]',
];

function parseRepoFromPathname(pathname: any) {
  const match = pathname.match(/^\/([^/]+)\/([^/]+)\/pulls(?:\/|$)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function queryAllPrRows(doc: any) {
  const seen = new Set();
  const rows = [];
  for (const selector of PR_ROW_SELECTORS) {
    let matches;
    try {
      matches = doc.querySelectorAll(selector);
    } catch {
      continue;
    }
    for (const el of matches) {
      if (!seen.has(el)) {
        seen.add(el);
        rows.push(el);
      }
    }
  }
  return rows;
}

/** Keep only the largest same-parent group (avoids mixing stray matches). */
function selectPrimaryRowGroup(rows: any) {
  if (rows.length === 0) return [];
  const byParent = new Map();
  for (const row of rows) {
    const parent = row.parentElement;
    if (!parent) continue;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(row);
  }
  let best = [];
  for (const group of byParent.values()) {
    if (group.length > best.length) best = group;
  }
  return best.length > 0 ? best : rows;
}

function findOriginalPrRows(doc: any) {
  return selectPrimaryRowGroup(queryAllPrRows(doc));
}

function getPrNumberFromRow(row: any) {
  if (!row) return Number.NaN;

  const idMatch = row.id?.match(/(?:issue_|pull_|PR_)(\d+)/i);
  if (idMatch) return Number.parseInt(idMatch[1], 10);

  const dataNum =
    row.getAttribute?.('data-pull-request-number') ||
    row.getAttribute?.('data-issue-number') ||
    row.dataset?.pullRequestNumber ||
    row.dataset?.issueNumber;
  if (dataNum && /^\d+$/.test(dataNum)) {
    return Number.parseInt(dataNum, 10);
  }

  const links = row.querySelectorAll?.(
    'a[href*="/pull/"], a.js-navigation-open, a[id$="_link"], h3 a'
  );
  if (links) {
    for (const link of links) {
      const href = link.getAttribute('href') || link.href || '';
      const m = href.match(/\/pull\/(\d+)(?:\/|$|\?|#)/);
      if (m) return Number.parseInt(m[1], 10);
    }
  }

  const textId = row.querySelector?.('[id*="issue_"], [id*="pull_"]')?.id;
  const nestedId = textId?.match(/(\d+)/)?.[1];
  if (nestedId) return Number.parseInt(nestedId, 10);

  return Number.NaN;
}

function collectPagePrNumbers(doc: any) {
  const numbers = [];
  const seen = new Set();
  for (const row of findOriginalPrRows(doc)) {
    const num = getPrNumberFromRow(row);
    if (!Number.isFinite(num) || seen.has(num)) continue;
    seen.add(num);
    numbers.push(num);
  }
  return numbers;
}

function findPrListMount(doc: any) {
  const rows = findOriginalPrRows(doc);
  if (rows.length === 0) return null;
  const firstRow = rows[0];
  const parent = firstRow.parentElement;
  if (!parent) return null;
  return { parent, insertBefore: firstRow, rowCount: rows.length };
}

function findPrListContainer(doc: any) {
  const mount = findPrListMount(doc);
  if (mount) return mount.parent;

  return (
    doc.querySelector('#js-issues-results') ||
    doc.querySelector('[aria-label="Pull Requests"]') ||
    doc.querySelector('[aria-label="Issues"]') ||
    doc.querySelector('.js-navigation-container') ||
    doc.querySelector('main')
  );
}

function buildDepthAndOrderMaps(forest: any) {
  const treeApi = globalThis.PRTree;
  const flat = treeApi.flattenPrTree(forest);
  const depthByNumber = new Map();
  const order = [];
  for (const { pr, depth } of flat) {
    depthByNumber.set(pr.number, depth);
    order.push(pr.number);
  }
  return { depthByNumber, order };
}

function applyTreeIndents(doc: any, forest: any) {
  const rows = findOriginalPrRows(doc);
  if (rows.length === 0) return 0;

  const parent = rows[0].parentElement;
  if (!parent) return 0;

  const { depthByNumber, order } = buildDepthAndOrderMaps(forest);
  const rowByNumber = new Map();

  for (const [index, row] of rows.entries()) {
    if (row.dataset.prTreeOriginalIndex === undefined) {
      row.dataset.prTreeOriginalIndex = String(index);
    }
    const num = getPrNumberFromRow(row);
    if (Number.isFinite(num)) rowByNumber.set(num, row);
  }

  // Prefer reordering only rows we can identify; keep unknowns at end.
  const orderedRows = [];
  const used = new Set();
  for (const num of order) {
    const row = rowByNumber.get(num);
    if (row) {
      orderedRows.push(row);
      used.add(row);
    }
  }
  for (const row of rows) {
    if (!used.has(row)) orderedRows.push(row);
  }

  // Suppress observer noise is caller's job; still reorder in one pass.
  for (const row of orderedRows) {
    parent.appendChild(row);
  }

  let applied = 0;
  for (const row of orderedRows) {
    const num = getPrNumberFromRow(row);
    const depth = Number.isFinite(num) ? (depthByNumber.get(num) ?? 0) : 0;
    row.classList.add(PR_TREE_INDENT_CLASS, PR_TREE_ACTIVE_CLASS);
    row.dataset.prTreeDepth = String(depth);
    row.style.setProperty('--pr-tree-depth', String(depth));
    applied += 1;
  }

  return applied;
}

function clearTreeIndents(doc: any) {
  const rows = [...doc.querySelectorAll(`.${PR_TREE_INDENT_CLASS}`)];
  const parent = rows[0]?.parentElement;

  if (parent && rows.length > 0) {
    const sorted = [...(rows as any)].sort(
      (a, b) =>
        Number(a.dataset.prTreeOriginalIndex ?? 0) -
        Number(b.dataset.prTreeOriginalIndex ?? 0)
    );
    for (const row of sorted) {
      parent.appendChild(row);
    }
  }

  for (const row of rows) {
    row.classList.remove(PR_TREE_INDENT_CLASS, PR_TREE_ACTIVE_CLASS);
    row.style.removeProperty('--pr-tree-depth');
    delete row.dataset.prTreeDepth;
  }

  return rows.length;
}

function countUnstyledPrRows(doc: any) {
  const rows = findOriginalPrRows(doc);
  if (rows.length === 0) return 0;
  return rows.filter((row) => !row.classList.contains(PR_TREE_INDENT_CLASS)).length;
}

const PR_TREE_REVIEW_STATE = 'prTreeReviewState';
const PR_TREE_NATIVE_META_CLASS = 'pr-tree-native-meta';

/**
 * Title column host (second flex column: title + labels + meta line).
 */
function findSecondColumnHost(row: any) {
  if (!row) return null;

  const title =
    row.querySelector('a.js-navigation-open') ||
    row.querySelector('a[id$="_link"]') ||
    row.querySelector('h3 a[href*="/pull/"]') ||
    row.querySelector('a[href*="/pull/"]');

  if (title?.parentElement) {
    const col = title.closest('.flex-auto, [class*="Title"]') || title.parentElement;
    return col;
  }

  const direct = [...(row.children || [])];
  if (direct.length >= 2) return direct[1];
  const nested = row.firstElementChild ? [...row.firstElementChild.children] : [];
  if (nested.length >= 2) return nested[1];

  return row;
}

/**
 * Native second meta line: "#123 opened … by … · Review required"
 * (kept hidden so deferred review decisions can still load)
 */
function findNativeSecondRow(row: any) {
  if (!row) return null;

  const marked = row.querySelector(`.${PR_TREE_NATIVE_META_CLASS}`);
  if (marked) return marked;

  const openedBy = row.querySelector('.opened-by');
  if (openedBy) {
    return (
      openedBy.closest('div.d-flex.mt-1') ||
      openedBy.closest('div.d-flex') ||
      openedBy.parentElement
    );
  }

  const col = findSecondColumnHost(row);
  if (!col) return null;
  for (const el of col.querySelectorAll('.text-small.color-fg-muted, .mt-1.text-small, div.d-flex.mt-1')) {
    if (el.classList.contains(PR_TREE_META_CLASS)) continue;
    if (el.querySelector('.opened-by') || /#\d+/.test(el.textContent || '')) return el;
  }
  return null;
}

function detectReviewState(text: any) {
  if (!text) return null;
  if (/changes\s+requested/i.test(text)) return 'changes_requested';
  if (/review\s+required/i.test(text)) return 'review_required';
  if (/\bapproved\b/i.test(text)) return 'approved';
  return null;
}

function truncateBranchName(name: any, max: any = 24) {
  if (!name || typeof name !== 'string') return '';
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

/** Single muted gray chip: base ← head */
function buildBranchBadge(doc: any, pr: any) {
  const badge = doc.createElement('span');
  badge.className = 'pr-tree-badge pr-tree-badge-branch';
  const label = `${truncateBranchName(pr.baseRef)} ← ${truncateBranchName(pr.headRef)}`;
  badge.textContent = label;
  badge.title = `${pr.baseRef} ← ${pr.headRef}`;
  badge.setAttribute('aria-label', `base ${pr.baseRef}, head ${pr.headRef}`);
  return badge;
}

function buildDraftBadge(doc: any) {
  const badge = doc.createElement('span');
  badge.className = 'pr-tree-badge pr-tree-badge-draft';
  badge.textContent = 'Draft';
  return badge;
}

function buildReviewBadge(doc: any, label: any, kind: any) {
  const badge = doc.createElement('span');
  badge.className = `pr-tree-badge pr-tree-badge-${kind}`;
  badge.textContent = label;
  return badge;
}

function buildPrNumberEl(doc: any, pr: any) {
  const el = doc.createElement('span');
  el.className = 'pr-tree-pr-number';
  el.textContent = `#${pr.number}`;
  return el;
}

function appendReviewBadge(doc: any, parent: any, reviewState: any) {
  if (reviewState === 'review_required') {
    parent.appendChild(buildReviewBadge(doc, 'Review required', 'review-required'));
  } else if (reviewState === 'changes_requested') {
    parent.appendChild(buildReviewBadge(doc, 'Changes requested', 'changes-requested'));
  } else if (reviewState === 'approved') {
    parent.appendChild(buildReviewBadge(doc, 'Approved', 'approved'));
  }
}

function extractNativeMetaBits(nativeSecond: any, pr: any) {
  const relativeTime = nativeSecond?.querySelector?.('relative-time');
  const authorLink =
    nativeSecond?.querySelector?.('.opened-by a[data-hovercard-type="user"]') ||
    nativeSecond?.querySelector?.('.opened-by a.Link--muted') ||
    nativeSecond?.querySelector?.('.opened-by a[href*="author"]') ||
    nativeSecond?.querySelector?.('.opened-by a');

  return {
    relativeTime: relativeTime ? relativeTime.cloneNode(true) : null,
    authorLink: authorLink ? authorLink.cloneNode(true) : null,
    authorLogin:
      authorLink?.textContent?.trim() ||
      (typeof pr?.author === 'string' && pr.author ? pr.author : null),
  };
}

/** "opened <relative-time> by author" from native row (or API author fallback). */
function buildOpenedMeta(doc: any, pr: any, bits: any) {
  const wrap = doc.createElement('span');
  wrap.className = 'pr-tree-opened';

  const hasTime = Boolean(bits.relativeTime);
  const hasAuthor = Boolean(bits.authorLink || bits.authorLogin);
  if (!hasTime && !hasAuthor) return null;

  if (hasTime) {
    wrap.appendChild(doc.createTextNode('opened '));
    const time = bits.relativeTime;
    time.classList.add('pr-tree-relative-time');
    wrap.appendChild(time);
  }

  if (hasAuthor) {
    wrap.appendChild(doc.createTextNode(hasTime ? ' by ' : 'by '));
    if (bits.authorLink) {
      const a = bits.authorLink;
      a.classList.add('pr-tree-author');
      // Keep GitHub hovercard attrs; strip noisy tooltips noise.
      wrap.appendChild(a);
    } else {
      const span = doc.createElement('span');
      span.className = 'pr-tree-author';
      span.textContent = bits.authorLogin;
      wrap.appendChild(span);
    }
  }

  return wrap;
}

function resolveReviewState(row: any, nativeSecond: any, meta: any) {
  const fromMeta = meta?.dataset?.[PR_TREE_REVIEW_STATE];
  if (fromMeta) return fromMeta;
  const fromNative = detectReviewState(nativeSecond?.textContent || '');
  if (fromNative) return fromNative;
  return detectReviewState(row?.textContent || '') || '';
}

function buildMagicLinkEl(doc: any, link: any) {
  const a = doc.createElement('a');
  a.className = 'pr-tree-badge pr-tree-badge-magic';
  a.href = link.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = link.key;
  a.title = `Open ${link.key}`;
  a.setAttribute('aria-label', `Magic link ${link.key}`);
  // Don't trigger GitHub row navigation.
  a.addEventListener('click', (e) => e.stopPropagation());
  return a;
}

function appendMagicLinks(doc: any, parent: any, pr: any) {
  const links = Array.isArray(pr?.magicLinks) ? pr.magicLinks : [];
  for (const link of links) {
    if (!link?.url || !link?.key) continue;
    parent.appendChild(buildMagicLinkEl(doc, link));
  }
}

function fillMetaContent(doc: any, meta: any, pr: any, reviewState: any, nativeSecond: any) {
  const bits = extractNativeMetaBits(nativeSecond, pr);
  meta.replaceChildren();
  meta.appendChild(buildPrNumberEl(doc, pr));

  const opened = buildOpenedMeta(doc, pr, bits);
  if (opened) meta.appendChild(opened);

  if (pr.draft) meta.appendChild(buildDraftBadge(doc));
  appendReviewBadge(doc, meta, reviewState);
  appendMagicLinks(doc, meta, pr);
  if (pr.baseRef && pr.headRef) meta.appendChild(buildBranchBadge(doc, pr));
}

/**
 * Hide native second-line meta and rebuild as sibling:
 * #number · opened <time> by author · Draft? · Review? · base ← head
 *
 * Native row stays in DOM (hidden) so batch-deferred review decisions still load.
 */
function applyRowMeta(doc: any, row: any, pr: any) {
  if (!row || !pr) return false;

  const host = findSecondColumnHost(row);
  if (!host) return false;

  let nativeSecond = findNativeSecondRow(row);
  if (nativeSecond && !nativeSecond.classList.contains(PR_TREE_META_CLASS)) {
    nativeSecond.classList.add(PR_TREE_NATIVE_META_CLASS);
    nativeSecond.setAttribute('hidden', '');
    nativeSecond.setAttribute('aria-hidden', 'true');
  }

  let meta = host.querySelector(`:scope > .${PR_TREE_META_CLASS}`);
  if (!meta) {
    meta = doc.createElement('div');
    meta.className = `d-flex mt-1 text-small color-fg-muted ${PR_TREE_META_CLASS} pr-tree-second-row`;
    if (nativeSecond && nativeSecond.parentElement === host) {
      nativeSecond.insertAdjacentElement('afterend', meta);
    } else {
      host.appendChild(meta);
    }
  }

  const reviewState = resolveReviewState(row, nativeSecond, meta);
  if (reviewState) meta.dataset[PR_TREE_REVIEW_STATE] = reviewState;

  fillMetaContent(doc, meta, pr, reviewState, nativeSecond);
  row.classList.add(PR_TREE_DECORATED_CLASS);
  return true;
}

/**
 * After deferred review HTML arrives in the hidden native row, refresh badges.
 * Also refreshes author/time clones if native content changed.
 */
function refreshReviewBadges(doc: any, prs: any) {
  if (!Array.isArray(prs) || prs.length === 0) return 0;
  const byNumber = new Map(prs.map((pr) => [pr.number, pr]));
  let updated = 0;

  for (const row of findOriginalPrRows(doc)) {
    const num = getPrNumberFromRow(row);
    const pr = byNumber.get(num);
    if (!pr) continue;

    const meta = row.querySelector(`.${PR_TREE_META_CLASS}`);
    const nativeSecond = row.querySelector(`.${PR_TREE_NATIVE_META_CLASS}`);
    if (!meta) continue;

    const next =
      detectReviewState(nativeSecond?.textContent || '') ||
      detectReviewState(row.textContent || '') ||
      '';
    const prev = meta.dataset[PR_TREE_REVIEW_STATE] || '';
    const hasAuthor = Boolean(meta.querySelector('.pr-tree-author'));
    const hasTime = Boolean(meta.querySelector('.pr-tree-relative-time, relative-time'));
    const nativeHasAuthor = Boolean(
      nativeSecond?.querySelector?.('.opened-by a')
    );
    const nativeHasTime = Boolean(nativeSecond?.querySelector?.('relative-time'));
    const needsAuthorTime = (nativeHasAuthor && !hasAuthor) || (nativeHasTime && !hasTime);

    if (next && next === prev && !needsAuthorTime) continue;
    if (!next && !needsAuthorTime && prev) {
      // still refresh if only missing opened meta
    }

    if (next) meta.dataset[PR_TREE_REVIEW_STATE] = next;
    fillMetaContent(doc, meta, pr, next || prev, nativeSecond);
    updated += 1;
  }
  return updated;
}

/** Rebuild second-line meta for list rows from PR API data. */
function applyListDecorations(doc: any, prs: any) {
  if (!Array.isArray(prs) || prs.length === 0) return 0;
  const byNumber = new Map(prs.map((pr) => [pr.number, pr]));
  let applied = 0;
  for (const row of findOriginalPrRows(doc)) {
    const num = getPrNumberFromRow(row);
    if (!Number.isFinite(num)) continue;
    const pr = byNumber.get(num);
    if (!pr) continue;
    if (applyRowMeta(doc, row, pr)) applied += 1;
  }
  // Pull in any deferred review text that already landed.
  refreshReviewBadges(doc, prs);
  return applied;
}

function clearListDecorations(doc: any) {
  for (const meta of doc.querySelectorAll(`.${PR_TREE_META_CLASS}`)) {
    meta.remove();
  }
  for (const el of doc.querySelectorAll(`.${PR_TREE_NATIVE_META_CLASS}`)) {
    el.classList.remove(PR_TREE_NATIVE_META_CLASS);
    el.removeAttribute('hidden');
    el.removeAttribute('aria-hidden');
  }
  for (const el of doc.querySelectorAll(`.${PR_TREE_META_HOST_CLASS}`)) {
    el.classList.remove(PR_TREE_META_HOST_CLASS);
  }
  for (const el of doc.querySelectorAll(`.${PR_TREE_DECORATED_CLASS}`)) {
    el.classList.remove(PR_TREE_DECORATED_CLASS);
  }
}

/**
 * Native GH list row control that shows the conversation comment count
 * (speech-bubble icon + number). Best-effort — markup varies by GH version.
 */
function findListRowCommentControl(row: any) {
  if (!row?.querySelector) return null;
  try {
    const withIcon = row.querySelector(
      'a:has(.octicon-comment), a:has([class*="octicon-comment"]), span:has(.octicon-comment)'
    );
    if (withIcon) return withIcon;
  } catch {
    /* :has() may throw on old engines */
  }
  const candidates = row.querySelectorAll?.(
    'a.Link--muted, a[class*="Link"], a[aria-label*="comment" i], a[aria-label*="Comment"]'
  );
  if (candidates) {
    for (const a of candidates) {
      const label = String(a.getAttribute?.('aria-label') || '');
      if (/comment/i.test(label)) return a;
      if (a.querySelector?.('.octicon-comment, [class*="octicon-comment"]')) {
        return a;
      }
    }
  }
  return null;
}

function findListRowByNumber(doc: any, prNumber: any) {
  const n = Number(prNumber);
  if (!Number.isFinite(n) || n <= 0) return null;
  for (const row of findOriginalPrRows(doc)) {
    if (getPrNumberFromRow(row) === n) return row;
  }
  return null;
}

function findListRowTitleAnchor(row: any) {
  if (!row?.querySelector) return null;
  return (
    row.querySelector('a.js-navigation-open') ||
    row.querySelector('a[id$="_link"]') ||
    row.querySelector('h3 a[href*="/pull/"]') ||
    row.querySelector('a.Link--primary[href*="/pull/"]') ||
    row.querySelector('a[href*="/pull/"]')
  );
}

/** Contrast text for a GH label hex color (no leading #). */
function labelFgForBg(hex: any) {
  const h = String(hex || 'ededed').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#000000';
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  // Relative luminance (sRGB approx)
  const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return y > 0.55 ? '#000000' : '#ffffff';
}

function normalizeListLabel(raw: any) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const name = raw.trim();
    return name ? { name, color: 'ededed', description: '' } : null;
  }
  const name = String(raw.name || raw.label || '').trim();
  if (!name) return null;
  return {
    name,
    color: String(raw.color || 'ededed').replace(/^#/, ''),
    description: String(raw.description || ''),
  };
}

function findListRowLabelsHost(row: any) {
  if (!row?.querySelector) return null;
  const owned = row.querySelector('.pr-tree-list-labels');
  if (owned) return owned;
  const classic = row.querySelector('.labels, .labels-list, [data-testid="list-row-labels"]');
  if (classic) return classic;
  const firstLabel = row.querySelector(
    'a.IssueLabel, span.IssueLabel, a.hx_IssueLabel, [class*="IssueLabel"]'
  );
  return firstLabel?.parentElement || null;
}

/**
 * Rebuild native list-row label chips from detail.labels.
 * Replaces an existing labels host or inserts after the title link.
 */
function applyListRowLabels(doc: any, row: any, labels: any) {
  if (!row || !doc) return false;
  const list = (Array.isArray(labels) ? labels : [])
    .map(normalizeListLabel)
    .filter(Boolean);

  let host = findListRowLabelsHost(row);
  if (!host) {
    if (!list.length) return true; // nothing to clear
    host = doc.createElement('span');
    host.className = 'labels lh-default d-block d-md-inline pr-tree-list-labels';
    const title = findListRowTitleAnchor(row);
    if (title?.parentElement) {
      title.insertAdjacentElement('afterend', host);
    } else {
      const col = findSecondColumnHost(row);
      (col || row).appendChild(host);
    }
  } else if (!host.classList.contains('pr-tree-list-labels')) {
    host.classList.add('pr-tree-list-labels');
  }

  host.replaceChildren();
  for (const lab of list) {
    const a = doc.createElement('a');
    a.className = 'IssueLabel hx_IssueLabel pr-tree-list-label';
    a.textContent = lab.name;
    a.title = lab.description || lab.name;
    a.setAttribute('data-name', lab.name);
    a.setAttribute('data-pr-tree-label', '1');
    const bg = `#${lab.color}`;
    a.style.backgroundColor = bg;
    a.style.color = labelFgForBg(lab.color);
    // Non-navigating chip — row open is handled by title / intercept
    a.href = '#';
    a.addEventListener('click', (e: any) => {
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch {
        /* ignore */
      }
    });
    host.appendChild(a);
  }
  return true;
}

/**
 * Patch native list-row comment count for one PR from known detail.
 * @returns {boolean} true when a control was updated
 */
function updateListRowCommentCount(doc: any, prNumber: any, count: any) {
  const n = Number(prNumber);
  const c = Number(count);
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(c) || c < 0) {
    return false;
  }
  const row = findListRowByNumber(doc, n);
  if (!row) return false;
  const el = findListRowCommentControl(row);
  if (!el) return false;

  // Never downgrade the native list badge to a smaller number (progressive
  // load-more can yield a partial comments[] that is not the full total).
  // Explicit 0 is also refused when a positive count is already painted.
  try {
    const aria = String(el.getAttribute?.('aria-label') || '');
    const m = aria.match(/(\d+)\s*comment/i);
    if (m) {
      const prev = Number(m[1]);
      if (Number.isFinite(prev) && prev > c) return false;
    } else {
      const spans = el.querySelectorAll?.('span');
      if (spans) {
        for (const span of spans) {
          if (span.querySelector?.('svg, .octicon, [class*="octicon"]')) continue;
          const t = String(span.textContent || '').trim();
          if (/^\d+$/.test(t)) {
            const prev = Number(t);
            if (Number.isFinite(prev) && prev > c) return false;
            break;
          }
        }
      }
    }
  } catch {
    /* ignore and proceed */
  }

  const label = c === 1 ? '1 comment' : `${c} comments`;
  try {
    const aria = el.getAttribute?.('aria-label');
    if (aria && /comment/i.test(aria)) {
      el.setAttribute('aria-label', label);
    }
  } catch {
    /* ignore */
  }

  // Prefer a dedicated numeric span (icon sibling)
  try {
    const spans = el.querySelectorAll?.('span');
    if (spans) {
      for (const span of spans) {
        if (span.querySelector?.('svg, .octicon, [class*="octicon"]')) continue;
        const t = String(span.textContent || '').trim();
        if (/^\d+$/.test(t)) {
          span.textContent = String(c);
          return true;
        }
      }
    }
  } catch {
    /* ignore */
  }

  // Text node next to the icon
  try {
    for (const node of el.childNodes || []) {
      if (node.nodeType !== 3) continue; // TEXT_NODE
      const t = String(node.textContent || '');
      if (/\d/.test(t)) {
        node.textContent = t.replace(/\d+/, String(c));
        return true;
      }
    }
  } catch {
    /* ignore */
  }

  return false;
}

/**
 * Re-render one list row from the open PR detail (labels, title, draft meta,
 * comment count). Prefer this over full list soft-reload — uses in-memory
 * truth from the shell the user just left.
 *
 * @param {Document} doc
 * @param {number} prNumber
 * @param {object} detail  flat PR detail / list-pr shape
 * @returns {boolean}
 */
function applyListRowFromDetail(doc: any, prNumber: any, detail: any) {
  if (!doc || !detail || typeof detail !== 'object') return false;
  const n = Number(prNumber || detail.number);
  if (!Number.isFinite(n) || n <= 0) return false;
  const row = findListRowByNumber(doc, n);
  if (!row) return false;

  let changed = false;

  // Title
  if (typeof detail.title === 'string' && detail.title.trim()) {
    const anchor = findListRowTitleAnchor(row);
    if (anchor) {
      const next = detail.title.trim();
      if (String(anchor.textContent || '').trim() !== next) {
        anchor.textContent = next;
        changed = true;
      }
    }
  }

  // Labels (native chips — not covered by applyRowMeta decorations).
  // Only when the key is present (explicit write-through). Missing key = leave
  // server HTML alone so a partial detail snapshot cannot wipe chips.
  if (Object.prototype.hasOwnProperty.call(detail, 'labels')) {
    if (applyListRowLabels(doc, row, detail.labels || [])) changed = true;
  }

  // Comment count when caller provides a complete total
  const commentCount = Number(
    detail.listCommentCount ?? detail._listCommentCount ?? detail.commentCount
  );
  if (Number.isFinite(commentCount) && commentCount >= 0) {
    if (updateListRowCommentCount(doc, n, commentCount)) changed = true;
  }

  // pr+ second-line meta: draft / branch / magic links
  const prShape = {
    number: n,
    title: detail.title,
    draft: Boolean(detail.draft),
    baseRef: detail.baseRef || detail.base?.ref || '',
    headRef: detail.headRef || detail.head?.ref || '',
    author:
      typeof detail.author === 'string'
        ? detail.author
        : detail.author?.login || detail.user?.login || '',
    labels: Array.isArray(detail.labels) ? detail.labels : [],
    magicLinks: detail.magicLinks,
  };
  if (applyRowMeta(doc, row, prShape)) changed = true;

  return changed;
}

function countMissingDecorations(doc: any, prs: any) {
  if (!Array.isArray(prs) || prs.length === 0) return 0;
  const byNumber = new Map(prs.map((pr) => [pr.number, pr]));
  let missing = 0;
  for (const row of findOriginalPrRows(doc)) {
    const num = getPrNumberFromRow(row);
    if (!byNumber.has(num)) continue;
    const meta = row.querySelector(`.${PR_TREE_META_CLASS}`);
    if (!meta || !meta.querySelector('.pr-tree-pr-number')) missing += 1;
  }
  return missing;
}

function createToggleButton(doc, { onShowTree, onShowOriginal, initialMode = 'tree' }) {
  let existing = doc.getElementById(PR_TREE_TOGGLE_ID);
  if (existing) existing.remove();

  const btn = doc.createElement('button');
  btn.id = PR_TREE_TOGGLE_ID;
  btn.type = 'button';
  btn.className = 'pr-tree-toggle btn btn-sm';

  let mode = initialMode;

  function updateLabel() {
    btn.textContent =
      mode === 'tree' ? 'Show default order' : 'Show stack tree';
    btn.setAttribute(
      'aria-label',
      mode === 'tree'
        ? 'Restore GitHub default pull request sort order'
        : 'Reorder and indent pull requests by branch stack depth'
    );
  }

  btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (mode === 'tree') {
      onShowOriginal();
      mode = 'original';
    } else {
      onShowTree();
      mode = 'tree';
    }
    updateLabel();
  });

  // External sync (prefs / onboarding) without firing click handlers
  // @ts-expect-error classic content-script dynamic shapes
  btn.setMode = (nextMode: any) => {
    mode = nextMode === 'original' ? 'original' : 'tree';
    updateLabel();
  };

  updateLabel();
  return btn;
}

function mountToggleNearHeader(doc: any, button: any) {
  const anchors = [
    doc.querySelector('.gh-header-actions'),
    doc.querySelector('[data-testid="pr-list-header"]'),
    doc.querySelector('.subnav-search'),
    doc.querySelector('main .subnav-search'),
    doc.querySelector('.table-list-header-toggle'),
    doc.querySelector('main h1')?.parentElement,
    doc.querySelector('[aria-label="Pull Requests"]')?.querySelector?.('header'),
  ];
  for (const anchor of anchors) {
    if (anchor) {
      anchor.appendChild(button);
      return anchor;
    }
  }
  doc.body.appendChild(button);
  return doc.body;
}

const domApi = {
  PR_TREE_TOGGLE_ID,
  PR_TREE_INDENT_CLASS,
  PR_TREE_ACTIVE_CLASS,
  PR_TREE_DECORATED_CLASS,
  PR_TREE_META_CLASS,
  PR_TREE_META_HOST_CLASS,
  PR_ROW_SELECTORS,
  parseRepoFromPathname,
  findPrListContainer,
  findPrListMount,
  findOriginalPrRows,
  selectPrimaryRowGroup,
  getPrNumberFromRow,
  collectPagePrNumbers,
  applyTreeIndents,
  clearTreeIndents,
  countUnstyledPrRows,
  findSecondColumnHost,
  applyRowMeta,
  applyListDecorations,
  clearListDecorations,
  findListRowByNumber,
  findListRowTitleAnchor,
  findListRowCommentControl,
  findListRowLabelsHost,
  applyListRowLabels,
  updateListRowCommentCount,
  applyListRowFromDetail,
  countMissingDecorations,
  refreshReviewBadges,
  createToggleButton,
  mountToggleNearHeader,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = domApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRTreeDOM = domApi;
}
