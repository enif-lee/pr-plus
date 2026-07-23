/**
 * Host + pure URI restore wiring without Chrome extension / PAT.
 * Drives shipped pr-modal-host.js + uri-route + session-view helpers.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const SCRATCH =
  process.env.PRP_SCRATCH ||
  '/var/folders/px/qw6l220x5glb_gxf44lws9p80000gn/T/grok-goal-444175c26e25/implementer';
fs.mkdirSync(SCRATCH, { recursive: true });

const uriRoute = require('../src/modal/lib/uri-route.ts');
const sessionView = require('../src/modal/lib/session-view.ts');

const fixtureHtml = fs.readFileSync(
  path.join(__dirname, 'fixtures/github-pulls-react.html'),
  'utf8'
);
const hostSrc = fs.readFileSync(path.join(__dirname, '../src/pr-modal-host.js'), 'utf8');

function makeDom(url) {
  const dom = new JSDOM(fixtureHtml, {
    url,
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
  window.PRModalUriRoute = uriRoute;
  window.PRModalSessionView = sessionView;
  let lastProps = null;
  window.mountPrModal = (host, props) => {
    lastProps = props;
    return {
      unmount() {},
      render(next) {
        lastProps = next;
      },
    };
  };
  window.PRTreeFetch = {
    async fetchPrDetail(owner, repo, number) {
      return {
        number,
        title: `PR ${number}`,
        owner,
        repo,
        state: 'open',
        files: [],
        comments: [],
        reviewComments: [{ id: 900, path: 'a.js', line: 1, body: 'x' }],
        reviews: [],
        commits: [],
      };
    },
  };
  window.__lastProps = () => lastProps;
  window.eval(hostSrc);
  window.PRModalHost.setEnabled(true);
  return window;
}

async function main() {
  // --- URI-only restore (no session) ---
  {
    const qs = uriRoute.serializeRouteToSearch(
      { page: 'diff', number: 101, position: 'c:900' },
      ''
    );
    const window = makeDom(`https://github.com/octo/repo/pulls${qs}`);
    window.sessionStorage.clear();
    const res = await window.PRModalHost.tryRestoreOpenModal();
    assert.equal(res.ok, true, 'URI restore ok');
    assert.equal(res.source, 'uri');
    assert.equal(res.number, 101);
    assert.equal(res.page, 'diff');
    assert.equal(res.position, 'c:900');
    const props = window.__lastProps();
    assert.equal(props?.initialRoute?.position, 'c:900');
    assert.equal(props?.initialRoute?.page, 'diff');
    assert.ok(
      window.location.search.includes('101') || window.location.href.includes('101')
    );
  }

  // --- session wins over URI ---
  {
    const qs = uriRoute.serializeRouteToSearch(
      { page: 'conversation', number: 999, position: 'c:1' },
      ''
    );
    const window = makeDom(`https://github.com/octo/repo/pulls${qs}`);
    window.sessionStorage.clear();
    sessionView.saveOpenModal(window.sessionStorage, {
      owner: 'octo',
      repo: 'repo',
      number: 55,
      page: 'diff',
      position: 'c:900',
    });
    const res = await window.PRModalHost.tryRestoreOpenModal();
    assert.equal(res.ok, true);
    assert.equal(res.source, 'session');
    assert.equal(res.number, 55);
    assert.equal(res.page, 'diff');
    assert.equal(res.position, 'c:900');
  }

  // --- close clears URI params, keeps unrelated ---
  {
    const window = makeDom('https://github.com/octo/repo/pulls?q=is%3Aopen');
    window.sessionStorage.clear();
    await window.PRModalHost.openModal({
      owner: 'octo',
      repo: 'repo',
      number: 7,
      page: 'conversation',
    });
    assert.ok(
      window.location.search.includes('7') ||
        window.location.href.includes('prp_') ||
        window.location.href.includes('pr+')
    );
    window.PRModalHost.closeModal();
    const search = window.location.search || '';
    assert.ok(
      search.includes('q=is') || search.includes('is%3Aopen') || search.includes('is:open'),
      `expected unrelated q param kept, got ${search}`
    );
    assert.ok(!search.includes('prp_number') && !search.includes('pr+number'));
    const route = uriRoute.parseLocationRoute(window.location);
    assert.equal(route.number, null);
    assert.equal(route.page, null);
  }

  // --- unencoded residual keys: clear must not leave open-able route ---
  {
    // Simulate hand-typed legacy URL before open
    const window = makeDom(
      'https://github.com/octo/repo/pulls?pr+page=diff&pr+number=88&pr+position=c:1&q=is%3Aopen'
    );
    window.sessionStorage.clear();
    // Clear without session — pure helper + host close path
    const clearedSearch = uriRoute.clearRouteFromSearch(window.location.search);
    const clearedRoute = uriRoute.parseRouteFromSearch(clearedSearch);
    assert.equal(clearedRoute.number, null);
    assert.equal(clearedRoute.page, null);
    assert.equal(clearedRoute.position, null);
    const noOpen = uriRoute.resolveRestore({
      sessionOpen: null,
      uri: clearedRoute,
      pathOwner: 'octo',
      pathRepo: 'repo',
    });
    assert.equal(noOpen.source, 'none');
    assert.equal(noOpen.open, null);

    // open then close should also wipe spaced leftovers if any remained in location
    await window.PRModalHost.openModal({
      owner: 'octo',
      repo: 'repo',
      number: 3,
      page: 'conversation',
    });
    window.PRModalHost.closeModal();
    const after = uriRoute.parseLocationRoute(window.location);
    assert.equal(after.number, null);
    assert.equal(after.page, null);
    assert.equal(after.position, null);
  }

  // --- static proof: host source calls shipped helpers ---
  {
    const src = hostSrc;
    assert.ok(src.includes('PRModalUriRoute'));
    assert.ok(src.includes('resolveRestore'));
    assert.ok(src.includes('replaceLocationRoute') || src.includes('writeUriRoute'));
    assert.ok(src.includes('clearLocationRoute') || src.includes('clearUriRoute'));
    assert.ok(src.includes('sessionStorage'));
    assert.ok(src.includes('initialRoute'));
    assert.ok(src.includes('onRouteChange'));
  }

  // --- App source wires position / URI write (no reimplementation) ---
  {
    const appSrc = fs.readFileSync(
      path.join(__dirname, '../src/modal/app/PrModalApp.tsx'),
      'utf8'
    );
    assert.ok(appSrc.includes('replaceLocationRoute'));
    assert.ok(appSrc.includes('findCommentIndexByPosition'));
    assert.ok(appSrc.includes('buildPositionFromComment'));
    assert.ok(appSrc.includes('initialRoute'));
    assert.ok(appSrc.includes('onRouteChange'));
  }

  console.log('uri-route-host.test.js: all assertions passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
