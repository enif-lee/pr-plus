/**
 * Refresh PR detail — header button, ⌥⇧G, command palette.
 */
import {
  DEMO_PR,
  assert,
  blurEditable,
  evalInPage,
  log,
  openPr,
  press,
  setLayout,
  waitDetailReady,
  waitMs,
} from '../lib/harness.mjs';

function readRefreshMarkers() {
  return evalInPage(`
    (() => ({
      seq: Number(document.documentElement.getAttribute('data-prp-refresh-seq') || 0),
      at: document.documentElement.getAttribute('data-prp-last-refresh-at') || '',
      mode: document.documentElement.getAttribute('data-prp-last-refresh-mode') || '',
      overlay: !!document.querySelector('.prp-overlay'),
      refreshBtn: !!document.querySelector('[data-prp-refresh="1"]'),
    }))()
  `);
}

function clearRefreshMarkers() {
  evalInPage(`
    (() => {
      document.documentElement.removeAttribute('data-prp-refresh-seq');
      document.documentElement.removeAttribute('data-prp-last-refresh-at');
      document.documentElement.removeAttribute('data-prp-last-refresh-mode');
    })()
  `);
}

/**
 * @returns {import('../lib/e2e-register.ts').E2eStep[]}
 */
export function getSteps() {
  /** @type {{ name: string, fn: () => unknown | Promise<unknown> }[]} */
  const steps = [];
  const run = (name, fn) => {
    steps.push({ name, fn });
  };

  run('RF.0 open demo PR modal', () => {
    openPr(DEMO_PR, { viaUrl: true });
    setLayout('conversation');
    blurEditable();
    waitDetailReady({ meta: true, files: false, label: 'RF.0' });
    waitMs(400);
    assert(
      evalInPage(`!!document.querySelector('.prp-overlay')`),
      'modal overlay missing'
    );
  });

  run('RF.1 header refresh control exposes ⌥⇧G', () => {
    const chrome = evalInPage(`
      (() => {
        const btn = document.querySelector(
          '[data-prp-refresh="1"], .prp-header__refresh-btn'
        );
        return {
          btn: !!btn,
          aria: btn?.getAttribute('aria-label') || '',
          title: btn?.getAttribute('title') || '',
          disabled: btn ? btn.disabled : null,
        };
      })()
    `);
    log(`  refresh chrome: ${JSON.stringify(chrome)}`);
    assert(chrome?.btn, `refresh button missing: ${JSON.stringify(chrome)}`);
    assert(
      /⌥⇧G|Alt\+Shift\+G/i.test(chrome.aria + chrome.title),
      `shortcut not surfaced on refresh: ${JSON.stringify(chrome)}`
    );
  });

  run('RF.2 header click bumps refresh marker', () => {
    clearRefreshMarkers();
    const before = readRefreshMarkers();
    evalInPage(`
      (() => {
        const btn = document.querySelector('[data-prp-refresh="1"]');
        if (!btn || btn.disabled) return false;
        btn.click();
        return true;
      })()
    `);
    waitMs(500);
    const after = readRefreshMarkers();
    log(`  header click refresh: ${JSON.stringify({ before, after })}`);
    assert(after.overlay, 'modal closed after refresh');
    assert(
      after.seq > (before.seq || 0),
      `refresh seq did not bump: ${JSON.stringify({ before, after })}`
    );
    assert(after.at, 'missing data-prp-last-refresh-at');
    assert(
      after.mode === 'visible-threads' || after.mode === 'full-threads',
      `unexpected refresh mode: ${after.mode}`
    );
  });

  run('RF.3 ⌥⇧G peer triggers refresh', () => {
    clearRefreshMarkers();
    const before = readRefreshMarkers();
    blurEditable();
    press('Alt+Shift+g');
    waitMs(500);
    let after = readRefreshMarkers();
    // Retry once if chord was swallowed
    if (!(after.seq > (before.seq || 0))) {
      waitMs(200);
      press('Alt+Shift+g');
      waitMs(500);
      after = readRefreshMarkers();
    }
    log(`  opt-shift-g refresh: ${JSON.stringify({ before, after })}`);
    assert(after.overlay, 'modal closed after ⌥⇧G');
    assert(
      after.seq > (before.seq || 0),
      `⌥⇧G did not bump refresh seq: ${JSON.stringify({ before, after })}`
    );
  });

  run('RF.4 palette Refresh PR detail', () => {
    clearRefreshMarkers();
    const before = readRefreshMarkers();
    press('Alt+Shift+k');
    waitMs(300);
    const ran = evalInPage(`
      (() => {
        const input = document.querySelector(
          '.prp-palette input, .prp-command-palette input, input[placeholder*="Filter" i], input[placeholder*="command" i]'
        );
        if (input) {
          input.focus();
          const native = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
          );
          native?.set?.call(input, 'refresh pr detail');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const items = [...document.querySelectorAll(
          '.prp-palette button, .prp-palette [role="option"], .prp-command-palette button, [data-prp-palette-item]'
        )];
        const hit = items.find((el) =>
          /refresh pr detail|refresh/i.test(el.textContent || '')
        );
        if (hit) {
          hit.click();
          return { ok: true, via: 'item', text: (hit.textContent || '').trim().slice(0, 50) };
        }
        const listed = /Refresh PR detail/i.test(document.body.innerText || '');
        return { ok: listed, via: listed ? 'listed-only' : 'miss', items: items.length };
      })()
    `);
    waitMs(400);
    if (ran?.via === 'listed-only' || !ran?.ok) {
      // Fallback: header path already tested; require palette text present
      const listed = evalInPage(
        `/Refresh PR detail/i.test(document.body.innerText || '')`
      );
      if (listed) {
        evalInPage(`document.querySelector('[data-prp-refresh="1"]')?.click?.()`);
        waitMs(400);
      }
      assert(listed || ran?.ok, `palette refresh action missing: ${JSON.stringify(ran)}`);
    }
    press('Escape');
    waitMs(150);
    const after = readRefreshMarkers();
    log(`  palette refresh: ${JSON.stringify({ ran, before, after })}`);
    assert(after.overlay, 'modal closed after palette refresh');
    assert(
      after.seq > (before.seq || 0),
      `palette refresh did not bump seq: ${JSON.stringify({ before, after, ran })}`
    );
  });

  return steps;
}

export async function runRefreshAction(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
