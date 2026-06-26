const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const treeApi = require('../src/tree.js');
const domApi = require('../src/dom.js');
const fetchApi = require('../src/fetch-pulls.js');
const { createPrTreeApp } = require('../src/content-bootstrap.js');

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

  {
    const dom = new JSDOM(fixtureHtml, {
      url: 'https://github.com/octo/repo/pulls',
      runScripts: 'outside-only',
    });
    const { window } = dom;
    const { document } = window;

    const mockFetch = async (url) => {
      assert.match(url, /api\.github\.com\/repos\/octo\/repo\/pulls/);
      return { ok: true, json: async () => apiPayload };
    };

    const app = createPrTreeApp({
      document,
      window,
      PRTree: treeApi,
      PRTreeDOM: domApi,
      PRTreeFetch: fetchApi,
      fetchImpl: mockFetch,
    });

    const result = await app.bootstrap();
    assert.equal(result.ok, true);
    assert.equal(result.prCount, 3);

    assert.equal(document.getElementById('pr-tree-root'), null);
    const indented = document.querySelectorAll('.pr-tree-indented');
    assert.equal(indented.length, 3);
    assert.equal(indented[1].dataset.prTreeDepth, '1');

    const toggle = app.getToggleButton();
    toggle.click();
    assert.equal(app.isActive(), false);
    assert.equal(document.querySelectorAll('.pr-tree-indented').length, 0);
    toggle.click();
    assert.equal(app.isActive(), true);
  }

  console.log('content-bootstrap.test.js: all assertions passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});