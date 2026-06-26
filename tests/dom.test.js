const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { buildPrTree, serializePrTree } = require('../src/tree.js');
const {
  renderPrTree,
  hideOriginalList,
  showOriginalList,
  createToggleButton,
  PR_TREE_ROOT_ID,
  PR_TREE_TOGGLE_ID,
} = require('../src/dom.js');

function pr(number, title, headRef, baseRef) {
  return { number, title, headRef, baseRef, author: 'octocat', draft: false, htmlUrl: `https://github.com/o/r/pull/${number}` };
}

const sampleHtml = `
<!DOCTYPE html>
<html><body>
  <main id="issues-index">
    <div class="gh-header-actions"></div>
    <div class="js-issue-row" id="issue_1">PR 1</div>
    <div class="js-issue-row" id="issue_2">PR 2</div>
    <div class="js-issue-row" id="issue_3">PR 3</div>
  </main>
</body></html>
`;

const dom = new JSDOM(sampleHtml, { url: 'https://github.com/octo/repo/pulls' });
const { window } = dom;
const { document } = window;

// Shim globals as content script would
globalThis.window = window;
globalThis.document = document;
globalThis.PRTree = require('../src/tree.js');
globalThis.PRTreeDOM = require('../src/dom.js');

const prs = [
  pr(100, 'Base feature', 'feat-a', 'main'),
  pr(101, 'Stack on a', 'feat-b', 'feat-a'),
  pr(102, 'Stack on b', 'feat-c', 'feat-b'),
  pr(200, 'Unrelated', 'other', 'main'),
];
const forest = buildPrTree(prs);

const container = document.getElementById('issues-index');
assert.ok(container, 'container exists');

const hiddenCount = hideOriginalList(document);
assert.equal(hiddenCount, 3, 'hid three original rows');

const treeRoot = renderPrTree(document, container, forest);
assert.ok(treeRoot, 'tree root returned');
assert.equal(treeRoot.id, PR_TREE_ROOT_ID);
assert.ok(treeRoot.children.length > 0, 'tree has rendered nodes');

const nodes = treeRoot.querySelectorAll('.pr-tree-node');
assert.equal(nodes.length, 4, 'four PR nodes rendered');

assert.equal(nodes[0].dataset.depth, '0');
assert.equal(nodes[1].dataset.depth, '1');
assert.equal(nodes[2].dataset.depth, '2');

const titles = Array.from(nodes).map((n) => n.querySelector('.pr-tree-title')?.textContent);
assert.deepEqual(titles, ['Base feature', 'Stack on a', 'Stack on b', 'Unrelated']);

// Toggle restores original
let treeMode = true;
const toggle = createToggleButton(document, {
  onShowTree: () => {
    hideOriginalList(document);
    renderPrTree(document, container, forest);
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
assert.equal(document.querySelectorAll('.pr-tree-hidden-original').length, 0);

toggle.click();
assert.equal(treeMode, true);
assert.ok(document.getElementById(PR_TREE_ROOT_ID));

// Serialize for evidence
const treeText = serializePrTree(forest);
assert.match(treeText, /#100/);
assert.match(treeText, /Stack on b/);

console.log('dom.test.js: all assertions passed');
console.log('--- serialized tree ---');
console.log(treeText);