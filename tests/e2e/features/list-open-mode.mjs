/**
 * listOpenMode pref: /pulls title click → pr+ modal | PR page navigation.
 */
import {
  DEMO_PR,
  PULLS_URL,
  assert,
  closeOverlay,
  evalInPage,
  log,
  open,
  openPulls,
  waitContentInject,
  waitMs,
  waitNetwork,
  waitPrShellReady,
} from '../lib/harness.mjs';
import { setListOpenModePref } from '../lib/list-open-mode-pref.mjs';
import { waitFor } from '../lib/ab.mjs';

/**
 * @returns {import('../lib/e2e-register.ts').E2eStep[]}
 */
export function getSteps() {
  /** @type {{ name: string, fn: () => unknown | Promise<unknown> }[]} */
  const steps = [];
  const run = (name, fn) => {
    steps.push({ name, fn });
  };

  const clickPrTitleOnList = (n) =>
    evalInPage(`
      (() => {
        const href = '/enif-lee/pr-plus/pull/${Number(n)}';
        const a = [...document.querySelectorAll('a[href]')].find((el) => {
          const h = el.getAttribute('href') || '';
          if (!(h === href || h.startsWith(href + '#') || h.startsWith(href + '?'))) {
            return false;
          }
          const t = (el.textContent || '').trim();
          return t.length > 2;
        });
        if (!a) return { ok: false, reason: 'title-link-missing' };
        a.click();
        return { ok: true, text: (a.textContent || '').trim().slice(0, 60) };
      })()
    `);

  const probe = () =>
    evalInPage(`
      (() => {
        const path = location.pathname || '';
        const ov = !!document.querySelector('.prp-overlay');
        const layout =
          document.querySelector('.prp-overlay')?.getAttribute('data-layout') ||
          document.querySelector('[data-layout]')?.getAttribute('data-layout') ||
          null;
        const mode =
          document.documentElement.getAttribute('data-prp-list-open-mode') || null;
        const onPulls = /\\/pulls(?:\\/|$)/.test(path);
        const onPr = /\\/pull\\/\\d+/.test(path);
        const prNum = (path.match(/\\/pull\\/(\\d+)/) || [])[1] || null;
        return { path, onPulls, onPr, prNum, overlay: ov, layout, mode };
      })()
    `);

  run('LOM.0 open pulls + ensure inject', () => {
    openPulls();
    waitContentInject({ label: 'LOM.0 inject', timeoutMs: 15_000 });
    waitMs(400);
    // Always start from known default so suite is order-independent
    setListOpenModePref('modal', { label: 'LOM.0 reset modal' });
    waitMs(200);
  });

  run('LOM.1 modal mode: title click opens pr+ overlay on /pulls', () => {
    setListOpenModePref('modal', { label: 'LOM.1 modal' });
    closeOverlay();
    waitMs(300);
    // Ensure list is visible (not stuck on PR page from prior run)
    if (!evalInPage(`location.pathname.includes('/pulls')`)) {
      openPulls();
      waitContentInject({ label: 'LOM.1 inject', timeoutMs: 12_000 });
    }
    const clicked = clickPrTitleOnList(DEMO_PR);
    log(`  click: ${JSON.stringify(clicked)}`);
    assert(clicked?.ok, `could not click PR #${DEMO_PR} title: ${JSON.stringify(clicked)}`);
    waitPrShellReady(DEMO_PR, 'LOM.1 modal shell');
    const p = probe();
    log(`  probe: ${JSON.stringify(p)}`);
    assert(p?.overlay, 'modal mode: expected pr+ overlay');
    assert(
      p?.onPulls === true || String(p?.path || '').includes('/pulls'),
      `modal mode should stay on list URL, got ${p?.path}`
    );
    closeOverlay();
    waitMs(300);
  });

  run('LOM.2 page mode: title click navigates to /pull/N (no list modal)', () => {
    setListOpenModePref('page', { label: 'LOM.2 page' });
    waitMs(300);
    if (!evalInPage(`location.pathname.includes('/pulls')`)) {
      open(PULLS_URL);
      waitNetwork();
      waitContentInject({ label: 'LOM.2 inject', timeoutMs: 12_000 });
    }
    closeOverlay();
    waitMs(200);
    const clicked = clickPrTitleOnList(DEMO_PR);
    log(`  click: ${JSON.stringify(clicked)}`);
    assert(clicked?.ok, `could not click PR #${DEMO_PR}: ${JSON.stringify(clicked)}`);

    const nav = waitFor(
      `
      const path = location.pathname || '';
      const m = path.match(/\\/pull\\/(\\d+)/);
      if (m && Number(m[1]) === ${Number(DEMO_PR)}) {
        return { ok: true, path, num: m[1] };
      }
      return false;
      `,
      { timeoutMs: 15_000, intervalMs: 200, label: 'LOM.2 navigate to PR page' }
    );
    log(`  nav: ${JSON.stringify(nav)}`);
    assert(nav?.ok, `page mode did not navigate to /pull/${DEMO_PR}: ${JSON.stringify(nav)}`);

    // Give click intercept a moment; must not re-open list-style modal on /pulls
    waitMs(800);
    const p = probe();
    log(`  probe after page open: ${JSON.stringify(p)}`);
    assert(p?.onPr === true, `expected PR page path, got ${p?.path}`);
    assert(
      Number(p?.prNum) === Number(DEMO_PR),
      `expected PR #${DEMO_PR}, got ${p?.prNum}`
    );
    // Path must not still be the pulls list
    assert(
      !p?.onPulls,
      `page mode still on pulls list: ${JSON.stringify(p)}`
    );
  });

  run('LOM.3 restore listOpenMode=modal for following suites', () => {
    // Land back on pulls so prefs stamp applies in list host
    openPulls();
    waitContentInject({ label: 'LOM.3 inject', timeoutMs: 12_000 });
    setListOpenModePref('modal', { label: 'LOM.3 restore modal' });
    waitMs(200);
    const mode = evalInPage(
      `document.documentElement.getAttribute('data-prp-list-open-mode') || ''`
    );
    log(`  restored mode=${mode}`);
    assert(
      mode === 'modal' || mode === '',
      `failed to restore modal mode: ${mode}`
    );
  });

  return steps;
}

export async function runListOpenMode(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
