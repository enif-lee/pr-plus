const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const treeApi = require('../src/tree.js');
const domApi = require('../src/dom.js');
const fetchApi = require('../src/fetch-pulls.js');
const storageApi = require('../src/storage.js');
const { createPrTreeApp } = require('../src/content-bootstrap.js');

async function main() {
  const fixtureHtml = fs.readFileSync(
    path.join(__dirname, 'fixtures', 'github-pulls-react.html'),
    'utf8'
  );

  const apiPayload = [
    {
      number: 100,
      title: 'Base feature ENG-42',
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
      if (url.includes('/autolinks')) {
        return {
          ok: true,
          json: async () => [
            {
              key_prefix: 'ENG-',
              url_template: 'https://linear.app/acme/issue/ENG-<num>',
              is_alphanumeric: true,
            },
          ],
        };
      }
      assert.match(url, /api\.github\.com\/repos\/octo\/repo\/pulls/);
      return { ok: true, json: async () => apiPayload };
    };

    const app = createPrTreeApp({
      document,
      window,
      PRTree: treeApi,
      PRTreeDOM: domApi,
      PRTreeFetch: fetchApi,
      PRTreeStorage: storageApi,
      fetchImpl: mockFetch,
    });

    const result = await app.bootstrap();
    assert.equal(result.ok, true);
    assert.equal(result.prCount, 3);

    assert.equal(document.getElementById('pr-tree-root'), null);
    const indented = document.querySelectorAll('.pr-tree-indented');
    assert.equal(indented.length, 3);
    assert.equal(document.querySelectorAll('.pr-tree-row-meta').length, 3);
    assert.equal(
      document.querySelector('#issue_101 .pr-tree-pr-number')?.textContent,
      '#101'
    );
    assert.ok(document.querySelector('#issue_101 .pr-tree-badge-draft'));
    assert.ok(document.querySelector('#issue_100 .pr-tree-badge-review-required'));
    assert.match(
      document.querySelector('#issue_101 .pr-tree-row-meta')?.textContent || '',
      /feat-a/
    );
    assert.match(
      document.querySelector('#issue_101 .pr-tree-row-meta')?.textContent || '',
      /feat-b/
    );
    assert.ok(document.querySelector('#issue_100 .pr-tree-author'));
    assert.ok(document.querySelector('#issue_100 .pr-tree-opened relative-time, #issue_100 .pr-tree-relative-time'));
    assert.ok(document.querySelector('#issue_100 .pr-tree-badge-branch'));
    const magic = document.querySelector('#issue_100 a.pr-tree-badge-magic');
    assert.ok(magic);
    assert.equal(magic.textContent, 'ENG-42');
    assert.equal(magic.getAttribute('href'), 'https://linear.app/acme/issue/ENG-42');
    // Native second line hidden; rebuilt meta present
    assert.ok(document.querySelector('.pr-tree-native-meta[hidden]'));
    assert.ok(document.querySelector('.opened-by'));
    const pr101 = [...indented].find((row) =>
      row.querySelector('a')?.href?.includes('/pull/101')
    );
    assert.equal(pr101?.dataset.prTreeDepth, '1');

    const toggle = app.getToggleButton();
    toggle.click();
    assert.equal(app.isActive(), false);
    assert.equal(document.querySelectorAll('.pr-tree-indented').length, 0);
    toggle.click();
    assert.equal(app.isActive(), true);
  }

  // Re-apply after simulated SPA list re-render (same URL, fresh rows)
  {
    const dom = new JSDOM(fixtureHtml, {
      url: 'https://github.com/octo/repo/pulls',
      runScripts: 'outside-only',
    });
    const { window } = dom;
    const { document } = window;

    const mockFetch = async (url) => {
      if (String(url).includes('/autolinks')) {
        return { ok: true, json: async () => [] };
      }
      return { ok: true, json: async () => apiPayload };
    };

    const app = createPrTreeApp({
      document,
      window,
      PRTree: treeApi,
      PRTreeDOM: domApi,
      PRTreeFetch: fetchApi,
      PRTreeStorage: storageApi,
      fetchImpl: mockFetch,
    });

    await app.bootstrap();
    assert.equal(document.querySelectorAll('.pr-tree-indented').length, 3);

    const list = document.querySelector('.js-navigation-container');
    const pristineHtml = new JSDOM(fixtureHtml).window.document.querySelector(
      '.js-navigation-container'
    ).innerHTML;
    list.innerHTML = '';
    assert.equal(document.querySelectorAll('.pr-tree-indented').length, 0);

    // Empty list should schedule retry without throwing.
    await app.handlePageChange();
    assert.equal(app.isActive(), false);

    list.innerHTML = pristineHtml;
    assert.equal(app.needsReapply(), true);

    await app.handlePageChange();
    assert.equal(document.querySelectorAll('.pr-tree-indented').length, 3);
    assert.equal(app.isActive(), true);
  }

  // Page-visible PR missing from list API is filled via single-PR GET
  {
    const dom = new JSDOM(fixtureHtml, {
      url: 'https://github.com/octo/repo/pulls',
      runScripts: 'outside-only',
    });
    const { window } = dom;
    const { document } = window;

    const mockFetch = async (url) => {
      if (String(url).includes('/autolinks')) {
        return { ok: true, json: async () => [] };
      }
      if (/\/pulls\?/.test(url)) {
        return {
          ok: true,
          json: async () => apiPayload.filter((p) => p.number !== 101),
        };
      }
      if (url.endsWith('/pulls/101')) {
        return {
          ok: true,
          json: async () => apiPayload.find((p) => p.number === 101),
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    };

    const app = createPrTreeApp({
      document,
      window,
      PRTree: treeApi,
      PRTreeDOM: domApi,
      PRTreeFetch: fetchApi,
      PRTreeStorage: storageApi,
      fetchImpl: mockFetch,
    });

    const result = await app.bootstrap();
    assert.equal(result.ok, true);
    assert.equal(result.prCount, 3);
    const pr101 = [...document.querySelectorAll('.pr-tree-indented')].find((row) =>
      row.querySelector('a')?.href?.includes('/pull/101')
    );
    assert.equal(pr101?.dataset.prTreeDepth, '1');
  }

  // bootstrap queues retry when called while in-flight
  {
    const dom = new JSDOM(fixtureHtml, {
      url: 'https://github.com/octo/repo/pulls',
      runScripts: 'outside-only',
    });
    const { window } = dom;
    const { document } = window;

    const pending = [];
    const mockFetch = (url) => {
      if (String(url).includes('/autolinks')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return new Promise((resolve) => {
        pending.push(resolve);
      });
    };

    const app = createPrTreeApp({
      document,
      window,
      PRTree: treeApi,
      PRTreeDOM: domApi,
      PRTreeFetch: fetchApi,
      PRTreeStorage: storageApi,
      fetchImpl: mockFetch,
    });

    const first = app.bootstrap();
    const second = app.bootstrap();
    const secondResult = await second;
    assert.equal(secondResult.reason, 'in-flight');

    assert.ok(pending.length >= 1);
    pending.shift()({
      ok: true,
      json: async () => apiPayload,
    });
    const firstResult = await first;
    assert.equal(firstResult.ok, true);

    await new Promise((r) => setTimeout(r, 0));
    assert.equal(document.querySelectorAll('.pr-tree-indented').length, 3);
  }

  console.log('content-bootstrap.test.js: all assertions passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});