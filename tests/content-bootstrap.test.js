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

  // Full bootstrap path: parseRepo → fetch → build → apply → toggle
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
    assert.equal(result.rootCount, 2);

    const treeRoot = document.getElementById('pr-tree-root');
    assert.ok(treeRoot);
    assert.equal(treeRoot.querySelectorAll('.pr-tree-node').length, 3);

    const toggle = app.getToggleButton();
    toggle.click();
    assert.equal(app.isActive(), false);
    toggle.click();
    assert.equal(app.isActive(), true);
  }

  // content.js loads full script chain
  {
    const contentSrc = fs.readFileSync(path.join(__dirname, '..', 'src/content.js'), 'utf8');
    assert.match(contentSrc, /PRTreeFetch/);

    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'https://github.com/octo/repo/pulls',
      runScripts: 'outside-only',
    });
    const { window } = dom;
    window.eval(fs.readFileSync(path.join(__dirname, '..', 'src/tree.js'), 'utf8'));
    window.eval(fs.readFileSync(path.join(__dirname, '..', 'src/dom.js'), 'utf8'));
    window.eval(fs.readFileSync(path.join(__dirname, '..', 'src/fetch-pulls.js'), 'utf8'));
    window.eval(fs.readFileSync(path.join(__dirname, '..', 'src/content-bootstrap.js'), 'utf8'));
    window.eval(contentSrc);
    assert.ok(window.PRTreeFetch?.fetchOpenPulls);
    assert.ok(window.PRTreeBootstrap?.createPrTreeApp);
  }

  console.log('content-bootstrap.test.js: all assertions passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});