/**
 * Headless browser eval: load shipped scripts via window.eval (no require/module).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SCRATCH =
  process.env.PRP_SCRATCH || '/var/folders/px/qw6l220x5glb_gxf44lws9p80000gn/T/grok-goal-5a6d37e1751e/implementer';
fs.mkdirSync(SCRATCH, { recursive: true });

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
  assert.ok(window.PRTreeDOM?.applyTreeIndents, 'PRTreeDOM loaded via eval');
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

  const applied = window.PRTreeDOM.applyTreeIndents(document, forest);
  assert.equal(applied, rowCount, `${fixtureName}: indents all rows`);

  const indented = document.querySelectorAll('.pr-tree-indented');
  assert.equal(indented.length, rowCount, `${fixtureName}: native rows still visible`);
  assert.equal(document.getElementById('pr-tree-root'), null, `${fixtureName}: no custom list`);

  const serialized = window.PRTree.serializePrTree(forest);
  logs.push(`=== browser-eval: ${fixtureName} ===`);
  logs.push(`rows found: ${rowCount}`);
  logs.push(`indented rows: ${indented.length}`);
  logs.push(`node globals absent: module=${typeof window.module}, require=${typeof window.require}`);
  logs.push('--- serialized tree ---');
  logs.push(serialized);
  logs.push('');

  return { forest, serialized, rowCount };
}

const reactResult = runBrowserEval('github-pulls-react.html');
const legacyResult = runBrowserEval('github-pulls-legacy.html');

assert.match(reactResult.serialized, /#101/);
assert.equal(legacyResult.rowCount, 3);

console.log(logs.join('\n'));
console.log('browser-eval.js: all assertions passed');

fs.mkdirSync(SCRATCH, { recursive: true });
fs.writeFileSync(path.join(SCRATCH, 'browser-eval.log'), logs.join('\n') + '\n');