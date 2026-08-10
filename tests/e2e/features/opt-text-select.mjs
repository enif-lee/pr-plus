/**
 * Default Diff drag = line selection; Opt/Alt+drag = native browser text selection.
 */
import {
  assert,
  blurEditable,
  clickSelectableLine,
  closeOverlay,
  DEMO_PR,
  evalInPage,
  log,
  MULTI_HUNK_PR,
  openPr,
  selectionProbe,
  setLayout,
  waitDiffFilesReady,
  waitMs,
} from '../lib/harness.mjs';
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

  const clearOptLatch = () =>
    evalInPage(`
      (() => {
        document.documentElement.removeAttribute('data-prp-opt-held');
        document.documentElement.classList.remove('prp-opt-held');
        document.body?.classList?.remove?.('prp-opt-held');
        document.dispatchEvent(
          new CustomEvent('prp-set-opt-hints', {
            detail: { active: false },
            bubbles: true,
          })
        );
        return true;
      })()
    `);

  const setOptLatch = (on) =>
    evalInPage(`
      (() => {
        const on = ${on ? 'true' : 'false'};
        const root = document.documentElement;
        if (on) root.setAttribute('data-prp-opt-held', '1');
        else root.removeAttribute('data-prp-opt-held');
        document.dispatchEvent(
          new CustomEvent('prp-set-opt-hints', {
            detail: { active: on },
            bubbles: true,
          })
        );
        return root.getAttribute('data-prp-opt-held');
      })()
    `);

  const lineSelCount = () =>
    evalInPage(
      `document.querySelectorAll('.prp-vline--selected').length`
    );

  const selectableCount = () =>
    evalInPage(`
      [...document.querySelectorAll('.prp-vline--selectable')].filter(
        (e) => !e.classList.contains('prp-vline--header')
      ).length
    `);

  /** Prefer multi-hunk PR #13 for dense selectable code rows (same as selection e2e). */
  run('OTS.0 open multi-hunk Diff with selectable rows', () => {
    closeOverlay();
    openPr(MULTI_HUNK_PR, { viaUrl: true });
    setLayout('diff');
    blurEditable();
    waitDiffFilesReady(`OTS.0 PR #${MULTI_HUNK_PR} files`);
    clearOptLatch();
    // Scroll virtual list so body lines mount (headers alone are not enough)
    evalInPage(`
      (() => {
        const sc = document.querySelector('.prp-vlist');
        if (!sc) return false;
        const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
        for (const f of [0, 0.15, 0.35, 0.55]) {
          sc.scrollTop = Math.round(max * f);
          sc.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
        return true;
      })()
    `);
    waitMs(400);
    const ready = waitFor(
      `
      const n = [...document.querySelectorAll('.prp-vline--selectable')].filter(
        (e) => !e.classList.contains('prp-vline--header')
      ).length;
      if (n >= 2) return { ok: true, n };
      // nudge scroll if still empty
      const sc = document.querySelector('.prp-vlist');
      if (sc) {
        sc.scrollTop = Math.min(
          sc.scrollHeight,
          (sc.scrollTop || 0) + Math.max(120, sc.clientHeight * 0.6)
        );
        sc.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
      return false;
      `,
      { timeoutMs: 20_000, intervalMs: 300, label: 'OTS.0 selectable rows' }
    );
    log(`  selectable ready: ${JSON.stringify(ready)} count=${selectableCount()}`);
    assert(
      ready?.ok || selectableCount() >= 2,
      `no selectable code rows on Diff: ${JSON.stringify(ready)}`
    );
  });

  run('OTS.1 plain drag / click seeds line selection', () => {
    clearOptLatch();
    // Clear any prior product selection
    evalInPage(`
      (() => {
        document.querySelectorAll('.prp-vline--selected').forEach((el) => {
          el.classList.remove('prp-vline--selected');
        });
        // Escape-ish: blur + click empty
        document.querySelector('.prp-vlist')?.focus?.();
        return true;
      })()
    `);
    pressEscapeSoft();
    waitMs(150);
    const clicked = clickSelectableLine(2);
    log(`  plain click: ${JSON.stringify(clicked)}`);
    assert(clicked?.ok, `plain click failed: ${JSON.stringify(clicked)}`);
    waitMs(300);
    const n = lineSelCount();
    const probe = selectionProbe();
    log(`  after plain: selected=${n} probe=${JSON.stringify(probe)}`);
    assert(
      n >= 1 || Number(probe?.count) >= 1,
      `plain drag/click did not create line selection: n=${n} ${JSON.stringify(probe)}`
    );
  });

  run('OTS.2 Opt+drag does not extend line selection; auto-copies text + toast', () => {
    clearOptLatch();
    // Seed a known line selection first
    clickSelectableLine(1);
    waitMs(250);
    const before = lineSelCount();
    assert(before >= 1, `need seeded line selection before Opt drag, got ${before}`);

    setOptLatch(true);
    waitMs(100);

    // Clear prior copy stamps
    evalInPage(`
      (() => {
        document.documentElement.removeAttribute('data-prp-last-copied-text');
        document.documentElement.removeAttribute('data-prp-last-copy-text-ok');
        return true;
      })()
    `);

    // Opt+mousedown + mousemove; inject a non-empty Selection for auto-copy path.
    // (agent-browser may not paint a real caret range; product still reads getSelection.)
    const drag = evalInPage(`
      (() => {
        const rows = [...document.querySelectorAll('.prp-vline--selectable')].filter(
          (e) => !e.classList.contains('prp-vline--header')
        );
        if (rows.length < 4) return { ok: false, reason: 'few-rows', n: rows.length };
        const a = rows[1];
        const b = rows[Math.min(5, rows.length - 1)];
        a.scrollIntoView({ block: 'center' });
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const code =
          a.querySelector('.prp-code') ||
          a.querySelector('code') ||
          a;
        const x0 = ra.left + Math.min(80, Math.max(24, ra.width * 0.25));
        const y0 = ra.top + ra.height / 2;
        const x1 = rb.left + Math.min(80, Math.max(24, rb.width * 0.25));
        const y1 = rb.top + rb.height / 2;
        const base = {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
          altKey: true,
          clientX: x0,
          clientY: y0,
        };
        document.documentElement.setAttribute('data-prp-opt-held', '1');
        // Cross-world bridge: content-script finish reads this attr / CustomEvent
        // (page-world getSelection stubs are not visible to the extension world).
        const stubText = 'opt-drag-copy-fixture';
        document.documentElement.setAttribute(
          'data-prp-native-select-text',
          stubText
        );
        document.dispatchEvent(
          new CustomEvent('prp-native-text-select-start', {
            bubbles: true,
            detail: {},
          })
        );
        code.dispatchEvent(
          new MouseEvent('mousedown', { ...base, altKey: true })
        );
        b.dispatchEvent(
          new MouseEvent('mousemove', {
            ...base,
            clientX: x1,
            clientY: y1,
            altKey: true,
            buttons: 1,
          })
        );
        document.dispatchEvent(
          new CustomEvent('prp-native-text-select-end', {
            bubbles: true,
            detail: { text: stubText },
          })
        );
        window.dispatchEvent(
          new MouseEvent('mouseup', {
            ...base,
            clientX: x1,
            clientY: y1,
            altKey: true,
            buttons: 0,
            bubbles: true,
          })
        );
        const selected = document.querySelectorAll('.prp-vline--selected').length;
        const cs = getComputedStyle(code);
        return {
          ok: true,
          selected,
          userSelect: cs.userSelect || cs.webkitUserSelect || null,
          optAttr: document.documentElement.getAttribute('data-prp-opt-held'),
          stubText,
        };
      })()
    `);
    log(`  Opt+drag: ${JSON.stringify(drag)}`);
    assert(drag?.ok, `Opt+drag dispatch failed: ${JSON.stringify(drag)}`);

    // Wait for rAF + auto-copy path (stamp proves finishNativeTextSelectCopy ran;
    // clipboard write may be ok:0 under headless permissions).
    waitFor(
      `
      const ok = document.documentElement.getAttribute('data-prp-last-copy-text-ok');
      const text = document.documentElement.getAttribute('data-prp-last-copied-text') || '';
      if ((ok === '1' || ok === '0') && text.includes('opt-drag-copy-fixture')) {
        return { ok: true, copyOk: ok, text: text.slice(0, 40) };
      }
      const toast = document.querySelector(
        '.prp-action-toast, [data-prp-action-toast], .prp-toast'
      );
      const toastText = (toast?.textContent || '').trim();
      if (/copied|복사|コピー|已复制|copy failed|복사 실패|失敗|失败/i.test(toastText)) {
        return { ok: true, via: 'toast', toastText };
      }
      return false;
      `,
      { timeoutMs: 6000, intervalMs: 100, label: 'OTS.2 auto-copy stamp' }
    );
    const stamp = evalInPage(`
      (() => ({
        ok: document.documentElement.getAttribute('data-prp-last-copy-text-ok'),
        text: (document.documentElement.getAttribute('data-prp-last-copied-text') || '').slice(0, 80),
        toast: (document.querySelector('.prp-action-toast, [class*="ActionToast"], [data-prp-action-toast]')?.textContent || '').trim().slice(0, 80),
        actionMsg: document.querySelector('.prp-toast, .prp-action-toast')?.textContent || null,
      }))()
    `);
    log(`  copy stamp: ${JSON.stringify(stamp)}`);
    assert(
      stamp?.ok === '1' ||
        stamp?.ok === '0' ||
        /copied|복사|コピー|已复制|failed|실패|失敗|失败/i.test(
          String(stamp?.toast || stamp?.text || '')
        ),
      `Opt+drag did not run auto-copy path: ${JSON.stringify(stamp)}`
    );
    // Prefer success toast when clipboard is available
    if (stamp?.ok === '1') {
      assert(
        String(stamp.text || '').includes('opt-drag-copy-fixture'),
        `copied stamp missing fixture text: ${JSON.stringify(stamp)}`
      );
    }

    const after = Number(drag.selected) || 0;
    assert(
      after <= before + 1,
      `Opt+drag grew product line selection (line mode leak): before=${before} after=${after}`
    );
  });

  run('OTS.3 after Opt release, plain click restores line selection', () => {
    clearOptLatch();
    setOptLatch(false);
    waitMs(100);
    // Clear selection paint if any
    pressEscapeSoft();
    waitMs(100);
    const clicked = clickSelectableLine(3);
    waitMs(300);
    const n = lineSelCount();
    log(`  restore plain: click=${JSON.stringify(clicked)} selected=${n}`);
    assert(
      n >= 1 || clicked?.selected >= 1,
      `plain line selection broken after Opt gesture: n=${n}`
    );
  });

  run('OTS.4 cleanup Opt latch', () => {
    clearOptLatch();
  });

  return steps;
}

function pressEscapeSoft() {
  evalInPage(`
    (() => {
      const t = document.querySelector('.prp-vlist') || document.body;
      const opts = { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true };
      t.dispatchEvent(new KeyboardEvent('keydown', opts));
      t.dispatchEvent(new KeyboardEvent('keyup', opts));
      return true;
    })()
  `);
}

export async function runOptTextSelect(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
