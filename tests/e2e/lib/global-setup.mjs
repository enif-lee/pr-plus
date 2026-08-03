/**
 * rstest globalSetup — warm shared agent-browser session once per e2e run.
 * Returning a function registers teardown (close browser after all files).
 *
 * Note: After rebuilds that change the service worker file (see manifest
 * `background.sw.js` + build-sw dual write), prefer a full browser relaunch
 * (`teardown` + cold open) so Chrome picks up the new SW. Optional:
 * PRP_E2E_RELOAD_EXT=1 dispatches prp-reload-extension (chrome.runtime.reload).
 */
import { evalInPage, open, waitMs } from './ab.mjs';
import { ensureSharedSession, teardownSharedSession } from './session.mjs';

function tryReloadExtension(label = 'globalSetup') {
  if (
    process.env.PRP_E2E_RELOAD_EXT !== '1' &&
    process.env.PRP_E2E_RELOAD_EXT !== 'true'
  ) {
    return;
  }
  try {
    // ensureSharedSession soft-reset already lands on github.com once — only
    // open if origin is wrong (reload path still needs one post-reload land).
    let host = null;
    try {
      host = evalInPage(`location.hostname || ''`);
    } catch {
      host = null;
    }
    if (!host || !String(host).endsWith('github.com')) {
      open('https://github.com/');
      waitMs(300);
    }
    const hook = evalInPage(
      `document.documentElement.getAttribute('data-prp-gql-cost-hook') || document.documentElement.getAttribute('data-prp-bridge')`
    );
    if (!hook) {
      console.log(`[e2e] ${label}: skip extension reload (bridge not injected)`);
      return;
    }
    console.log(`[e2e] ${label}: chrome.runtime.reload() via prp-reload-extension`);
    evalInPage(
      `document.dispatchEvent(new CustomEvent('prp-reload-extension', { bubbles: true })); true`
    );
    // SW + content re-inject after runtime.reload needs more than ~1.5s or early
    // suites hit modal-ready timeouts (bridge/SW still restarting).
    waitMs(4000);
    open('https://github.com/enif-lee/pr-plus/pulls');
    waitMs(800);
    // Wait until content bridge is back before any suite runs.
    try {
      const deadline = Date.now() + 12_000;
      while (Date.now() < deadline) {
        const hook = evalInPage(
          `document.documentElement.getAttribute('data-prp-bridge') || document.documentElement.getAttribute('data-prp-gql-cost-hook') || ''`
        );
        if (hook) break;
        waitMs(300);
      }
    } catch {
      /* soft */
    }
  } catch (e) {
    console.log(
      `[e2e] ${label}: extension reload soft-fail: ${String(e?.message || e).slice(0, 160)}`
    );
  }
}

export default async function globalSetup() {
  ensureSharedSession('globalSetup');
  tryReloadExtension('globalSetup');
  return async () => {
    teardownSharedSession();
  };
}
