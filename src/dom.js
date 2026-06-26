/**
 * DOM manipulation for GitHub PR list tree view.
 * Keeps native list rows; applies stack depth via left indent and reordering.
 */

const PR_TREE_TOGGLE_ID = 'pr-tree-toggle';
const PR_TREE_INDENT_CLASS = 'pr-tree-indented';
const PR_TREE_ACTIVE_CLASS = 'pr-tree-active';

const PR_ROW_SELECTORS = [
  '.js-navigation-container .js-issue-row',
  '.js-issue-row:has(.octicon-git-pull-request)',
  '.js-issue-row:has(.octicon-git-pull-request-draft)',
  'li[role="listitem"]:has(a[data-hovercard-url*="/pull"])',
  'li[role="listitem"]:has(h3 a[href*="/pull/"])',
  '#js-issues-results [id^="issue_"]',
];

function parseRepoFromPathname(pathname) {
  const match = pathname.match(/^\/([^/]+)\/([^/]+)\/pulls/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function queryAllPrRows(doc) {
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

function findOriginalPrRows(doc) {
  return queryAllPrRows(doc);
}

function getPrNumberFromRow(row) {
  const link = row.querySelector(
    'a.js-navigation-open, a[id$="_link"], h3 a[href*="/pull/"]'
  );
  const href = link?.getAttribute('href') || link?.href || '';
  const fromHref = href.match(/\/pull\/(\d+)/)?.[1];
  const fromId = row.id?.match(/issue_(\d+)/)?.[1];
  return Number.parseInt(fromHref || fromId, 10);
}

function findPrListMount(doc) {
  const rows = queryAllPrRows(doc);
  if (rows.length === 0) return null;
  const firstRow = rows[0];
  const parent = firstRow.parentElement;
  if (!parent) return null;
  return { parent, insertBefore: firstRow, rowCount: rows.length };
}

function findPrListContainer(doc) {
  const mount = findPrListMount(doc);
  if (mount) return mount.parent;

  return (
    doc.querySelector('#js-issues-results') ||
    doc.querySelector('.js-navigation-container') ||
    doc.querySelector('main')
  );
}

function buildDepthAndOrderMaps(forest) {
  const flat = globalThis.PRTree.flattenPrTree(forest);
  const depthByNumber = new Map();
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
  const rowByNumber = new Map();

  for (const [index, row] of rows.entries()) {
    if (row.dataset.prTreeOriginalIndex === undefined) {
      row.dataset.prTreeOriginalIndex = String(index);
    }
    const num = getPrNumberFromRow(row);
    if (Number.isFinite(num)) rowByNumber.set(num, row);
  }

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

  for (const row of orderedRows) {
    parent.appendChild(row);
  }

  let applied = 0;
  for (const row of orderedRows) {
    const num = getPrNumberFromRow(row);
    const depth = depthByNumber.get(num) ?? 0;
    row.classList.add(PR_TREE_INDENT_CLASS, PR_TREE_ACTIVE_CLASS);
    row.dataset.prTreeDepth = String(depth);
    row.style.setProperty('--pr-tree-depth', String(depth));
    applied += 1;
  }

  return applied;
}

function clearTreeIndents(doc) {
  const rows = [...doc.querySelectorAll(`.${PR_TREE_INDENT_CLASS}`)];
  const parent = rows[0]?.parentElement;

  if (parent && rows.length > 0) {
    const sorted = [...rows].sort(
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

  btn.addEventListener('click', () => {
    if (mode === 'tree') {
      onShowOriginal();
      mode = 'original';
    } else {
      onShowTree();
      mode = 'tree';
    }
    updateLabel();
  });

  updateLabel();
  return btn;
}

function mountToggleNearHeader(doc, button) {
  const anchors = [
    doc.querySelector('.gh-header-actions'),
    doc.querySelector('.subnav-search'),
    doc.querySelector('main .subnav-search'),
    doc.querySelector('main h1')?.parentElement,
    doc.querySelector('.table-list-header-toggle'),
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
  PR_ROW_SELECTORS,
  parseRepoFromPathname,
  findPrListContainer,
  findPrListMount,
  findOriginalPrRows,
  getPrNumberFromRow,
  applyTreeIndents,
  clearTreeIndents,
  createToggleButton,
  mountToggleNearHeader,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = domApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRTreeDOM = domApi;
}