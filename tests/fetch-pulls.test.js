const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

async function main() {
const {
  parseBranchFromRefChannel,
  parsePrPageHtml,
  scrapePrListFromDom,
  fetchOpenPulls,
  fetchOpenPullsPublic,
} = require('../src/fetch-pulls.js');
const { findOriginalPrRows } = require('../src/dom.js');

const samplePrHtml = `
<html><body>
<script>
window.data = {
  "headRefChannel":"eyJjIjoicmVwbzo1MjQwMjQzNTI6YnJhbmNoOmZpeC9pbnNpZ2h0LWJyZXZpdHkiLCJ0IjoxNzgyNDY2ODc3fQ==--abc",
  "baseRefChannel":"eyJjIjoicmVwbzo1MjQwMjQzNTI6YnJhbmNoOm1haW4iLCJ0IjoxNzgyNDY2ODc3fQ==--def",
  "title":"fix(insight): brevity",
  "isDraft":false
};
</script>
</body></html>
`;

// parseBranchFromRefChannel
{
  assert.equal(
    parseBranchFromRefChannel(samplePrHtml, 'headRefChannel'),
    'fix/insight-brevity'
  );
  assert.equal(parseBranchFromRefChannel(samplePrHtml, 'baseRefChannel'), 'main');
  assert.equal(parseBranchFromRefChannel(samplePrHtml, 'missing'), null);
}

// parsePrPageHtml
{
  const pr = parsePrPageHtml(samplePrHtml, {
    number: 2416,
    title: 'fallback title',
    author: 'jiunbae',
    draft: false,
    htmlUrl: 'https://github.com/o/r/pull/2416',
  });
  assert.equal(pr.number, 2416);
  assert.equal(pr.headRef, 'fix/insight-brevity');
  assert.equal(pr.baseRef, 'main');
  assert.equal(pr.author, 'jiunbae');
  assert.match(pr.title, /brevity/);
}

// scrapePrListFromDom on legacy fixture
{
  const html = require('node:fs').readFileSync(
    require('node:path').join(__dirname, 'fixtures/github-pulls-legacy.html'),
    'utf8'
  );
  const dom = new JSDOM(html, { url: 'https://github.com/octo/repo/pulls' });
  const stubs = scrapePrListFromDom(dom.window.document, findOriginalPrRows);
  assert.equal(stubs.length, 3);
  assert.deepEqual(
    stubs.map((s) => s.number),
    [10, 11, 12]
  );
}

// fetchOpenPulls falls back on 404
{
  const html = require('node:fs').readFileSync(
    require('node:path').join(__dirname, 'fixtures/github-pulls-legacy.html'),
    'utf8'
  );
  const dom = new JSDOM(html, { url: 'https://github.com/octo/repo/pulls' });

  const calls = [];
  const mockFetch = async (url) => {
    calls.push(url);
    if (url.includes('api.github.com')) {
      return { ok: false, status: 404, statusText: 'Not Found' };
    }
    if (url.includes('/pull/10')) return { ok: true, text: async () => samplePrHtml.replace('2416', '10') };
    if (url.includes('/pull/11')) return { ok: true, text: async () => samplePrHtml };
    if (url.includes('/pull/12')) return { ok: true, text: async () => samplePrHtml };
    return { ok: false, status: 404, statusText: 'Not Found' };
  };

  const prs = await fetchOpenPulls('octo', 'repo', mockFetch, {
    document: dom.window.document,
    findOriginalPrRows,
  });

  assert.ok(calls[0].includes('api.github.com'));
  assert.ok(calls.some((u) => u.includes('/pull/10')));
  assert.equal(prs.length, 3);
  assert.equal(prs[0].headRef, 'fix/insight-brevity');
}

// fetchOpenPulls uses public API when available
{
  const mockFetch = async (url) => {
    if (!url.includes('api.github.com')) throw new Error('should not fallback');
    return {
      ok: true,
      json: async () => [
        {
          number: 1,
          title: 'A',
          head: { ref: 'feat-a' },
          base: { ref: 'main' },
          user: { login: 'dev' },
          draft: false,
          html_url: 'https://github.com/o/r/pull/1',
        },
      ],
    };
  };
  const prs = await fetchOpenPullsPublic('octo', 'repo', mockFetch);
  assert.equal(prs.length, 1);
  assert.equal(prs[0].headRef, 'feat-a');
}

console.log('fetch-pulls.test.js: all assertions passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});