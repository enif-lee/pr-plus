/**
 * /pulls row select checkbox: native bulk-select must toggle the checkbox.
 * Regression: click-intercept treated the checkbox as a row click →
 * preventDefault + openModal (checkbox never toggled, pr+ modal opened).
 */
import {
  LIST_PR,
  assert,
  evalInPage,
  log,
  openPulls,
  waitContentInject,
  waitMs,
} from '../lib/harness.mjs';
import { waitFor } from '../lib/ab.mjs';
import { setListOpenModePref } from '../lib/list-open-mode-pref.mjs';

/**
 * Page-side helper source: locate a list row checkbox.
 * @param {number} pr  PR number to scope to a row; 0 = header select-all.
 */
const findCheckboxBody = `
  const rowSel = 'li, .js-issue-row, [id^="issue_"], [data-testid="issue-pr-row"]';
  const findRowCb = (n) => {
    const a = [...document.querySelectorAll('a[href*="/pull/' + n + '"]')].find(
      (el) => (el.textContent || '').trim().length > 2
    );
    const row = a?.closest(rowSel);
    return row?.querySelector('input[type="checkbox"]') || null;
  };
  const findSelectAll = () =>
    [...document.querySelectorAll('input[type="checkbox"]')].find(
      (cb) => !cb.closest(rowSel)
    ) || null;
`;

const probeChrome = () =>
  evalInPage(`
    (() => ({
      overlay: !!document.querySelector('.prp-overlay'),
      embed: !!document.getElementById('prp-page-embed')?.querySelector('.prp-overlay'),
      path: location.pathname,
      busy: document.documentElement.getAttribute('data-prp-load-busy') || null,
    }))()
  `);

function assertStillList(p, label) {
  assert(!p?.overlay, `${label}: pr+ overlay opened on checkbox click`);
  assert(
    /\/pulls(?:\/|$)/.test(String(p?.path || '')),
    `${label}: navigated away from /pulls → ${p?.path}`
  );
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

  run('LCB.0 open pulls + inject + modal mode', () => {
    openPulls();
    waitContentInject({ label: 'LCB.0 inject', timeoutMs: 15_000 });
    waitMs(300);
    // Intercept only runs under listOpenMode=modal — pin it.
    setListOpenModePref('modal', { label: 'LCB.0 modal' });
  });

  run('LCB.1 row checkbox click toggles select (no modal)', () => {
    const found = waitFor(
      `
      ${findCheckboxBody}
      const cb = findRowCb(${Number(LIST_PR)});
      if (!cb) return false;
      cb.scrollIntoView({ block: 'center' });
      return { ok: true };
      `,
      { timeoutMs: 15_000, intervalMs: 250, label: `LCB.1 row checkbox #${LIST_PR}` }
    );
    assert(found?.ok, `row checkbox for PR #${LIST_PR} not found`);

    const r = evalInPage(`
      (() => {
        ${findCheckboxBody}
        const cb = findRowCb(${Number(LIST_PR)});
        if (cb.checked) cb.click(); // normalize: start unchecked
        cb.click();
        return { after: cb.checked };
      })()
    `);
    log(`  checkbox: ${JSON.stringify(r)}`);
    assert(r?.after === true, `checkbox did not toggle on: ${JSON.stringify(r)}`);

    waitMs(700);
    assertStillList(probeChrome(), 'LCB.1');
  });

  run('LCB.2 second click unchecks (no modal)', () => {
    const r = evalInPage(`
      (() => {
        ${findCheckboxBody}
        const cb = findRowCb(${Number(LIST_PR)});
        cb.click();
        return { after: cb.checked };
      })()
    `);
    log(`  checkbox: ${JSON.stringify(r)}`);
    assert(r?.after === false, `checkbox did not toggle off: ${JSON.stringify(r)}`);

    waitMs(500);
    assertStillList(probeChrome(), 'LCB.2');
  });

  run('LCB.3 header select-all click (no modal, restores)', () => {
    // GH select-all flips row selection; the header input itself may report
    // checked=false (indeterminate semantics) — assert on row checkboxes.
    const on = evalInPage(`
      (() => {
        ${findCheckboxBody}
        const all = findSelectAll();
        if (!all) return { found: false };
        all.click();
        return { found: true, rowChecked: document.querySelectorAll('li input[type="checkbox"]:checked').length };
      })()
    `);
    log(`  select-all on: ${JSON.stringify(on)}`);
    assert(on?.found, 'header select-all checkbox not found');
    assert(on.rowChecked > 0, `no row checkboxes selected: ${JSON.stringify(on)}`);

    waitMs(500);
    assertStillList(probeChrome(), 'LCB.3 on');

    const off = evalInPage(`
      (() => {
        ${findCheckboxBody}
        const all = findSelectAll();
        if (!all) return { found: false };
        all.click();
        return { found: true, rowChecked: document.querySelectorAll('li input[type="checkbox"]:checked').length };
      })()
    `);
    assert(off?.found && off.rowChecked === 0, `select-all did not uncheck: ${JSON.stringify(off)}`);
    waitMs(400);
    assertStillList(probeChrome(), 'LCB.3 off');
  });

  return steps;
}

export async function runListCheckbox(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
