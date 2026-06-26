const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { buildPrTree, serializePrTree } = require('../src/tree.js');
const {
  applyTreeIndents,
  clearTreeIndents,
  createToggleButton,
  findOriginalPrRows,
  getPrNumberFromRow,
  PR_TREE_INDENT_CLASS,
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

function runDomScenario(fixtureName, prs) {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', fixtureName), 'utf8');
  const dom = new JSDOM(html, { url: 'https://github.com/octo/repo/pulls' });
  const { document } = dom.window;

  globalThis.PRTree = require('../src/tree.js');

  const forest = buildPrTree(prs);
  const rows = findOriginalPrRows(document);
  assert.ok(rows.length > 0, `${fixtureName}: finds PR rows`);

  const applied = applyTreeIndents(document, forest);
  assert.equal(applied, rows.length, `${fixtureName}: indents all rows`);

  for (const row of rows) {
    assert.ok(row.classList.contains(PR_TREE_INDENT_CLASS), 'row keeps native element');
    assert.ok(row.querySelector('a'), 'native link preserved');
  }

  const parent = rows[0].parentElement;
  const childNums = [...parent.children].map((r) => getPrNumberFromRow(r));
  assert.deepEqual(childNums, prs.map((p) => p.number), `${fixtureName}: tree order`);

  const depthByNum = Object.fromEntries(
    rows.map((r) => [getPrNumberFromRow(r), r.dataset.prTreeDepth])
  );
  return { forest, fixtureName, rows: rows.length, depthByNum, parent, document };
}

const reactPrs = [
  pr(100, 'Base feature', 'feat-a', 'main'),
  pr(101, 'Stack on a', 'feat-b', 'feat-a'),
  pr(200, 'Unrelated', 'other', 'main'),
];
const legacyPrs = [
  pr(10, 'Root PR', 'feat-a', 'main'),
  pr(11, 'Stack 1', 'feat-b', 'feat-a'),
  pr(12, 'Stack 2', 'feat-c', 'feat-b'),
];

const react = runDomScenario('github-pulls-react.html', reactPrs);
const legacy = runDomScenario('github-pulls-legacy.html', legacyPrs);

assert.equal(react.depthByNum[100], '0');
assert.equal(react.depthByNum[101], '1');
assert.equal(react.depthByNum[200], '0');
assert.equal(legacy.depthByNum[11], '1');

// clear restores original order
{
  clearTreeIndents(react.document);
  const rows = findOriginalPrRows(react.document);
  assert.equal(rows[0].dataset.prTreeDepth, undefined);
  assert.ok(!rows[0].classList.contains(PR_TREE_INDENT_CLASS));
}

// Toggle
{
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'github-pulls-react.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://github.com/octo/repo/pulls' });
  const { document } = dom.window;
  globalThis.PRTree = require('../src/tree.js');

  const forest = buildPrTree([pr(100, 'Base', 'a', 'main'), pr(101, 'Child', 'b', 'a')]);
  applyTreeIndents(document, forest);

  let treeMode = true;
  const toggle = createToggleButton(document, {
    onShowTree: () => {
      applyTreeIndents(document, forest);
      treeMode = true;
    },
    onShowOriginal: () => {
      clearTreeIndents(document);
      treeMode = false;
    },
  });
  document.body.appendChild(toggle);
  assert.equal(toggle.id, PR_TREE_TOGGLE_ID);

  toggle.click();
  assert.equal(treeMode, false);
  toggle.click();
  assert.equal(treeMode, true);
}

const treeText = serializePrTree(buildPrTree(reactPrs));

console.log('dom.test.js: all assertions passed');
console.log(`react fixture rows: ${react.rows}, legacy fixture rows: ${legacy.rows}`);
console.log('--- serialized tree ---');
console.log(treeText);