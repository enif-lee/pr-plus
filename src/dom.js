/**
 * AUTO-GENERATED from src/dom.ts
 * SOURCE OF TRUTH: src/dom.ts — do not edit this .js
 * Rebuild: node scripts/build-content-ts.mjs
 */
const PR_TREE_TOGGLE_ID = "pr-tree-toggle";
const PR_TREE_INDENT_CLASS = "pr-tree-indented";
const PR_TREE_ACTIVE_CLASS = "pr-tree-active";
const PR_TREE_DECORATED_CLASS = "pr-tree-decorated";
const PR_TREE_META_CLASS = "pr-tree-row-meta";
const PR_TREE_META_HOST_CLASS = "pr-tree-meta-host";
const PR_ROW_SELECTORS = [
  ".js-navigation-container .js-issue-row",
  ".js-issue-row:has(.octicon-git-pull-request)",
  ".js-issue-row:has(.octicon-git-pull-request-draft)",
  'li[role="listitem"]:has(a[data-hovercard-url*="/pull"])',
  'li[role="listitem"]:has(h3 a[href*="/pull/"])',
  'li[role="listitem"]:has(a[href*="/pull/"])',
  '#js-issues-results [id^="issue_"]',
  '[data-testid="issue-pr-row"]',
  'div[id^="issue_"]'
];
function parseRepoFromPathname(pathname) {
  const match = pathname.match(/^\/([^/]+)\/([^/]+)\/pulls(?:\/|$)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}
function queryAllPrRows(doc) {
  const seen = /* @__PURE__ */ new Set();
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
function selectPrimaryRowGroup(rows) {
  if (rows.length === 0) return [];
  const byParent = /* @__PURE__ */ new Map();
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
function findOriginalPrRows(doc) {
  return selectPrimaryRowGroup(queryAllPrRows(doc));
}
function getPrNumberFromRow(row) {
  if (!row) return Number.NaN;
  const idMatch = row.id?.match(/(?:issue_|pull_|PR_)(\d+)/i);
  if (idMatch) return Number.parseInt(idMatch[1], 10);
  const dataNum = row.getAttribute?.("data-pull-request-number") || row.getAttribute?.("data-issue-number") || row.dataset?.pullRequestNumber || row.dataset?.issueNumber;
  if (dataNum && /^\d+$/.test(dataNum)) {
    return Number.parseInt(dataNum, 10);
  }
  const links = row.querySelectorAll?.(
    'a[href*="/pull/"], a.js-navigation-open, a[id$="_link"], h3 a'
  );
  if (links) {
    for (const link of links) {
      const href = link.getAttribute("href") || link.href || "";
      const m = href.match(/\/pull\/(\d+)(?:\/|$|\?|#)/);
      if (m) return Number.parseInt(m[1], 10);
    }
  }
  const textId = row.querySelector?.('[id*="issue_"], [id*="pull_"]')?.id;
  const nestedId = textId?.match(/(\d+)/)?.[1];
  if (nestedId) return Number.parseInt(nestedId, 10);
  return Number.NaN;
}
function collectPagePrNumbers(doc) {
  const numbers = [];
  const seen = /* @__PURE__ */ new Set();
  for (const row of findOriginalPrRows(doc)) {
    const num = getPrNumberFromRow(row);
    if (!Number.isFinite(num) || seen.has(num)) continue;
    seen.add(num);
    numbers.push(num);
  }
  return numbers;
}
function findPrListMount(doc) {
  const rows = findOriginalPrRows(doc);
  if (rows.length === 0) return null;
  const firstRow = rows[0];
  const parent = firstRow.parentElement;
  if (!parent) return null;
  return { parent, insertBefore: firstRow, rowCount: rows.length };
}
function findPrListContainer(doc) {
  const mount = findPrListMount(doc);
  if (mount) return mount.parent;
  return doc.querySelector("#js-issues-results") || doc.querySelector('[aria-label="Pull Requests"]') || doc.querySelector('[aria-label="Issues"]') || doc.querySelector(".js-navigation-container") || doc.querySelector("main");
}
function buildDepthAndOrderMaps(forest) {
  const treeApi = globalThis.PRTree;
  const flat = treeApi.flattenPrTree(forest);
  const depthByNumber = /* @__PURE__ */ new Map();
  const order = [];
  for (const { pr, depth } of flat) {
    depthByNumber.set(pr.number, depth);
    order.push(pr.number);
  }
  return { depthByNumber, order };
}
function applyTreeIndents(doc, forest) {
  const rows = findOriginalPrRows(doc);
  if (rows.length === 0) return 0;
  const parent = rows[0].parentElement;
  if (!parent) return 0;
  const { depthByNumber, order } = buildDepthAndOrderMaps(forest);
  const rowByNumber = /* @__PURE__ */ new Map();
  for (const [index, row] of rows.entries()) {
    if (row.dataset.prTreeOriginalIndex === void 0) {
      row.dataset.prTreeOriginalIndex = String(index);
    }
    const num = getPrNumberFromRow(row);
    if (Number.isFinite(num)) rowByNumber.set(num, row);
  }
  const orderedRows = [];
  const used = /* @__PURE__ */ new Set();
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
  for (const row of orderedRows) {
    parent.appendChild(row);
  }
  let applied = 0;
  for (const row of orderedRows) {
    const num = getPrNumberFromRow(row);
    const depth = Number.isFinite(num) ? depthByNumber.get(num) ?? 0 : 0;
    row.classList.add(PR_TREE_INDENT_CLASS, PR_TREE_ACTIVE_CLASS);
    row.dataset.prTreeDepth = String(depth);
    row.style.setProperty("--pr-tree-depth", String(depth));
    applied += 1;
  }
  return applied;
}
function clearTreeIndents(doc) {
  const rows = [...doc.querySelectorAll(`.${PR_TREE_INDENT_CLASS}`)];
  const parent = rows[0]?.parentElement;
  if (parent && rows.length > 0) {
    const sorted = [...rows].sort(
      (a, b) => Number(a.dataset.prTreeOriginalIndex ?? 0) - Number(b.dataset.prTreeOriginalIndex ?? 0)
    );
    for (const row of sorted) {
      parent.appendChild(row);
    }
  }
  for (const row of rows) {
    row.classList.remove(PR_TREE_INDENT_CLASS, PR_TREE_ACTIVE_CLASS);
    row.style.removeProperty("--pr-tree-depth");
    delete row.dataset.prTreeDepth;
  }
  return rows.length;
}
function countUnstyledPrRows(doc) {
  const rows = findOriginalPrRows(doc);
  if (rows.length === 0) return 0;
  return rows.filter((row) => !row.classList.contains(PR_TREE_INDENT_CLASS)).length;
}
const PR_TREE_REVIEW_STATE = "prTreeReviewState";
const PR_TREE_NATIVE_META_CLASS = "pr-tree-native-meta";
function findSecondColumnHost(row) {
  if (!row) return null;
  const title = row.querySelector("a.js-navigation-open") || row.querySelector('a[id$="_link"]') || row.querySelector('h3 a[href*="/pull/"]') || row.querySelector('a[href*="/pull/"]');
  if (title?.parentElement) {
    const col = title.closest('.flex-auto, [class*="Title"]') || title.parentElement;
    return col;
  }
  const direct = [...row.children || []];
  if (direct.length >= 2) return direct[1];
  const nested = row.firstElementChild ? [...row.firstElementChild.children] : [];
  if (nested.length >= 2) return nested[1];
  return row;
}
function findNativeSecondRow(row) {
  if (!row) return null;
  const marked = row.querySelector(`.${PR_TREE_NATIVE_META_CLASS}`);
  if (marked) return marked;
  const openedBy = row.querySelector(".opened-by");
  if (openedBy) {
    return openedBy.closest("div.d-flex.mt-1") || openedBy.closest("div.d-flex") || openedBy.parentElement;
  }
  const col = findSecondColumnHost(row);
  if (!col) return null;
  for (const el of col.querySelectorAll(".text-small.color-fg-muted, .mt-1.text-small, div.d-flex.mt-1")) {
    if (el.classList.contains(PR_TREE_META_CLASS)) continue;
    if (el.querySelector(".opened-by") || /#\d+/.test(el.textContent || "")) return el;
  }
  return null;
}
function detectReviewState(text) {
  if (!text) return null;
  if (/changes\s+requested/i.test(text)) return "changes_requested";
  if (/review\s+required/i.test(text)) return "review_required";
  if (/\bapproved\b/i.test(text)) return "approved";
  return null;
}
function truncateBranchName(name, max = 24) {
  if (!name || typeof name !== "string") return "";
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}\u2026`;
}
function buildBranchBadge(doc, pr) {
  const badge = doc.createElement("span");
  badge.className = "pr-tree-badge pr-tree-badge-branch";
  const label = `${truncateBranchName(pr.baseRef)} \u2190 ${truncateBranchName(pr.headRef)}`;
  badge.textContent = label;
  badge.title = `${pr.baseRef} \u2190 ${pr.headRef}`;
  badge.setAttribute("aria-label", `base ${pr.baseRef}, head ${pr.headRef}`);
  return badge;
}
function buildDraftBadge(doc) {
  const badge = doc.createElement("span");
  badge.className = "pr-tree-badge pr-tree-badge-draft";
  badge.textContent = "Draft";
  return badge;
}
function buildReviewBadge(doc, label, kind) {
  const badge = doc.createElement("span");
  badge.className = `pr-tree-badge pr-tree-badge-${kind}`;
  badge.textContent = label;
  return badge;
}
function buildPrNumberEl(doc, pr) {
  const el = doc.createElement("span");
  el.className = "pr-tree-pr-number";
  el.textContent = `#${pr.number}`;
  return el;
}
function appendReviewBadge(doc, parent, reviewState) {
  if (reviewState === "review_required") {
    parent.appendChild(buildReviewBadge(doc, "Review required", "review-required"));
  } else if (reviewState === "changes_requested") {
    parent.appendChild(buildReviewBadge(doc, "Changes requested", "changes-requested"));
  } else if (reviewState === "approved") {
    parent.appendChild(buildReviewBadge(doc, "Approved", "approved"));
  }
}
function extractNativeMetaBits(nativeSecond, pr) {
  const relativeTime = nativeSecond?.querySelector?.("relative-time");
  const authorLink = nativeSecond?.querySelector?.('.opened-by a[data-hovercard-type="user"]') || nativeSecond?.querySelector?.(".opened-by a.Link--muted") || nativeSecond?.querySelector?.('.opened-by a[href*="author"]') || nativeSecond?.querySelector?.(".opened-by a");
  return {
    relativeTime: relativeTime ? relativeTime.cloneNode(true) : null,
    authorLink: authorLink ? authorLink.cloneNode(true) : null,
    authorLogin: authorLink?.textContent?.trim() || (typeof pr?.author === "string" && pr.author ? pr.author : null)
  };
}
function buildOpenedMeta(doc, pr, bits) {
  const wrap = doc.createElement("span");
  wrap.className = "pr-tree-opened";
  const hasTime = Boolean(bits.relativeTime);
  const hasAuthor = Boolean(bits.authorLink || bits.authorLogin);
  if (!hasTime && !hasAuthor) return null;
  if (hasTime) {
    wrap.appendChild(doc.createTextNode("opened "));
    const time = bits.relativeTime;
    time.classList.add("pr-tree-relative-time");
    wrap.appendChild(time);
  }
  if (hasAuthor) {
    wrap.appendChild(doc.createTextNode(hasTime ? " by " : "by "));
    if (bits.authorLink) {
      const a = bits.authorLink;
      a.classList.add("pr-tree-author");
      wrap.appendChild(a);
    } else {
      const span = doc.createElement("span");
      span.className = "pr-tree-author";
      span.textContent = bits.authorLogin;
      wrap.appendChild(span);
    }
  }
  return wrap;
}
function resolveReviewState(row, nativeSecond, meta) {
  const fromMeta = meta?.dataset?.[PR_TREE_REVIEW_STATE];
  if (fromMeta) return fromMeta;
  const fromNative = detectReviewState(nativeSecond?.textContent || "");
  if (fromNative) return fromNative;
  return detectReviewState(row?.textContent || "") || "";
}
function buildMagicLinkEl(doc, link) {
  const a = doc.createElement("a");
  a.className = "pr-tree-badge pr-tree-badge-magic";
  a.href = link.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = link.key;
  a.title = `Open ${link.key}`;
  a.setAttribute("aria-label", `Magic link ${link.key}`);
  a.addEventListener("click", (e) => e.stopPropagation());
  return a;
}
function appendMagicLinks(doc, parent, pr) {
  const links = Array.isArray(pr?.magicLinks) ? pr.magicLinks : [];
  for (const link of links) {
    if (!link?.url || !link?.key) continue;
    parent.appendChild(buildMagicLinkEl(doc, link));
  }
}
function fillMetaContent(doc, meta, pr, reviewState, nativeSecond) {
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
function applyRowMeta(doc, row, pr) {
  if (!row || !pr) return false;
  const host = findSecondColumnHost(row);
  if (!host) return false;
  let nativeSecond = findNativeSecondRow(row);
  if (nativeSecond && !nativeSecond.classList.contains(PR_TREE_META_CLASS)) {
    nativeSecond.classList.add(PR_TREE_NATIVE_META_CLASS);
    nativeSecond.setAttribute("hidden", "");
    nativeSecond.setAttribute("aria-hidden", "true");
  }
  let meta = host.querySelector(`:scope > .${PR_TREE_META_CLASS}`);
  if (!meta) {
    meta = doc.createElement("div");
    meta.className = `d-flex mt-1 text-small color-fg-muted ${PR_TREE_META_CLASS} pr-tree-second-row`;
    if (nativeSecond && nativeSecond.parentElement === host) {
      nativeSecond.insertAdjacentElement("afterend", meta);
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
function refreshReviewBadges(doc, prs) {
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
    const next = detectReviewState(nativeSecond?.textContent || "") || detectReviewState(row.textContent || "") || "";
    const prev = meta.dataset[PR_TREE_REVIEW_STATE] || "";
    const hasAuthor = Boolean(meta.querySelector(".pr-tree-author"));
    const hasTime = Boolean(meta.querySelector(".pr-tree-relative-time, relative-time"));
    const nativeHasAuthor = Boolean(
      nativeSecond?.querySelector?.(".opened-by a")
    );
    const nativeHasTime = Boolean(nativeSecond?.querySelector?.("relative-time"));
    const needsAuthorTime = nativeHasAuthor && !hasAuthor || nativeHasTime && !hasTime;
    if (next && next === prev && !needsAuthorTime) continue;
    if (!next && !needsAuthorTime && prev) {
    }
    if (next) meta.dataset[PR_TREE_REVIEW_STATE] = next;
    fillMetaContent(doc, meta, pr, next || prev, nativeSecond);
    updated += 1;
  }
  return updated;
}
function applyListDecorations(doc, prs) {
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
  refreshReviewBadges(doc, prs);
  return applied;
}
function clearListDecorations(doc) {
  for (const meta of doc.querySelectorAll(`.${PR_TREE_META_CLASS}`)) {
    meta.remove();
  }
  for (const el of doc.querySelectorAll(`.${PR_TREE_NATIVE_META_CLASS}`)) {
    el.classList.remove(PR_TREE_NATIVE_META_CLASS);
    el.removeAttribute("hidden");
    el.removeAttribute("aria-hidden");
  }
  for (const el of doc.querySelectorAll(`.${PR_TREE_META_HOST_CLASS}`)) {
    el.classList.remove(PR_TREE_META_HOST_CLASS);
  }
  for (const el of doc.querySelectorAll(`.${PR_TREE_DECORATED_CLASS}`)) {
    el.classList.remove(PR_TREE_DECORATED_CLASS);
  }
}
function countMissingDecorations(doc, prs) {
  if (!Array.isArray(prs) || prs.length === 0) return 0;
  const byNumber = new Map(prs.map((pr) => [pr.number, pr]));
  let missing = 0;
  for (const row of findOriginalPrRows(doc)) {
    const num = getPrNumberFromRow(row);
    if (!byNumber.has(num)) continue;
    const meta = row.querySelector(`.${PR_TREE_META_CLASS}`);
    if (!meta || !meta.querySelector(".pr-tree-pr-number")) missing += 1;
  }
  return missing;
}
function createToggleButton(doc, { onShowTree, onShowOriginal, initialMode = "tree" }) {
  let existing = doc.getElementById(PR_TREE_TOGGLE_ID);
  if (existing) existing.remove();
  const btn = doc.createElement("button");
  btn.id = PR_TREE_TOGGLE_ID;
  btn.type = "button";
  btn.className = "pr-tree-toggle btn btn-sm";
  let mode = initialMode;
  function updateLabel() {
    btn.textContent = mode === "tree" ? "Show default order" : "Show stack tree";
    btn.setAttribute(
      "aria-label",
      mode === "tree" ? "Restore GitHub default pull request sort order" : "Reorder and indent pull requests by branch stack depth"
    );
  }
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (mode === "tree") {
      onShowOriginal();
      mode = "original";
    } else {
      onShowTree();
      mode = "tree";
    }
    updateLabel();
  });
  updateLabel();
  return btn;
}
function mountToggleNearHeader(doc, button) {
  const anchors = [
    doc.querySelector(".gh-header-actions"),
    doc.querySelector('[data-testid="pr-list-header"]'),
    doc.querySelector(".subnav-search"),
    doc.querySelector("main .subnav-search"),
    doc.querySelector(".table-list-header-toggle"),
    doc.querySelector("main h1")?.parentElement,
    doc.querySelector('[aria-label="Pull Requests"]')?.querySelector?.("header")
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
  countMissingDecorations,
  refreshReviewBadges,
  createToggleButton,
  mountToggleNearHeader
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = domApi;
}
if (typeof globalThis !== "undefined") {
  globalThis.PRTreeDOM = domApi;
}
