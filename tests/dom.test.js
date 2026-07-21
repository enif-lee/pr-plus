const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { buildPrTree, flattenPrTree, serializePrTree } = require('../src/tree.js');
const {
  applyTreeIndents,
  clearTreeIndents,
  createToggleButton,
  findOriginalPrRows,
  getPrNumberFromRow,
  collectPagePrNumbers,
  selectPrimaryRowGroup,
  applyListDecorations,
  clearListDecorations,
  countMissingDecorations,
  PR_TREE_INDENT_CLASS,
  PR_TREE_META_CLASS,
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
  const expectedOrder = flattenPrTree(forest).map((e) => e.pr.number);
  assert.deepEqual(childNums, expectedOrder, `${fixtureName}: tree order`);

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

// collectPagePrNumbers + primary group ignores stray matches outside list
{
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'github-pulls-react.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://github.com/octo/repo/pulls' });
  const { document } = dom.window;
  const stray = document.createElement('div');
  stray.className = 'Box-row js-issue-row';
  stray.id = 'issue_999';
  stray.innerHTML = '<a class="js-navigation-open" href="/octo/repo/pull/999">Stray</a>';
  document.body.appendChild(stray);

  const nums = collectPagePrNumbers(document);
  assert.deepEqual(nums.sort((a, b) => a - b), [100, 101, 200]);

  const all = findOriginalPrRows(document);
  // primary group is the 3 list rows, not the stray body child
  assert.equal(all.length, 3);
  assert.ok(!all.includes(stray));
  assert.deepEqual(
    selectPrimaryRowGroup([...all, stray]).map((r) => r.id).sort(),
    ['issue_100', 'issue_101', 'issue_200']
  );
}

// List decorations: replace 2nd row with #num + badges + branches
{
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'github-pulls-react.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://github.com/octo/repo/pulls' });
  const { document } = dom.window;
  globalThis.PRTree = require('../src/tree.js');

  const prs = [
    {
      ...pr(100, 'Base feature ENG-9', 'feat-a', 'main'),
      magicLinks: [{ key: 'ENG-9', url: 'https://linear.app/x/issue/ENG-9' }],
    },
    { ...pr(101, 'Stack on a', 'feat-b', 'feat-a'), draft: true, magicLinks: [] },
    pr(200, 'Unrelated', 'other', 'main'),
  ];

  assert.equal(countMissingDecorations(document, prs), 3);
  const decorated = applyListDecorations(document, prs);
  assert.equal(decorated, 3);
  assert.equal(countMissingDecorations(document, prs), 0);

  const metas = document.querySelectorAll(`.${PR_TREE_META_CLASS}`);
  assert.equal(metas.length, 3);

  // Native second line hidden (kept for deferred review), our meta visible
  assert.ok(document.querySelector('#issue_100 .pr-tree-native-meta[hidden]'));
  assert.ok(document.querySelector('#issue_100 .opened-by'));

  const meta100 = document.querySelector('#issue_100 .pr-tree-row-meta');
  assert.equal(meta100.querySelector('.pr-tree-pr-number')?.textContent, '#100');
  assert.ok(meta100.querySelector('.pr-tree-opened'));
  assert.ok(meta100.querySelector('relative-time, .pr-tree-relative-time'));
  assert.ok(meta100.querySelector('.pr-tree-author'));
  assert.match(meta100.querySelector('.pr-tree-author').textContent, /octocat/);
  assert.ok(meta100.querySelector('.pr-tree-badge-review-required'));
  // Single muted branch chip
  const branch = meta100.querySelector('.pr-tree-badge-branch');
  assert.ok(branch);
  assert.match(branch.textContent, /main\s*←\s*feat-a/);
  assert.equal(meta100.querySelectorAll('.pr-tree-branch-base, .pr-tree-branches').length, 0);

  // Magic / autolink
  const magic = meta100.querySelector('a.pr-tree-badge-magic');
  assert.ok(magic);
  assert.equal(magic.textContent, 'ENG-9');
  assert.equal(magic.getAttribute('href'), 'https://linear.app/x/issue/ENG-9');
  assert.equal(magic.getAttribute('target'), '_blank');

  const draftMeta = document.querySelector('#issue_101 .pr-tree-row-meta');
  assert.ok(draftMeta.querySelector('.pr-tree-badge-draft'));
  assert.ok(draftMeta.querySelector('.pr-tree-badge-review-required'));

  const meta200 = document.querySelector('#issue_200 .pr-tree-row-meta');
  assert.ok(meta200.querySelector('.pr-tree-badge-changes-requested'));

  // Restore native second row
  clearListDecorations(document);
  assert.equal(document.querySelectorAll(`.${PR_TREE_META_CLASS}`).length, 0);
  assert.equal(document.querySelectorAll('.pr-tree-native-meta').length, 0);
  assert.ok(document.querySelector('#issue_100 .opened-by'));
  assert.match(document.querySelector('#issue_100 .opened-by').textContent, /#100/);
}

const treeText = serializePrTree(buildPrTree(reactPrs));

console.log('dom.test.js: all assertions passed');
console.log(`react fixture rows: ${react.rows}, legacy fixture rows: ${legacy.rows}`);
console.log('--- serialized tree ---');
console.log(treeText);