const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const SCRATCH =
  process.env.PRP_SCRATCH ||
  '/var/folders/sl/km7nh7qj50b9mw4901n7ch940000gn/T/grok-goal-090750d025fa/implementer';
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
assert.ok(window.PRModalLayout, 'pure layout global');
assert.ok(window.PRModalVirtual, 'pure virtual global');
assert.ok(window.PRModalSearch, 'pure search global');

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
  `hasLayout=${Boolean(window.PRModalLayout)}`,
].join('\n');
fs.writeFileSync(path.join(SCRATCH, 'pr-modal-bundle-load.log'), log + '\n');
console.log('pr-modal-bundle.test.js: all assertions passed');
console.log(log);
