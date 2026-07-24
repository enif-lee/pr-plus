/**
 * Host soft-nav: deep-link with #diff-…R… then navigate to /pull/N (no hash)
 * must clear routeFileKey / routeStartLine on current state (shipped host).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const SCRATCH =
  process.env.PRP_SCRATCH ||
  path.join(require('node:os').tmpdir(), 'pr-plus-test-scratch');
fs.mkdirSync(SCRATCH, { recursive: true });

const pureEmbed = require('../src/modal/pure/page-embed.js');
const githubRoute = require('../src/modal/lib/github-pr-route.ts');
const hostSrc = fs.readFileSync(
  path.join(__dirname, '../src/pr-modal-host.js'),
  'utf8'
);

// Structural: applyRouteFieldsFromTarget always assigns (clears absent keys)
assert.ok(
  hostSrc.includes('applyRouteFieldsFromTarget'),
  'host has applyRouteFieldsFromTarget'
);
assert.ok(
  /current\.routeFileKey\s*=\s*target\.fileKey\s*\|\|\s*null/.test(hostSrc) ||
    /current\.routeFileKey\s*=\s*target\.fileKey\s*\|\|\s*null/.test(hostSrc),
  'host always assigns routeFileKey (null when absent)'
);
assert.ok(
  hostSrc.includes('current.routeStartLine'),
  'host assigns routeStartLine'
);

const filePath = 'lib/handler.go';
const fileKey = githubRoute.githubDiffFileKey(filePath);
const sha = 'f334fbf918447bb285d5639b7e58f8974f21f926';
const deepPath = `/octo/repo/pull/42/changes/${sha}`;
const deepHash = `#diff-${fileKey}R279-R281`;
const deepUrl = `https://github.com${deepPath}${deepHash}`;

const prHtml = `<!doctype html>
<html>
  <body>
    <header class="AppHeader">GitHub</header>
    <div class="application-main">
      <main id="js-repo-pjax-container">
        <div class="js-pull-discussion">native</div>
      </main>
    </div>
  </body>
</html>`;

const dom = new JSDOM(prHtml, {
  url: deepUrl,
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

// history.pushState/replaceState so we can soft-nav pathname+hash
const hist = window.history;
window.PRModalPageEmbed = pureEmbed;
window.PRModalGithubPrRoute = githubRoute;

window.mountPrModal = (host, props) => {
  let stamp = host.__prpReactRoot;
  if (!stamp) {
    stamp = { kind: 'createRoot', unmount() {} };
    host.__prpReactRoot = stamp;
  }
  host.setAttribute('data-mounted', '1');
  host.setAttribute('data-presentation', props.presentation || 'modal');
  return {
    render(next) {
      host.setAttribute('data-presentation', next.presentation || 'modal');
    },
    unmount() {
      try {
        delete host.__prpReactRoot;
      } catch {
        /* ignore */
      }
    },
  };
};

window.PRTreeFetch = {
  async fetchPrDetail(owner, repo, number) {
    return {
      number,
      title: `PR ${number}`,
      body: 'body',
      author: 'octo',
      baseRef: 'main',
      headRef: 'feat',
      state: 'open',
      draft: false,
      files: [{ filename: filePath }],
      comments: [],
      reviews: [],
      commits: [{ sha }, { sha: 'ae9d7dd052bf4347b2ee1f5d4823aaf84efc04ed' }],
    };
  },
};

window.eval(hostSrc);
assert.ok(window.PRModalHost);

function flush(ms = 0) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  // Pure parse proves deep link fields
  const parsedDeep = githubRoute.parseGithubPrLocation({
    pathname: deepPath,
    hash: deepHash,
  });
  assert.equal(parsedDeep.commitSha, sha);
  assert.equal(parsedDeep.fileKey, fileKey);
  assert.equal(parsedDeep.startLine, 279);
  assert.equal(parsedDeep.endLine, 281);

  // Soft-nav clear: parse without hash must null selection fields
  const parsedClean = githubRoute.parseGithubPrLocation({
    pathname: '/octo/repo/pull/42',
    hash: '',
  });
  assert.equal(parsedClean.fileKey, null);
  assert.equal(parsedClean.startLine, null);
  assert.equal(parsedClean.endLine, null);
  assert.equal(parsedClean.page, 'conversation');

  window.PRModalHost.setEnabled(true);
  await flush(30);
  await flush(80);

  let state = window.PRModalHost._getState();
  assert.equal(state.open, true);
  assert.equal(state.presentation, 'embed');
  assert.equal(state.routePage, 'diff');
  assert.equal(String(state.routeCommitSha), sha);
  assert.equal(String(state.routeFileKey), fileKey);
  assert.equal(Number(state.routeStartLine), 279);
  assert.equal(Number(state.routeEndLine), 281);

  // Soft-nav to conversation (no hash) — like popstate to /pull/N
  hist.pushState(null, '', '/octo/repo/pull/42');
  assert.equal(
    window.location.pathname,
    '/octo/repo/pull/42',
    'jsdom pushState updates pathname'
  );
  assert.equal(window.location.hash || '', '', 'hash cleared');

  const nav = window.PRModalHost.tryEmbedFromLocation();
  assert.equal(nav.ok, true);
  assert.ok(
    nav.reason === 'route-updated' || nav.ok === true,
    `nav reason=${nav.reason}`
  );
  await flush(20);

  state = window.PRModalHost._getState();
  assert.equal(state.open, true);
  assert.equal(state.routePage, 'conversation', 'page becomes conversation');
  assert.equal(
    state.routeFileKey,
    null,
    'fileKey cleared after soft-nav without #diff-'
  );
  assert.equal(
    state.routeStartLine,
    null,
    'startLine cleared after soft-nav without #diff-'
  );
  assert.equal(state.routeEndLine, null, 'endLine cleared');
  assert.equal(state.routeFilePath, null, 'filePath cleared');
  assert.equal(
    state.routeCommitSha,
    null,
    'commit sha cleared on conversation path'
  );

  const log = {
    deepFileKey: fileKey,
    afterNav: {
      routePage: state.routePage,
      routeFileKey: state.routeFileKey,
      routeStartLine: state.routeStartLine,
      routeCommitSha: state.routeCommitSha,
    },
    ok: true,
  };
  fs.writeFileSync(
    path.join(SCRATCH, 'gh-router-softnav.json'),
    JSON.stringify(log, null, 2)
  );
  console.log('github-pr-route-host-softnav.test.js: ok');
  console.log(JSON.stringify(log));
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
