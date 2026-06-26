const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { buildPrTree } = require('../src/tree.js');
const domApi = require('../src/dom.js');
const {
  createPrTreeApp,
  fetchOpenPulls,
  mapApiPullRequest,
} = require('../src/content-bootstrap.js');

async function main() {
const fixtureHtml = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'github-pulls-react.html'),
  'utf8'
);

const apiPayload = [
  {
    number: 100,
    title: 'Base feature',
    head: { ref: 'feat-a' },
    base: { ref: 'main' },
    user: { login: 'octocat' },
    draft: false,
    html_url: 'https://github.com/octo/repo/pull/100',
  },
  {
    number: 101,
    title: 'Stack on a',
    head: { ref: 'feat-b' },
    base: { ref: 'feat-a' },
    user: { login: 'octocat' },
    draft: true,
    html_url: 'https://github.com/octo/repo/pull/101',
  },
  {
    number: 200,
    title: 'Unrelated',
    head: { ref: 'other' },
    base: { ref: 'main' },
    user: { login: 'octocat' },
    draft: false,
    html_url: 'https://github.com/octo/repo/pull/200',
  },
];

// mapApiPullRequest
{
  const mapped = mapApiPullRequest(apiPayload[1]);
  assert.equal(mapped.headRef, 'feat-b');
  assert.equal(mapped.baseRef, 'feat-a');
  assert.equal(mapped.draft, true);
}

// fetchOpenPulls with mock fetch
{
  const mockFetch = async () => ({
    ok: true,
    async json() {
      return apiPayload;
    },
  });
  const prs = await fetchOpenPulls('octo', 'repo', mockFetch);
  assert.equal(prs.length, 3);
  assert.equal(prs[0].headRef, 'feat-a');
}

// Full bootstrap path: parseRepo → fetch → build → apply → toggle
{
  const dom = new JSDOM(fixtureHtml, {
    url: 'https://github.com/octo/repo/pulls',
    runScripts: 'outside-only',
  });
  const { window } = dom;
  const { document } = window;

  globalThis.PRTree = { buildPrTree, flattenPrTree: require('../src/tree.js').flattenPrTree };
  globalThis.PRTreeDOM = domApi;

  const mockFetch = async (url) => {
    assert.match(url, /api\.github\.com\/repos\/octo\/repo\/pulls/);
    return { ok: true, json: async () => apiPayload };
  };

  const app = createPrTreeApp({
    document,
    window,
    PRTree: require('../src/tree.js'),
    PRTreeDOM: domApi,
    fetchImpl: mockFetch,
  });

  const result = await app.bootstrap();
  assert.equal(result.ok, true);
  assert.equal(result.prCount, 3);
  assert.equal(result.rootCount, 2);
  assert.equal(result.repo.owner, 'octo');
  assert.equal(result.repo.repo, 'repo');

  assert.equal(app.isActive(), true);
  const forest = app.getCachedForest();
  assert.equal(forest.length, 2);

  const treeRoot = document.getElementById('pr-tree-root');
  assert.ok(treeRoot, 'tree rendered after bootstrap');
  assert.equal(treeRoot.querySelectorAll('.pr-tree-node').length, 3);

  const hiddenRows = document.querySelectorAll('.pr-tree-hidden-original');
  assert.equal(hiddenRows.length, 3, 'original react rows hidden');

  const toggle = app.getToggleButton();
  assert.ok(toggle);
  assert.equal(toggle.textContent, 'Show default list');

  toggle.click();
  assert.equal(app.isActive(), false);
  assert.equal(document.getElementById('pr-tree-root'), null);
  assert.equal(document.querySelectorAll('.pr-tree-hidden-original').length, 0);

  toggle.click();
  assert.equal(app.isActive(), true);
  assert.ok(document.getElementById('pr-tree-root'));
}

// content.js loads bootstrap (structural check + eval without module)
{
  const contentSrc = fs.readFileSync(path.join(__dirname, '..', 'src/content.js'), 'utf8');
  assert.match(contentSrc, /PRTreeBootstrap/);
  assert.match(contentSrc, /createPrTreeApp/);

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://github.com/octo/repo/pulls',
    runScripts: 'outside-only',
  });
  const { window } = dom;
  window.eval(fs.readFileSync(path.join(__dirname, '..', 'src/tree.js'), 'utf8'));
  window.eval(fs.readFileSync(path.join(__dirname, '..', 'src/dom.js'), 'utf8'));
  window.eval(fs.readFileSync(path.join(__dirname, '..', 'src/content-bootstrap.js'), 'utf8'));
  window.eval(contentSrc);
  assert.ok(window.PRTreeBootstrap, 'content.js chain loads in browser context');
}

console.log('content-bootstrap.test.js: all assertions passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});