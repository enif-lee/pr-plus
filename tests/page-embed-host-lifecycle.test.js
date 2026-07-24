/**
 * Honest host lifecycle against shipped pr-modal-host.js + mountPrModal contract:
 *   host.__prpReactRoot = createRoot-like stamp (NOT the returned wrapper)
 *   return { render, unmount } wrapper
 *
 * Asserts:
 * 1) Progressive updates on the same host REUSE the root (mountCount stable)
 * 2) Destroying the host then tryEmbedFromLocation REMOUNTS (mountCount++)
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SCRATCH =
  process.env.PRP_SCRATCH ||
  path.join(require('node:os').tmpdir(), 'pr-plus-test-scratch');
fs.mkdirSync(SCRATCH, { recursive: true });

const pureEmbed = require('../src/modal/pure/page-embed.js');
const hostSrc = fs.readFileSync(
  path.join(__dirname, '../src/pr-modal-host.js'),
  'utf8'
);

// Source contract: live check must not require stamp === wrapper
assert.ok(
  hostSrc.includes('Never compare stamp') ||
    !/host\.__prpReactRoot\s*&&\s*host\.__prpReactRoot\s*!==\s*reactRoot/.test(
      hostSrc
    ),
  'isReactRootLiveOn must not treat createRoot stamp ≠ wrapper as dead'
);
assert.ok(hostSrc.includes('isReactRootLiveOn'));
assert.ok(hostSrc.includes('reactRootHost'));

const prHtml = `<!doctype html>
<html>
  <body>
    <header class="AppHeader">GitHub</header>
    <div class="application-main">
      <main id="js-repo-pjax-container">
        <div class="js-pull-discussion">native conversation</div>
      </main>
    </div>
  </body>
</html>`;

const dom = new JSDOM(prHtml, {
  url: 'https://github.com/octo/repo/pull/42',
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
window.PRModalPageEmbed = pureEmbed;

let mountCount = 0;
let renderCount = 0;
let lastProps = null;
let createRootSerial = 0;

/**
 * Mirrors real mountPrModal (src/modal/app/mountPrModal.tsx):
 * - host.__prpReactRoot = createRoot-like stamp
 * - returns a *different* {render, unmount} wrapper
 */
window.mountPrModal = (host, props) => {
  let stamp = host.__prpReactRoot;
  if (!stamp) {
    createRootSerial += 1;
    stamp = {
      kind: 'createRoot',
      id: createRootSerial,
      host,
      unmount() {
        /* createRoot.unmount */
      },
    };
    host.__prpReactRoot = stamp;
    mountCount += 1;
  }

  function paint(p) {
    lastProps = p;
    host.setAttribute('data-mounted', '1');
    host.setAttribute('data-presentation', p.presentation || 'modal');
    host.setAttribute('data-stamp-id', String(stamp.id));
    host.textContent = p.detail
      ? `detail:${p.detail.number}`
      : p.loading
        ? 'loading'
        : 'open';
  }
  paint(props);

  const wrapper = {
    render(nextProps) {
      renderCount += 1;
      paint(nextProps);
    },
    unmount() {
      try {
        stamp.unmount();
      } catch {
        /* ignore */
      }
      try {
        delete host.__prpReactRoot;
      } catch {
        /* ignore */
      }
      host.removeAttribute('data-mounted');
      host.textContent = '';
    },
  };
  // Critical: stamp !== wrapper (matches real mountPrModal)
  assert.notEqual(host.__prpReactRoot, wrapper);
  return wrapper;
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
      files: [],
      comments: [],
      reviews: [],
      commits: [],
    };
  },
};

window.eval(hostSrc);
assert.ok(window.PRModalHost);

function flush(ms = 0) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  window.PRModalHost.setEnabled(true);
  await flush(20);
  await flush(40);
  await flush(80);

  const id = pureEmbed.PAGE_EMBED_HOST_ID || 'prp-page-embed';
  const host1 = document.getElementById(id);
  assert.ok(host1, 'embed host created');
  assert.equal(host1.getAttribute('data-mounted'), '1');
  assert.equal(host1.getAttribute('data-presentation'), 'embed');
  assert.ok(host1.__prpReactRoot, 'createRoot stamp present');
  assert.equal(mountCount, 1, 'initial mount once');
  const stampId1 = host1.getAttribute('data-stamp-id');
  assert.ok(stampId1);

  // Progressive update on SAME host must REUSE root (not remount)
  const mountsBeforeUpdate = mountCount;
  const rendersBefore = renderCount;
  // Force another render via tryEmbed same-path
  const same = window.PRModalHost.tryEmbedFromLocation();
  assert.equal(same.ok, true);
  assert.equal(same.reason, 'already-open');
  await flush(0);

  assert.equal(
    mountCount,
    mountsBeforeUpdate,
    `same-host update must NOT remount (mounts stayed ${mountCount})`
  );
  assert.ok(
    renderCount > rendersBefore,
    'same-host update uses wrapper.render'
  );
  assert.equal(
    document.getElementById(id),
    host1,
    'same host node after already-open'
  );
  assert.equal(
    document.getElementById(id).getAttribute('data-stamp-id'),
    stampId1,
    'createRoot stamp id unchanged (reuse)'
  );

  // Progressive detail paint also reuses (host openModal re-render path)
  const state = window.PRModalHost._getState();
  assert.equal(state.open, true);
  assert.equal(state.presentation, 'embed');
  // After fetch completes, more renders may have happened — still 1 mount
  await flush(50);
  assert.equal(mountCount, 1, 'still one mount after progressive loads');

  // --- Destroy host (Turbo) → must REMOUNT ---
  const mountsBeforeDestroy = mountCount;
  host1.remove();
  assert.equal(document.getElementById(id), null);

  const main = document.querySelector('.application-main');
  const reinjected = document.createElement('div');
  reinjected.className = 'js-pull-discussion';
  reinjected.textContent = 'native after turbo';
  main.appendChild(reinjected);

  const res = window.PRModalHost.tryEmbedFromLocation();
  assert.equal(res.ok, true);
  assert.equal(res.reason, 'already-open');
  await flush(0);

  const host2 = document.getElementById(id);
  assert.ok(host2, 'new embed host after destroy');
  assert.notEqual(host2, host1);
  assert.equal(host2.getAttribute('data-mounted'), '1');
  assert.ok(
    mountCount > mountsBeforeDestroy,
    `remount after destroy (${mountsBeforeDestroy} → ${mountCount})`
  );
  assert.notEqual(
    host2.getAttribute('data-stamp-id'),
    stampId1,
    'new createRoot stamp after remount'
  );
  assert.equal(reinjected.getAttribute('data-prp-native-hidden'), '1');

  assert.equal(lastProps?.presentation, 'embed');
  assert.equal(lastProps?.shellChrome?.showClose, false);
  assert.equal(lastProps?.shellChrome?.showFullscreen, false);

  window.PRModalHost.closeModal();
  await flush(0);
  assert.equal(window.PRModalHost._getState().open, false);
  assert.equal(document.getElementById(id), null);

  const log = {
    mountCount,
    renderCount,
    reusedSameHost: mountCount >= 2 && mountsBeforeDestroy === 1,
    remountedAfterDestroy: mountCount > mountsBeforeDestroy,
    ok: true,
  };
  fs.writeFileSync(
    path.join(SCRATCH, 'page-embed-host-lifecycle.json'),
    JSON.stringify(log, null, 2)
  );
  console.log('page-embed-host-lifecycle.test.js: ok');
  console.log(JSON.stringify(log));
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
