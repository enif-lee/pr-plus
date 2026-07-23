const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const SCRATCH =
  process.env.PRP_SCRATCH || '/var/folders/px/qw6l220x5glb_gxf44lws9p80000gn/T/grok-goal-5a6d37e1751e/implementer';
fs.mkdirSync(SCRATCH, { recursive: true });

const fixtureHtml = fs.readFileSync(
  path.join(__dirname, 'fixtures/github-pulls-react.html'),
  'utf8'
);

// Load pure + host parse helpers by eval of host source without chrome
const hostSrc = fs.readFileSync(
  path.join(__dirname, '../src/pr-modal-host.js'),
  'utf8'
);

const dom = new JSDOM(fixtureHtml, {
  url: 'https://github.com/octo/repo/pulls',
  runScripts: 'outside-only',
  beforeParse(window) {
    window.chrome = {
      runtime: {
        getURL: (p) => `chrome-extension://test/${p}`,
        sendMessage: () => {},
        lastError: null,
        onMessage: { addListener() {}, removeListener() {} },
      },
    };
  },
});

const { window } = dom;
const { document } = window;

// Provide stubs for mount — render() must update props without unmount
let lastProps = null;
let mountCount = 0;
let renderCount = 0;
window.mountPrModal = (host, props) => {
  mountCount += 1;
  lastProps = props;
  host.setAttribute('data-mounted', '1');
  host.textContent = props.loading
    ? 'loading'
    : props.detail
      ? `detail:${props.detail.number}`
      : 'open';
  return {
    unmount() {
      host.removeAttribute('data-mounted');
      host.textContent = '';
    },
    render(nextProps) {
      renderCount += 1;
      lastProps = nextProps;
      host.textContent = nextProps.loading
        ? 'loading'
        : nextProps.detail
          ? `detail:${nextProps.detail.number}`
          : 'open';
    },
  };
};
window.PRTreeFetch = {
  async fetchPrDetail(owner, repo, number) {
    return {
      number,
      title: `PR ${number}`,
      body: 'hello body',
      author: 'octo',
      baseRef: 'main',
      headRef: 'feat',
      state: 'open',
      draft: false,
      files: [
        {
          filename: 'src/a.js',
          status: 'modified',
          additions: 1,
          deletions: 0,
          patch: '@@ -1 +1,2 @@\n line\n+added unique-offwindow-TOKEN\n',
        },
      ],
      comments: [{ author: 'a', body: 'c' }],
      reviews: [{ author: 'r', state: 'APPROVED', body: 'lgtm' }],
      commits: [{ sha: 'abc1234', message: 'commit msg', author: 'dev' }],
    };
  },
};

window.eval(hostSrc);
assert.ok(window.PRModalHost);

// parsePrFromAnchor
{
  const a = document.createElement('a');
  a.setAttribute('href', '/octo/repo/pull/101');
  const parsed = window.PRModalHost.parsePrFromAnchor(a);
  assert.equal(parsed.owner, 'octo');
  assert.equal(parsed.repo, 'repo');
  assert.equal(Number(parsed.number), 101);
}

// Host is disabled until PAT is configured (content enables it). Tests enable explicitly.
window.PRModalHost.setEnabled(true);
assert.equal(window.PRModalHost.isEnabled(), true);

// click intercept opens modal without navigation
{
  assert.equal(window.PRModalHost.isPullsListPage(), true);
  const link = document.querySelector('a[href*="/pull/101"]');
  assert.ok(link);

  let defaultPrevented = false;
  const ev = new window.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    button: 0,
    view: window,
  });
  Object.defineProperty(ev, 'preventDefault', {
    value() {
      defaultPrevented = true;
    },
  });

  link.dispatchEvent(ev);

  // allow async open
  // wait microtasks
}

// flush promises
function flush() {
  return new Promise((r) => setTimeout(r, 0));
}

(async () => {
  await flush();
  await flush();

  const state = window.PRModalHost._getState();
  assert.equal(state.open, true, 'modal should open');
  assert.equal(state.number, 101);
  assert.ok(state.detail || state.loading === false);
  // after fetch
  await flush();
  await flush();
  const after = window.PRModalHost._getState();
  // After loading detail, host must reuse root via .render (not remount)
  assert.equal(mountCount, 1, 'mountPrModal called once');
  assert.ok(renderCount >= 1, 'subsequent updates use root.render');
  assert.equal(after.open, true);
  assert.equal(after.loading, false);
  assert.equal(after.detail?.number, 101);
  assert.ok(document.getElementById('prp-modal-host'));

  // expand path is pure + App level; assert layout helpers used by shipped pure module
  const layout = require('../src/modal/lib/layout-mode.ts');
  assert.ok(layout.layoutClassName('diff').includes('diff'));

  const log = [
    'pr-modal-host.test.js: open intercepted',
    `open=${after.open} number=${after.detail.number} title=${after.detail.title}`,
    `files=${after.detail.files.length}`,
  ].join('\n');
  fs.writeFileSync(path.join(SCRATCH, 'pr-modal-open.log'), log + '\n');
  console.log('pr-modal-host.test.js: all assertions passed');
  console.log(log);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
