/**
 * Linear opener-embed — PRPlus.open on linear.app paints the same sheet.
 * @param {{ run: (name: string, fn: () => unknown | Promise<unknown>) => Promise<unknown> }} ctx
 */
import {
  DEMO_PR,
  assert,
  evalInPage,
  modalProbe,
  waitDetailReady,
  waitMs,
} from '../lib/harness.mjs';
import { listTabs, open } from '../lib/ab.mjs';
import {
  LINEAR_ISSUE_ID,
  LINEAR_ISSUE_URL,
  LINEAR_LINKED_PR,
} from '../lib/linear-fixture.mjs';

export const LINEAR_URL = 'https://linear.app';
export { LINEAR_ISSUE_ID, LINEAR_ISSUE_URL, LINEAR_LINKED_PR };

function inspectLinkedPr() {
  const want = `${LINEAR_LINKED_PR.owner}/${LINEAR_LINKED_PR.repo}/pull/${LINEAR_LINKED_PR.number}`;
  return evalInPage(`
    (() => {
      const want = ${JSON.stringify(want)};
      const github = Array.from(document.querySelectorAll('a[href*="github.com"]'))
        .map((el) => el.href || el.getAttribute('href') || '')
        .filter((h) => /\\/pull\\/\\d+/.test(h));
      const reviews = Array.from(document.querySelectorAll('a[href*="/review/"]'))
        .map((el) => ({
          href: el.href || el.getAttribute('href') || '',
          text: String(el.innerText || el.getAttribute('aria-label') || '').trim(),
        }))
        .filter((row) => row.href);
      const preferred = github.find((h) => h.includes(want)) || github[0] || null;
      return { github, reviews, preferred };
    })()
  `);
}

function openLinkedPrViaApi() {
  return evalInPage(`
    (async () => {
      if (!window.PRPlus || typeof window.PRPlus.open !== 'function') {
        return { ok: false, error: 'no-prplus' };
      }
      try {
        const out = await window.PRPlus.open({
          owner: ${JSON.stringify(LINEAR_LINKED_PR.owner)},
          repo: ${JSON.stringify(LINEAR_LINKED_PR.repo)},
          number: ${LINEAR_LINKED_PR.number},
          target: 'opener-embed',
        });
        return { ok: true, out };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    })()
  `);
}

export function probePrPlus() {
  return evalInPage(`
    (() => ({
      href: location.href,
      host: location.hostname,
      prPlus: typeof window.PRPlus,
      version: window.PRPlus && window.PRPlus.version ? window.PRPlus.version : null,
      runtime: document.documentElement.getAttribute('data-prp-runtime'),
      hostEl: !!document.getElementById('prp-modal-host'),
      overlay: !!document.querySelector('.prp-overlay'),
    }))()
  `);
}

export function findExtensionId() {
  try {
    const tabs = listTabs();
    for (const t of tabs || []) {
      const m = String(t.url || '').match(/^chrome-extension:\/\/([a-z]{32})\//i);
      if (m) return m[1];
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Best-effort: open the extension popup and click the Linear Connected-sites chip.
 * Chrome's permission dialog still needs a user click if not already granted.
 */
export function tryGrantLinearViaPopup() {
  const id = findExtensionId();
  if (!id) return { ok: false, error: 'no-extension-id' };
  open(`chrome-extension://${id}/src/popup.html`);
  waitMs(800);
  const click = evalInPage(`
    (() => {
      const btn = document.getElementById('connect-linear');
      if (!btn) return { clicked: false, reason: 'no-button' };
      btn.click();
      return { clicked: true };
    })()
  `);
  waitMs(1500);
  return { ok: true, id, click };
}

export function getSteps() {
  /** @type {{ name: string, fn: () => unknown | Promise<unknown> }[]} */
  const steps = [];
  const run = (name, fn) => {
    steps.push({ name, fn });
  };

  run(`L0 open Linear issue ${LINEAR_ISSUE_ID}`, () => {
    open(LINEAR_ISSUE_URL);
    waitMs(2000);
    const host = evalInPage(`location.hostname || ''`);
    assert(
      String(host) === 'linear.app' || String(host).endsWith('.linear.app'),
      `expected linear.app, got ${host}`
    );
    const href = String(evalInPage(`location.pathname || ''`) || '');
    assert(
      href.includes(`/${LINEAR_ISSUE_ID}`) || href.includes('/issue/PRP-2'),
      `expected ${LINEAR_ISSUE_ID} issue path, got ${href}`
    );
  });

  run('L1 window.PRPlus present (or grant Linear)', () => {
    let probe = probePrPlus();
    console.log('[linear-probe] L1', JSON.stringify(probe));
    if (probe.prPlus !== 'object') {
      const grant = tryGrantLinearViaPopup();
      open(LINEAR_ISSUE_URL);
      waitMs(2000);
      probe = probePrPlus();
      console.log('[linear-probe] L1-after-grant', JSON.stringify({ grant, probe }));
      if (probe.prPlus !== 'object') {
        throw new Error(
          `window.PRPlus missing on linear.app (grant=${JSON.stringify(grant)} probe=${JSON.stringify(probe)}). Grant Linear in the extension popup Connected sites, reload the tab, then re-run.`
        );
      }
    }
  });

  run(`L2 open linked PR ${LINEAR_LINKED_PR.owner}/${LINEAR_LINKED_PR.repo}#${LINEAR_LINKED_PR.number}`, () => {
    const found = inspectLinkedPr();
    console.log('[linear-probe] L2-found', JSON.stringify(found));
    const hasGithub = Array.isArray(found?.github) && found.github.length > 0;
    const hasReview = Array.isArray(found?.reviews) && found.reviews.length > 0;
    assert(
      hasGithub || hasReview,
      `PRP-2 has no linked GitHub PR or Linear review card (${JSON.stringify(found)})`
    );
    if (found?.preferred) {
      const click = evalInPage(`
        (() => {
          const want = ${JSON.stringify(found.preferred)};
          const links = Array.from(document.querySelectorAll('a[href*="github.com"]'));
          const a = links.find((el) => (el.href || el.getAttribute('href') || '') === want)
            || links.find((el) => /\\/pull\\/\\d+/.test(el.href || el.getAttribute('href') || ''));
          if (!a) return { clicked: false };
          a.click();
          return { clicked: true, href: a.href || a.getAttribute('href') };
        })()
      `);
      if (click?.clicked) {
        console.log('[linear-probe] L2-click-github', JSON.stringify(click));
        return;
      }
    }
    if (hasReview) {
      const click = evalInPage(`
        (() => {
          const want = ${JSON.stringify(LINEAR_LINKED_PR.number)};
          const cards = Array.from(document.querySelectorAll('a[href*="/review/"]'));
          const preferred = cards.find((el) => {
            const href = el.href || el.getAttribute('href') || '';
            return /demo-g|c27ffba33fcd/i.test(href);
          }) || cards.find((el) => String(el.getAttribute('aria-label') || el.innerText || '').includes('DEMO-300'))
            || cards[0];
          if (!preferred) return { clicked: false, want };
          preferred.click();
          return {
            clicked: true,
            href: preferred.href || preferred.getAttribute('href'),
          };
        })()
      `);
      if (click?.clicked) {
        console.log('[linear-probe] L2-click-review', JSON.stringify(click));
        return;
      }
    }
    const result = openLinkedPrViaApi();
    console.log('[linear-probe] L2-open', JSON.stringify(result));
    assert(
      result && result.ok !== false,
      `linked review visible but PRPlus.open failed: ${JSON.stringify(result)}`
    );
    if (result.out && result.out.ok === false) {
      throw new Error(`PRPlus.open rejected: ${JSON.stringify(result.out)}`);
    }
  });

  run('L3 overlay sheet + meta-ready on linear.app', () => {
    waitDetailReady({
      number: LINEAR_LINKED_PR.number,
      meta: true,
      timeoutMs: 45_000,
      label: 'linear linked-PR overlay',
    });
    const p = modalProbe();
    assert(p.overlay, 'overlay missing on linear.app');
    assert(p.header && p.header.h > 40, `header missing/short: ${JSON.stringify(p.header)}`);
    const stillLinear = evalInPage(`location.hostname || ''`);
    assert(
      String(stillLinear) === 'linear.app' || String(stillLinear).endsWith('.linear.app'),
      `navigated away from Linear: ${stillLinear}`
    );
    const probe = probePrPlus();
    console.log('[linear-probe] L3', JSON.stringify(probe));
    assert(probe.runtime === 'partner' || probe.hostEl, `runtime=${probe.runtime}`);
  });

  run('L4 shipped PRPlus.open demo PR', () => {
    const result = evalInPage(`
      (async () => {
        if (!window.PRPlus || typeof window.PRPlus.open !== 'function') {
          return { ok: false, error: 'no-prplus' };
        }
        try {
          const out = await window.PRPlus.open({
            owner: 'enif-lee',
            repo: 'pr-plus',
            number: ${DEMO_PR},
            target: 'opener-embed',
          });
          return { ok: true, out };
        } catch (e) {
          return { ok: false, error: String(e && e.message ? e.message : e) };
        }
      })()
    `);
    console.log('[linear-probe] L4-open', JSON.stringify(result));
    assert(
      result && result.ok !== false,
      `PRPlus.open failed: ${JSON.stringify(result)}`
    );
    if (result.out && result.out.ok === false) {
      throw new Error(`PRPlus.open rejected: ${JSON.stringify(result.out)}`);
    }
  });

  run('L5 demo PR overlay + meta-ready on linear.app', () => {
    waitDetailReady({
      number: DEMO_PR,
      meta: true,
      timeoutMs: 45_000,
      label: 'linear PRPlus.open overlay',
    });
    const p = modalProbe();
    assert(p.overlay, 'overlay missing after PRPlus.open');
    assert(p.header && p.header.h > 40, `header missing/short: ${JSON.stringify(p.header)}`);
    const stillLinear = evalInPage(`location.hostname || ''`);
    assert(
      String(stillLinear) === 'linear.app' || String(stillLinear).endsWith('.linear.app'),
      `navigated away from Linear: ${stillLinear}`
    );
    const probe = probePrPlus();
    console.log('[linear-probe] L5', JSON.stringify({ probe, header: p.header }));
  });

  return steps;
}

export async function runLinearOverlay(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
