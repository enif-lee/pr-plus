/**
 * DOM manipulation for GitHub PR list tree view.
 * Selectors aligned with refined-github (legacy .js-issue-row + React li[role=listitem]).
 */

const PR_TREE_ROOT_ID = 'pr-tree-root';
const PR_TREE_TOGGLE_ID = 'pr-tree-toggle';
const PR_TREE_HIDDEN_CLASS = 'pr-tree-hidden-original';

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

function hideOriginalList(doc) {
  const rows = findOriginalPrRows(doc);
  for (const row of rows) {
    row.classList.add(PR_TREE_HIDDEN_CLASS);
    row.dataset.prTreeHidden = 'true';
  }
  return rows.length;
}

function showOriginalList(doc) {
  const rows = doc.querySelectorAll(`.${PR_TREE_HIDDEN_CLASS}`);
  for (const row of rows) {
    row.classList.remove(PR_TREE_HIDDEN_CLASS);
    delete row.dataset.prTreeHidden;
  }
  const treeRoot = doc.getElementById(PR_TREE_ROOT_ID);
  if (treeRoot) treeRoot.remove();
}

function removeTreeView(doc) {
  const treeRoot = doc.getElementById(PR_TREE_ROOT_ID);
  if (treeRoot) treeRoot.remove();
}

function createTreeNodeElement(doc, { pr, depth }) {
  const item = doc.createElement('div');
  item.className = 'pr-tree-node';
  item.style.setProperty('--pr-tree-depth', String(depth));
  item.dataset.prNumber = String(pr.number);
  item.dataset.depth = String(depth);

  const connector = doc.createElement('span');
  connector.className = 'pr-tree-connector';
  connector.textContent = depth > 0 ? '└ ' : '';
  item.appendChild(connector);

  const numberLink = doc.createElement('a');
  numberLink.className = 'pr-tree-number';
  numberLink.href = pr.htmlUrl || `#${pr.number}`;
  numberLink.textContent = `#${pr.number}`;
  item.appendChild(numberLink);

  const titleLink = doc.createElement('a');
  titleLink.className = 'pr-tree-title';
  titleLink.href = pr.htmlUrl || `#${pr.number}`;
  titleLink.textContent = pr.title;
  item.appendChild(titleLink);

  const meta = doc.createElement('span');
  meta.className = 'pr-tree-meta';
  const branch = doc.createElement('span');
  branch.className = 'pr-tree-branch';
  branch.textContent = `${pr.headRef} ← ${pr.baseRef}`;
  meta.appendChild(branch);

  if (pr.author) {
    const author = doc.createElement('span');
    author.className = 'pr-tree-author';
    author.textContent = pr.author;
    meta.appendChild(author);
  }

  if (pr.draft) {
    const draft = doc.createElement('span');
    draft.className = 'pr-tree-draft';
    draft.textContent = 'Draft';
    meta.appendChild(draft);
  }

  item.appendChild(meta);
  return item;
}

function renderPrTree(doc, container, forest) {
  removeTreeView(doc);

  const root = doc.createElement('div');
  root.id = PR_TREE_ROOT_ID;
  root.className = 'pr-tree-container';
  root.setAttribute('role', 'tree');
  root.setAttribute('aria-label', 'Pull request stack tree');

  const flat = globalThis.PRTree.flattenPrTree(forest);
  for (const entry of flat) {
    root.appendChild(createTreeNodeElement(doc, entry));
  }

  const mount = findPrListMount(doc);
  if (mount?.parent) {
    mount.parent.insertBefore(root, mount.insertBefore);
  } else if (container) {
    container.appendChild(root);
  } else {
    doc.body.appendChild(root);
  }

  return root;
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
      mode === 'tree' ? 'Show default list' : 'Show PR tree';
    btn.setAttribute(
      'aria-label',
      mode === 'tree'
        ? 'Restore GitHub default pull request list'
        : 'Show pull requests as branch stack tree'
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
  PR_TREE_ROOT_ID,
  PR_TREE_TOGGLE_ID,
  PR_TREE_HIDDEN_CLASS,
  PR_ROW_SELECTORS,
  parseRepoFromPathname,
  findPrListContainer,
  findPrListMount,
  findOriginalPrRows,
  hideOriginalList,
  showOriginalList,
  removeTreeView,
  createTreeNodeElement,
  renderPrTree,
  createToggleButton,
  mountToggleNearHeader,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = domApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRTreeDOM = domApi;
}