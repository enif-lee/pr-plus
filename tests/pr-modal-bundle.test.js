const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const SCRATCH =
  process.env.PRP_SCRATCH ||
  path.join(require('node:os').tmpdir(), 'pr-plus-test-scratch');
fs.mkdirSync(SCRATCH, { recursive: true });

const bundlePath = path.join(__dirname, '../src/modal/dist/pr-modal.bundle.js');
assert.ok(fs.existsSync(bundlePath), 'shipped bundle missing — run npm run build:modal');

const code = fs.readFileSync(bundlePath, 'utf8');
assert.ok(code.length > 10_000, 'bundle should include React');

(async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://github.com/octo/repo/pulls',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });

  const { window } = dom;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);

  window.eval(code);

  assert.equal(typeof window.mountPrModal, 'function', 'mountPrModal export');
  assert.equal(typeof window.PRModalApp, 'function', 'PRModalApp export');

  const host = window.document.getElementById('root');
  const detail = {
    number: 42,
    title: 'Fixture PR',
    body: 'Body text',
    author: 'octocat',
    owner: 'octo',
    repo: 'repo',
    baseRef: 'main',
    headRef: 'feat',
    state: 'open',
    draft: false,
    mergeable: true,
    mergeableState: 'clean',
    additions: 1,
    deletions: 0,
    changedFiles: 1,
    files: [
      {
        filename: 'x.js',
        status: 'modified',
        additions: 1,
        deletions: 0,
        patch: '@@\n+hello search-me-please\n',
      },
    ],
    comments: [],
    reviews: [{ author: 'r', state: 'APPROVED', body: 'ok' }],
    commits: [{ sha: 'deadbeef', message: 'msg', author: 'a' }],
    checks: { state: 'success', totalCount: 1, statuses: [] },
  };

  const reactErrors = [];
  const prevOnError = window.onerror;
  window.onerror = (msg) => {
    reactErrors.push(String(msg));
    return false;
  };
  const prevConsoleError = console.error;
  console.error = (...args) => {
    const s = args.map(String).join(' ');
    if (/ReferenceError|is not defined|Minified React error/i.test(s)) {
      reactErrors.push(s);
    }
    prevConsoleError.apply(console, args);
  };

  const root = window.mountPrModal(host, {
    open: true,
    loading: false,
    error: null,
    detail,
    onClose: () => {},
  });

  assert.ok(root);
  // Flush React paint + rAF polyfill
  await new Promise((r) => setTimeout(r, 80));

  const html = host.innerHTML || '';
  const text = host.textContent || '';
  assert.ok(html.length > 100, 'mounted modal must produce DOM');
  assert.ok(
    !reactErrors.some((e) => /showChecks|ChecksPanel|ReferenceError/i.test(e)),
    `React render must not throw (got: ${reactErrors.slice(0, 3).join(' | ') || 'none'})`
  );
  assert.ok(
    html.includes('prp-merge-box') || host.querySelector('.prp-merge-box'),
    'merge box must mount for open PR'
  );
  assert.ok(
    html.includes('prp-merge-method') ||
      /Merge pull request/i.test(text) ||
      html.includes('merge-method'),
    'merge method control must render'
  );
  assert.ok(
    html.includes('prp-merge-box__headline') || /no conflicts/i.test(text),
    'status headline present'
  );

  window.onerror = prevOnError;
  console.error = prevConsoleError;

  const log = [
    'pr-modal-bundle.test.js: bundle load ok',
    `bytes=${code.length}`,
    `hasMount=${typeof window.mountPrModal}`,
    `hasPRModalApp=${typeof window.PRModalApp}`,
    `has-merge-box=${html.includes('prp-merge-box')}`,
    `render-errors=${reactErrors.length}`,
  ].join('\n');
  fs.writeFileSync(path.join(SCRATCH, 'pr-modal-bundle-load.log'), log + '\n');
  fs.writeFileSync(path.join(SCRATCH, 'bundle-load.log'), log + '\n');
  console.log('pr-modal-bundle.test.js: all assertions passed');
  console.log(log);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
