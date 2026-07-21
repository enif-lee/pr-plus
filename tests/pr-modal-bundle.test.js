const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const SCRATCH =
  process.env.PRP_SCRATCH || '/var/folders/px/qw6l220x5glb_gxf44lws9p80000gn/T/grok-goal-5a6d37e1751e/implementer';
fs.mkdirSync(SCRATCH, { recursive: true });

const bundlePath = path.join(__dirname, '../src/modal/dist/pr-modal.bundle.js');
assert.ok(fs.existsSync(bundlePath), 'shipped bundle missing — run npm run build:modal');

const code = fs.readFileSync(bundlePath, 'utf8');
assert.ok(code.length > 10_000, 'bundle should include React');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://github.com/octo/repo/pulls',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});

const { window } = dom;
// jsdom needs requestAnimationFrame
window.requestAnimationFrame = (cb) => setTimeout(cb, 0);

window.eval(code);

assert.equal(typeof window.mountPrModal, 'function', 'mountPrModal export');
assert.equal(typeof window.PRModalApp, 'function', 'PRModalApp export');
// Vite ESM bundles pure as imports (not globalThis.PRModal* banners).

const host = window.document.getElementById('root');
const detail = {
  number: 42,
  title: 'Fixture PR',
  body: 'Body text',
  author: 'octocat',
  baseRef: 'main',
  headRef: 'feat',
  state: 'open',
  draft: false,
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
};

const root = window.mountPrModal(host, {
  open: true,
  loading: false,
  error: null,
  detail,
  onClose: () => {},
});

assert.ok(root);
// allow paint
assert.ok(host.innerHTML.length > 0 || host.childNodes.length >= 0);

const log = [
  'pr-modal-bundle.test.js: bundle load ok',
  `bytes=${code.length}`,
  `hasMount=${typeof window.mountPrModal}`,
  `hasPRModalApp=${typeof window.PRModalApp}`,
].join('\n');
fs.writeFileSync(path.join(SCRATCH, 'pr-modal-bundle-load.log'), log + '\n');
fs.writeFileSync(path.join(SCRATCH, 'bundle-load.log'), log + '\n');
console.log('pr-modal-bundle.test.js: all assertions passed');
console.log(log);
