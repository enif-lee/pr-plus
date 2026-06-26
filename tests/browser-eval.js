/**
 * Headless browser eval: load shipped scripts via window.eval (no require/module).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SCRATCH = '/var/folders/sl/km7nh7qj50b9mw4901n7ch940000gn/T/grok-goal-00241f759391/implementer';

const logs = [];

function loadFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function runBrowserEval(fixtureName) {
  const html = loadFixture(fixtureName);
  const dom = new JSDOM(html, {
    url: 'https://github.com/octo/repo/pulls',
    runScripts: 'outside-only',
  });
  const { window } = dom;

  assert.equal(typeof window.module, 'undefined', 'module must be absent');
  assert.equal(typeof window.require, 'undefined', 'require must be absent');

  const treeSrc = fs.readFileSync(path.join(ROOT, 'src/tree.js'), 'utf8');
  const domSrc = fs.readFileSync(path.join(ROOT, 'src/dom.js'), 'utf8');
  const fetchSrc = fs.readFileSync(path.join(ROOT, 'src/fetch-pulls.js'), 'utf8');
  const bootstrapSrc = fs.readFileSync(path.join(ROOT, 'src/content-bootstrap.js'), 'utf8');

  window.eval(treeSrc);
  window.eval(domSrc);
  window.eval(fetchSrc);
  window.eval(bootstrapSrc);

  assert.ok(window.PRTree?.buildPrTree, 'PRTree loaded via eval');
  assert.ok(window.PRTreeDOM?.renderPrTree, 'PRTreeDOM loaded via eval');
  assert.ok(window.PRTreeBootstrap?.createPrTreeApp, 'PRTreeBootstrap loaded via eval');

  const prs = [
    { number: 100, title: 'Base feature', headRef: 'feat-a', baseRef: 'main', author: 'octocat', draft: false, htmlUrl: 'https://github.com/octo/repo/pull/100' },
    { number: 101, title: 'Stack on a', headRef: 'feat-b', baseRef: 'feat-a', author: 'octocat', draft: false, htmlUrl: 'https://github.com/octo/repo/pull/101' },
    { number: 200, title: 'Unrelated', headRef: 'other', baseRef: 'main', author: 'octocat', draft: false, htmlUrl: 'https://github.com/octo/repo/pull/200' },
  ];

  const forest = window.PRTree.buildPrTree(prs);
  const { document } = window;

  const rowCount = window.PRTreeDOM.findOriginalPrRows(document).length;
  assert.ok(rowCount > 0, `${fixtureName}: found PR rows`);

  const hidden = window.PRTreeDOM.hideOriginalList(document);
  assert.equal(hidden, rowCount, `${fixtureName}: hid all rows`);

  const mount = window.PRTreeDOM.findPrListMount(document);
  assert.ok(mount?.parent, `${fixtureName}: list mount found`);

  const container = window.PRTreeDOM.findPrListContainer(document);
  const treeRoot = window.PRTreeDOM.renderPrTree(document, container, forest);

  assert.ok(treeRoot, `${fixtureName}: tree root created`);
  assert.equal(treeRoot.id, 'pr-tree-root');
  assert.ok(treeRoot.children.length > 0, `${fixtureName}: non-empty tree`);
  assert.equal(treeRoot.parentElement, mount.parent, `${fixtureName}: tree inserted in list region`);
  assert.equal(treeRoot.nextElementSibling, mount.insertBefore, `${fixtureName}: tree before first row`);

  const hiddenRows = document.querySelectorAll('.pr-tree-hidden-original');
  assert.equal(hiddenRows.length, rowCount, `${fixtureName}: originals hidden`);

  const serialized = window.PRTree.serializePrTree(forest);
  logs.push(`=== browser-eval: ${fixtureName} ===`);
  logs.push(`rows found: ${rowCount}`);
  logs.push(`tree nodes: ${treeRoot.querySelectorAll('.pr-tree-node').length}`);
  logs.push(`node globals absent: module=${typeof window.module}, require=${typeof window.require}`);
  logs.push('--- serialized tree ---');
  logs.push(serialized);
  logs.push('');

  return { forest, serialized, treeRoot, rowCount };
}

const reactResult = runBrowserEval('github-pulls-react.html');
const legacyResult = runBrowserEval('github-pulls-legacy.html');

assert.match(reactResult.serialized, /#101/);
assert.equal(legacyResult.rowCount, 3);

console.log(logs.join('\n'));
console.log('browser-eval.js: all assertions passed');

fs.mkdirSync(SCRATCH, { recursive: true });
fs.writeFileSync(path.join(SCRATCH, 'browser-eval.log'), logs.join('\n') + '\n');