const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { buildPrTree, serializePrTree } = require('../src/tree.js');
const {
  renderPrTree,
  hideOriginalList,
  showOriginalList,
  createToggleButton,
  findPrListMount,
  findOriginalPrRows,
  PR_TREE_ROOT_ID,
  PR_TREE_TOGGLE_ID,
} = require('../src/dom.js');

function pr(number, title, headRef, baseRef) {
  return {
    number,
    title,
    headRef,
    baseRef,
    author: 'octocat',
    draft: false,
    htmlUrl: `https://github.com/octo/repo/pull/${number}`,
  };
}

function runDomScenario(fixtureName) {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', fixtureName), 'utf8');
  const dom = new JSDOM(html, { url: 'https://github.com/octo/repo/pulls' });
  const { document } = dom.window;

  globalThis.PRTree = require('../src/tree.js');

  const prs = [
    pr(100, 'Base feature', 'feat-a', 'main'),
    pr(101, 'Stack on a', 'feat-b', 'feat-a'),
    pr(102, 'Stack on b', 'feat-c', 'feat-b'),
    pr(200, 'Unrelated', 'other', 'main'),
  ];
  const forest = buildPrTree(prs);

  const rows = findOriginalPrRows(document);
  assert.ok(rows.length > 0, `${fixtureName}: finds PR rows`);

  const mount = findPrListMount(document);
  assert.ok(mount?.parent, `${fixtureName}: list mount resolved`);

  const hiddenCount = hideOriginalList(document);
  assert.equal(hiddenCount, rows.length, `${fixtureName}: hides all rows`);

  const treeRoot = renderPrTree(document, mount.parent, forest);
  assert.ok(treeRoot);
  assert.equal(treeRoot.id, PR_TREE_ROOT_ID);
  assert.equal(treeRoot.parentElement, mount.parent);
  assert.equal(treeRoot.nextElementSibling, mount.insertBefore);

  const nodes = treeRoot.querySelectorAll('.pr-tree-node');
  assert.equal(nodes.length, 4);

  return { forest, fixtureName, rows: rows.length };
}

const react = runDomScenario('github-pulls-react.html');
const legacy = runDomScenario('github-pulls-legacy.html');

assert.equal(legacy.rows, 3);
assert.equal(react.rows, 3);

// Toggle on react fixture
{
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'github-pulls-react.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://github.com/octo/repo/pulls' });
  const { document } = dom.window;
  globalThis.PRTree = require('../src/tree.js');

  const forest = buildPrTree([pr(100, 'Base', 'a', 'main')]);
  const mount = findPrListMount(document);
  hideOriginalList(document);
  renderPrTree(document, mount.parent, forest);

  let treeMode = true;
  const toggle = createToggleButton(document, {
    onShowTree: () => {
      hideOriginalList(document);
      renderPrTree(document, mount.parent, forest);
      treeMode = true;
    },
    onShowOriginal: () => {
      showOriginalList(document);
      treeMode = false;
    },
  });
  document.body.appendChild(toggle);
  assert.equal(toggle.id, PR_TREE_TOGGLE_ID);

  toggle.click();
  assert.equal(treeMode, false);
  assert.equal(document.getElementById(PR_TREE_ROOT_ID), null);

  toggle.click();
  assert.equal(treeMode, true);
  assert.ok(document.getElementById(PR_TREE_ROOT_ID));
}

const treeText = serializePrTree(buildPrTree([
  pr(100, 'Base feature', 'feat-a', 'main'),
  pr(101, 'Stack on a', 'feat-b', 'feat-a'),
  pr(102, 'Stack on b', 'feat-c', 'feat-b'),
  pr(200, 'Unrelated', 'other', 'main'),
]));

console.log('dom.test.js: all assertions passed');
console.log(`react fixture rows: ${react.rows}, legacy fixture rows: ${legacy.rows}`);
console.log('--- serialized tree ---');
console.log(treeText);