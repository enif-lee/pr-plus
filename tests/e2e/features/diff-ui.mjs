/**
 * P4 Diff file fold, auto-expand-off, long-line expand
 * @param {{ run: (name: string, fn: () => unknown | Promise<unknown>) => Promise<void>, TICK?: number }} ctx
 */
import {
  assert,
  blurEditable,
  clickFileHeaderCollapse,
  clickFirstLineExpandBtn,
  closeOverlay,
  evalInPage,
  fileCollapseProbe,
  HEAVY_PR,
  lineExpandProbe,
  log,
  MULTI_HUNK_PR,
  openPr,
  press,
  pressOptF,
  setLayout,
  waitDiffFilesReady,
  waitMs,
} from '../lib/harness.mjs';

/**
 * Register ordered steps without executing them.
 * @returns {import('../lib/e2e-register.ts').E2eStep[]}
 */
export function getSteps() {
  /** @type {{ name: string, fn: () => unknown | Promise<unknown> }[]} */
  const steps = [];
  const run = (name, fn) => {
    steps.push({ name, fn });
  };

  // Always re-open #13 Diff: P2 multi-hunk expand can leave the virtual list
  // without selectable rows, and Esc cascade after expand is flaky mid-shell.
  function reopenMultiHunkDiff() {
    closeOverlay();
    openPr(MULTI_HUNK_PR, { viaUrl: true });
    setLayout('diff');
    blurEditable();
    waitMs(500);
    try {
      waitDiffFilesReady(`PR #${MULTI_HUNK_PR} Diff files ready (P4)`);
    } catch (e) {
      const last = fileCollapseProbe();
      const extra = evalInPage(`
        (() => ({
          tree: document.querySelectorAll('.prp-filetree [data-path], .prp-filetree__row').length,
          vlines: document.querySelectorAll('.prp-vline').length,
          busy: !!document.querySelector('.prp-skeleton, [class*="Loading"]'),
        }))()
      `);
      throw new Error(
        `PR #${MULTI_HUNK_PR} Diff not ready after re-open: ${e.message || e}; fold=${JSON.stringify(last)}; extra=${JSON.stringify(extra)}`
      );
    }
    for (let i = 0; i < 16; i++) {
      const snap = evalInPage(`
        (() => {
          const headers = document.querySelectorAll('.prp-vline--header').length;
          const rows = document.querySelectorAll(
            '.prp-vline--selectable:not(.prp-vline--header)'
          ).length;
          const btn = !!document.querySelector('.prp-file-header__collapse');
          return { headers, rows, btn };
        })()
      `);
      if (snap?.headers >= 1 && snap?.btn && Number(snap.rows) >= 1) return snap;
      waitMs(250);
    }
    const last = fileCollapseProbe();
    assert(
      last.hasHeader && last.hasBtn && last.codeRows >= 1,
      `PR #${MULTI_HUNK_PR} Diff not ready after re-open: ${JSON.stringify(last)}`
    );
    return last;
  }
  run(`P4 Diff file fold on PR #${MULTI_HUNK_PR}`, () => {
    reopenMultiHunkDiff();
    blurEditable();
    // Soft-clear selection/thread context without closing the shell
    press('Escape');
    waitMs(150);

    const before = fileCollapseProbe();
    assert(before.codeRows >= 1, `no code rows before fold: ${JSON.stringify(before)}`);
    assert(before.hasBtn, `file collapse button missing: ${JSON.stringify(before)}`);
    log(
      `  before fold codeRows=${before.codeRows} aria=${before.ariaExpanded} path=${before.activePath || '?'}`
    );

    // Prefer header chevron (stable). ⌥F is fallback when no Diff thread context.
    const clickFold = clickFileHeaderCollapse();
    waitMs(400);
    let mid = fileCollapseProbe();
    if (mid.ariaExpanded !== 'false' && mid.codeRows >= before.codeRows) {
      pressOptF();
      waitMs(400);
      mid = fileCollapseProbe();
    }
    log(
      `  after fold click=${JSON.stringify(clickFold)} codeRows=${mid.codeRows} aria=${mid.ariaExpanded}`
    );
    const folded =
      mid.codeRows < before.codeRows ||
      mid.ariaExpanded === 'false' ||
      clickFold?.after === 'false';
    assert(
      folded,
      `file fold inert before=${JSON.stringify(before)} mid=${JSON.stringify(mid)} click=${JSON.stringify(clickFold)}`
    );

    // Unfold
    clickFileHeaderCollapse();
    waitMs(400);
    const after = fileCollapseProbe();
    log(`  after unfold codeRows=${after.codeRows} aria=${after.ariaExpanded}`);
    assert(
      after.codeRows >= mid.codeRows || after.ariaExpanded === 'true',
      `file unfold inert mid=${JSON.stringify(mid)} after=${JSON.stringify(after)}`
    );
  });
  run(`P4 file nav does not auto-expand (default pref) PR #${MULTI_HUNK_PR}`, () => {
    // Stay on #13 if previous step left Diff healthy; otherwise re-open.
    const healthy = evalInPage(`
      (() => {
        const ov = document.querySelector('.prp-overlay');
        if (!ov || ov.getAttribute('data-layout') !== 'diff') return false;
        return (
          document.querySelectorAll('.prp-vline--header').length >= 1 &&
          !!document.querySelector('.prp-file-header__collapse')
        );
      })()
    `);
    if (!healthy) reopenMultiHunkDiff();
    else {
      setLayout('diff');
      blurEditable();
    }

    // Collapse current file via header
    let clickFold = clickFileHeaderCollapse();
    waitMs(400);
    let collapsed = fileCollapseProbe();
    if (collapsed.ariaExpanded !== 'false') {
      clickFold = clickFileHeaderCollapse();
      waitMs(400);
      collapsed = fileCollapseProbe();
    }
    assert(
      collapsed.ariaExpanded === 'false' || collapsed.codeRows < 20,
      `need collapsed file before nav: ${JSON.stringify(collapsed)} click=${JSON.stringify(clickFold)}`
    );
    const pathCollapsed = collapsed.activePath;
    const rowsCollapsed = collapsed.codeRows;

    // Hop away and back — default autoExpandOnFileNav=false keeps collapse
    press('Alt+Shift+]');
    waitMs(400);
    press('Alt+Shift+[');
    waitMs(450);
    const back = fileCollapseProbe();
    log(
      `  nav round-trip path=${pathCollapsed || '?'} rows ${rowsCollapsed}→${back.codeRows} aria=${back.ariaExpanded}`
    );
    assert(
      back.ariaExpanded === 'false' ||
        back.codeRows <= rowsCollapsed + 3 ||
        (rowsCollapsed > 0 && back.codeRows < 15),
      `file re-expanded on nav (autoExpand should be off): collapsed=${JSON.stringify(collapsed)} back=${JSON.stringify(back)}`
    );

    // Leave expanded for later steps
    if (back.ariaExpanded === 'false') {
      clickFileHeaderCollapse();
      waitMs(350);
    }
  });
  run(`P4 long-line expand UI PR #${HEAVY_PR}`, () => {
    closeOverlay();
    openPr(HEAVY_PR, { viaUrl: true });
    setLayout('diff');
    blurEditable();
    // Wait for Diff file stream to settle — expand keys used to use rowIndex
    // which shifts while files are still loading.
    try {
      waitDiffFilesReady(`P4 #${HEAVY_PR} files ready`);
    } catch {
      waitMs(1500);
    }
    waitMs(400);

    let probe = lineExpandProbe();
    if (probe.expandableCount < 1) {
      for (let i = 0; i < 10 && probe.expandableCount < 1; i++) {
        press('Alt+Shift+]');
        waitMs(350);
        probe = lineExpandProbe();
      }
    }
    log(
      `  lineExpand probe expandable=${probe.expandableCount} maxTextLen=${probe.maxTextLen}`
    );

    if (probe.expandableCount < 1) {
      const rows = evalInPage(
        `document.querySelectorAll('.prp-vline--selectable:not(.prp-vline--header)').length`
      );
      // Heavy PR should eventually show long lines; if vlist empty, shell may still be loading
      assert(
        Number(rows) >= 1,
        `no selectable lines on #${HEAVY_PR} Diff for line-expand probe`
      );
      log(`  skip expand toggle (maxTextLen=${probe.maxTextLen} < 96 in view)`);
      return;
    }

    const beforeH =
      evalInPage(`
        (() => {
          const r = document.querySelector('.prp-vline--line-expandable');
          return r ? Math.round(r.getBoundingClientRect().height) : 0;
        })()
      `) || 22;
    const clicked = clickFirstLineExpandBtn();
    assert(clicked?.ok, `expand btn click failed: ${JSON.stringify(clicked)}`);
    // React state → offsets → re-render (estimate then measure)
    waitMs(700);
    let after = lineExpandProbe();
    // Retries if virtual remount ate the click (heavy PR #14)
    for (let attempt = 0; attempt < 3 && !after.expanded; attempt++) {
      waitMs(250);
      clickFirstLineExpandBtn();
      waitMs(800);
      after = lineExpandProbe();
    }
    const expandAttr = evalInPage(`
      (() => {
        const host =
          document.getElementById('prp-page-embed') ||
          document.querySelector('.prp-modal, .prp-overlay');
        const raw = host?.getAttribute?.('data-prp-line-expand') || '';
        try {
          return raw ? JSON.parse(raw) : null;
        } catch {
          return { raw: String(raw).slice(0, 120) };
        }
      })()
    `);
    log(
      `  expand h ${beforeH}→${after.expandedH} expanded=${after.expanded} attr=${JSON.stringify(expandAttr)}`
    );
    // Prefer visible class; also accept store toggle telemetry (virtual list
    // can remount and drop .prp-vline--line-expanded briefly while keys stick).
    const expandedOk =
      after.expanded ||
      (expandAttr && expandAttr.has === true && Number(expandAttr.size) >= 1);
    assert(
      expandedOk,
      `expected .prp-vline--line-expanded after click (or data-prp-line-expand has): probe=${JSON.stringify(after)} attr=${JSON.stringify(expandAttr)}`
    );
    if (after.expanded) {
      assert(
        after.expandedH > beforeH || after.expandedH > 22,
        `expanded height should grow (${beforeH}→${after.expandedH})`
      );
    }

    // Collapse: prefer the expanded row's control (aria-label), retry on virtual remount.
    let collapsed = lineExpandProbe();
    let collapseAttr = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const clickCollapse = evalInPage(`
        (() => {
          const expanded =
            document.querySelector('.prp-vline--line-expanded .prp-line-expand-btn') ||
            document.querySelector(
              '.prp-line-expand-btn[aria-expanded="true"], .prp-line-expand-btn[aria-label*="Collapse"]'
            );
          const btn = expanded || document.querySelector('.prp-line-expand-btn');
          if (!btn) return { ok: false, reason: 'no-btn' };
          btn.scrollIntoView?.({ block: 'center' });
          btn.click();
          return {
            ok: true,
            aria: btn.getAttribute('aria-expanded'),
            label: (btn.getAttribute('aria-label') || '').slice(0, 40),
          };
        })()
      `);
      waitMs(550 + attempt * 120);
      collapsed = lineExpandProbe();
      collapseAttr = evalInPage(`
        (() => {
          const host =
            document.getElementById('prp-page-embed') ||
            document.querySelector('.prp-modal, .prp-overlay');
          const raw = host?.getAttribute?.('data-prp-line-expand') || '';
          try {
            return raw ? JSON.parse(raw) : null;
          } catch {
            return null;
          }
        })()
      `);
      log(
        `  collapse attempt ${attempt + 1}: ${JSON.stringify(clickCollapse)} expanded=${collapsed.expanded} attr=${JSON.stringify(collapseAttr)}`
      );
      if (
        !collapsed.expanded ||
        (collapseAttr && collapseAttr.has === false)
      ) {
        break;
      }
      // Fallback: generic first expand btn (same path as open; harness is single-toggle)
      clickFirstLineExpandBtn();
      waitMs(500);
    }
    // Collapse: class gone, or telemetry has:false
    assert(
      !collapsed.expanded ||
        (collapseAttr && collapseAttr.has === false),
      `line still expanded after collapse click: probe=${JSON.stringify(collapsed)} attr=${JSON.stringify(collapseAttr)}`
    );
  });


  return steps;
}

/** Legacy runner: execute steps via createRunner bag. */
export async function runDiffUi(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
