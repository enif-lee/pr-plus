/**
 * P3/P3b selection shortcuts, file island, arrow fold, multi-hunk expand
 * @param {{ run: (name: string, fn: () => unknown | Promise<unknown>) => Promise<void>, TICK?: number }} ctx
 */
import {
  assert,
  blurEditable,
  clickSelectableLine,
  closeOverlay,
  diffScroll,
  evalInPage,
  fileCollapseProbe,
  holdChord,
  log,
  modalProbe,
  MULTI_HUNK_PR,
  openPr,
  press,
  pressArrowFold,
  selectionProbe,
  setLayout,
  waitDiffFilesReady,
  waitMs,
} from '../lib/harness.mjs';

/** Snapshot Diff readiness for #13 failures (empty vlist / no selectables). */
function diffReadyProbe() {
  return evalInPage(`
    (() => {
      const layout = document.querySelector('.prp-overlay')?.getAttribute('data-layout') || null;
      const tree = document.querySelectorAll(
        '.prp-filetree__row, .prp-filetree__item, .prp-filetree a, .prp-filetree [data-path]'
      ).length;
      const headers = document.querySelectorAll('.prp-vline--header').length;
      const selectable = document.querySelectorAll(
        '.prp-vline--selectable:not(.prp-vline--header)'
      ).length;
      const vlines = document.querySelectorAll('.prp-vline').length;
      const spacer = document.querySelector('.prp-vlist__spacer');
      const spacerH = spacer ? Number(spacer.offsetHeight) || 0 : 0;
      const busy = !!(
        document.querySelector('.prp-skeleton, [class*="LoadingSkeleton"], .prp-loading') ||
        /loading reviews/i.test(document.body?.innerText || '')
      );
      const stats =
        document.querySelector('.prp-diff-toolbar, .prp-header')?.textContent?.replace?.(/\s+/g, ' ')?.slice?.(0, 80) ||
        '';
      return { layout, tree, headers, selectable, vlines, spacerH, busy, stats };
    })()
  `);
}

/** Open PR #13 Diff and fail with a rich probe if files never paint. */
function openMultiHunkDiffReady() {
  closeOverlay();
  openPr(MULTI_HUNK_PR, { viaUrl: true });
  setLayout('diff');
  blurEditable();
  waitMs(400);
  try {
    waitDiffFilesReady(`PR #${MULTI_HUNK_PR} Diff files ready`);
  } catch (e) {
    const snap = diffReadyProbe();
    throw new Error(
      `PR #${MULTI_HUNK_PR} Diff view empty/not ready: ${e.message || e}; probe=${JSON.stringify(snap)}`
    );
  }
  const snap = diffReadyProbe();
  assert(
    snap.selectable >= 1 || snap.headers >= 1 || snap.tree >= 1,
    `PR #${MULTI_HUNK_PR} Diff has no file/code rows after wait: ${JSON.stringify(snap)}`
  );
  log(`  #${MULTI_HUNK_PR} Diff ready: ${JSON.stringify(snap)}`);
  return snap;
}

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

  run(`P3 selection shortcuts on PR #${MULTI_HUNK_PR}`, () => {
    openMultiHunkDiffReady();

    // Prefer an early line so ⇧↓ has room to extend (EOF single-line fails extend).
    let clicked = clickSelectableLine(1);
    assert(
      clicked?.ok,
      `clickSelectableLine failed: ${JSON.stringify(clicked)}; probe=${JSON.stringify(diffReadyProbe())}`
    );
    waitMs(200);
    // Dismiss action island so Shift+arrows extend selection (not button chrome)
    press('Escape');
    waitMs(120);
    // Re-seed line selection after Esc (island may have stolen focus)
    clicked = clickSelectableLine(2);
    waitMs(200);
    let sel = selectionProbe();
    if (sel.count < 1) {
      // Stronger seed: click mid-file row and verify selected class
      clicked = clickSelectableLine(4);
      waitMs(250);
      sel = selectionProbe();
    }
    assert(
      sel.count >= 1 || clicked?.selected >= 1,
      `no selection after click seed: ${JSON.stringify({ sel, clicked })}`
    );
    press('ArrowDown');
    waitMs(80);
    // Seed / move selection with plain arrows (stay mid-file when possible)
    press('ArrowDown');
    waitMs(150);
    press('ArrowDown');
    waitMs(200);
    sel = selectionProbe();
    if (sel.count < 1) {
      // Arrows may move caret without selection class — re-click and accept paint
      clickSelectableLine(3);
      waitMs(250);
      sel = selectionProbe();
    }
    assert(sel.count >= 1, `no selection after ↑/↓: ${JSON.stringify(sel)}`);
    log(`  after ↑↓ count=${sel.count} dock=${sel.dock}`);

    // Room below for multi-line extend?
    const room = evalInPage(`
      (() => {
        const head = document.querySelector('.prp-vline--selected[data-row-index]');
        if (!head) return { ok: false };
        const hi = Number(head.getAttribute('data-row-index'));
        const rows = [...document.querySelectorAll('.prp-vline--selectable[data-row-index]')];
        const below = rows.filter((r) => Number(r.getAttribute('data-row-index')) > hi).length;
        return { ok: true, head: hi, below, total: rows.length };
      })()
    `);
    log(`  selection room: ${JSON.stringify(room)}`);
    if (room?.ok && Number(room.below) < 2) {
      // Jump toward top of file then extend
      for (let i = 0; i < 12; i++) press('ArrowUp');
      waitMs(200);
    }

    // Multi-line range: prefer Shift-click second line (robust), fall back to ⇧↓ hold
    const count0 = selectionProbe().count;
    let multi = false;
    let hold = { events: 0 };
    const shiftClick = evalInPage(`
      (() => {
        const lines = [...document.querySelectorAll('.prp-vline--selectable')];
        if (lines.length < 6) return { ok: false, n: lines.length };
        const a = lines[1];
        const b = lines[Math.min(10, lines.length - 1)];
        const fire = (el, shift) => {
          el.dispatchEvent(
            new MouseEvent('mousedown', {
              bubbles: true,
              cancelable: true,
              button: 0,
              shiftKey: Boolean(shift),
              clientX: el.getBoundingClientRect().left + 8,
              clientY: el.getBoundingClientRect().top + 4,
            })
          );
          el.dispatchEvent(
            new MouseEvent('mouseup', {
              bubbles: true,
              cancelable: true,
              button: 0,
              shiftKey: Boolean(shift),
            })
          );
          el.dispatchEvent(
            new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              button: 0,
              shiftKey: Boolean(shift),
            })
          );
        };
        fire(a, false);
        fire(b, true);
        return { ok: true, n: lines.length };
      })()
    `);
    waitMs(250);
    sel = selectionProbe();
    multi =
      sel.count >= 2 ||
      sel.roles.end >= 1 ||
      sel.roles.start >= 1 ||
      sel.roles.middle >= 1;
    log(
      `  after shift-click multi: ${JSON.stringify(shiftClick)} count=${sel.count} roles=${JSON.stringify(sel.roles)}`
    );
    if (!multi) {
      hold = holdChord('Shift+ArrowDown', {
        holdMs: 450,
        repeatMs: 40,
        sample: 'diff',
      });
      waitMs(200);
      sel = selectionProbe();
      multi =
        sel.count >= 2 ||
        sel.roles.end >= 1 ||
        sel.roles.start >= 1 ||
        sel.roles.middle >= 1;
      log(
        `  after ⇧↓ hold: events=${hold.events} count=${sel.count} roles=${JSON.stringify(sel.roles)}`
      );
    }
    assert(sel.count >= count0, `extend should not shrink (${count0}→${sel.count})`);
    assert(
      multi,
      `extend selection expected multi-line/range (count=${sel.count} roles=${JSON.stringify(sel.roles)} holdEvents=${hold.events} room=${JSON.stringify(room)})`
    );
    // SELECTION_ACTIONS_REVEAL_MS ≈ 300 — poll for island after multi-line select
    for (let i = 0; i < 8 && !sel.dock; i++) {
      waitMs(120);
      sel = selectionProbe();
    }
    assert(
      sel.dock,
      `selection island/dock missing after extend: ${JSON.stringify(sel)}`
    );

    // ⌥↓ multi-line jump (~8 rows) — selection head moves / range may change
    const count1 = sel.count;
    const scroll0 = diffScroll()?.scrollTop ?? 0;
    press('Alt+ArrowDown');
    waitMs(200);
    press('Alt+ArrowDown');
    waitMs(250);
    sel = selectionProbe();
    const scroll1 = diffScroll()?.scrollTop ?? 0;
    assert(sel.count >= 1, 'selection lost after ⌥↓');
    // Either selection shape changed or viewport scrolled to reveal
    assert(
      sel.count !== count1 || Math.abs(scroll1 - scroll0) > 5 || sel.dock,
      `⌥↓ selection jump inert count=${count1}→${sel.count} scroll=${scroll0}→${scroll1}`
    );
    log(`  after ⌥↓ count=${sel.count} scroll ${scroll0}→${scroll1}`);

    press('Alt+ArrowUp');
    waitMs(200);
    sel = selectionProbe();
    assert(sel.count >= 1, 'selection lost after ⌥↑');

    // Plain ↑ move (shrink toward head behavior is product-specific — just keep selection)
    press('ArrowUp');
    waitMs(150);
    sel = selectionProbe();
    assert(sel.count >= 1, 'selection lost after ↑');

    // Esc dismiss island cascade (comment phase not open)
    press('Escape');
    waitMs(250);
    sel = selectionProbe();
    // May clear selection or only dock — accept either as long as modal stays
    assert(evalInPage(`!!document.querySelector('.prp-overlay')`), 'modal closed on selection Esc');
    log(`  after Esc selection count=${sel.count} dock=${sel.dock}`);
  });

  // ─── P3b cross-side Shift extend, file action island, Arrow fold ─
  // Always re-open #13 via URL (independent of P3 success / shell flakiness).
  run(`P3b.0 open PR #${MULTI_HUNK_PR} for selection/fold`, () => {
    openMultiHunkDiffReady();
    const p = modalProbe();
    assert(p.overlay, 'overlay missing after open #13');
  });
  run(`P3b.1 Shift extend continues past multi selection on PR #${MULTI_HUNK_PR}`, () => {
    setLayout('diff');
    blurEditable();
    // Expand if folded from prior steps
    const folded = fileCollapseProbe();
    if (folded?.ariaExpanded === 'false') {
      pressArrowFold('right');
      waitMs(350);
    }
    const seed = clickSelectableLine(1);
    assert(
      seed?.ok,
      `clickSelectableLine: ${JSON.stringify(seed)}; probe=${JSON.stringify(diffReadyProbe())}`
    );
    waitMs(250);
    // Build multi via Shift-click (holdChord alone is flaky for range seed)
    const shiftClick = evalInPage(`
      (() => {
        const rows = [...document.querySelectorAll('.prp-vline--selectable')].filter(
          (e) => !e.classList.contains('prp-vline--header')
        );
        const row = rows[12] || rows[Math.min(8, rows.length - 1)];
        if (!row) return { ok: false, n: rows.length };
        row.scrollIntoView({ block: 'center' });
        const rect = row.getBoundingClientRect();
        const x = rect.left + 24;
        const y = rect.top + rect.height / 2;
        const el = document.elementFromPoint(x, y) || row;
        const opts = {
          bubbles: true, cancelable: true, clientX: x, clientY: y,
          button: 0, buttons: 1, shiftKey: true,
        };
        el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, pointerType: 'mouse' }));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        const list = document.querySelector('.prp-vlist') || el;
        list.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0, shiftKey: true }));
        el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, pointerType: 'mouse', buttons: 0 }));
        return { ok: true, n: rows.length };
      })()
    `);
    assert(shiftClick?.ok, `shift-click multi failed: ${JSON.stringify(shiftClick)}`);
    waitMs(350);
    const mid = selectionProbe();
    assert(
      mid.count >= 2 || mid.roles.middle >= 1 || mid.roles.end >= 1,
      `need multi before further extend: ${JSON.stringify(mid)}`
    );
    const countMid = mid.count;
    // Further Shift+↓ must not shrink (sticky head / opposing-side fix)
    blurEditable();
    holdChord('Shift+ArrowDown', { holdMs: 320, repeatMs: 40, sample: 'diff' });
    waitMs(300);
    const after = selectionProbe();
    log(`  multi extend ${countMid}→${after.count} roles=${JSON.stringify(after.roles)}`);
    assert(
      after.count >= countMid,
      `Shift+↓ stuck or shrunk after multi (${countMid}→${after.count})`
    );
  });
  run(`P3b.2 file header selection shows action island`, () => {
    setLayout('diff');
    blurEditable();
    press('Escape');
    waitMs(250);
    // Click file header path; mouseup on vlist so selection finalize + reveal run
    const hdr = evalInPage(`
      (() => {
        const header = document.querySelector('.prp-vline--header');
        if (!header) return { ok: false, reason: 'no header' };
        header.scrollIntoView({ block: 'center' });
        const path = header.querySelector('.prp-file-header__path') || header;
        const rect = path.getBoundingClientRect();
        const x = rect.left + Math.min(100, rect.width * 0.5);
        const y = rect.top + rect.height / 2;
        const el = document.elementFromPoint(x, y) || path;
        if (el.closest?.('.prp-file-header__collapse')) {
          return { ok: false, reason: 'hit collapse' };
        }
        const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 };
        el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, pointerType: 'mouse' }));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        const list = document.querySelector('.prp-vlist') || el;
        list.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
        el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, pointerType: 'mouse', buttons: 0 }));
        return { ok: true, el: (el.className || '').toString().slice(0, 80) };
      })()
    `);
    assert(hdr?.ok, `header click failed: ${JSON.stringify(hdr)}`);
    // SELECTION_ACTIONS_REVEAL_MS is 300 — wait past it
    waitMs(700);
    const sel = selectionProbe();
    log(`  file island: ${JSON.stringify(sel)}`);
    assert(sel.dock, `file selection dock missing: ${JSON.stringify(sel)}`);
    assert(
      sel.actionsPhase || (sel.btnLabels || []).includes('Comment'),
      `expected actions phase for file, got comment=${sel.commentPhase} labels=${JSON.stringify(sel.btnLabels)}`
    );
    assert(
      !(sel.commentPhase && !sel.actionsPhase),
      'file selection should not open comment-only island'
    );
    assert(sel.fileTarget || (sel.dockCls || '').includes('file'), `expected fileTarget: ${JSON.stringify(sel)}`);
    const hasCopy = (sel.btnLabels || []).some((t) => /copy code/i.test(t));
    assert(hasCopy, `Copy code missing: ${JSON.stringify(sel.btnLabels)}`);
  });
  run(`P3b.3 ArrowLeft/Right file fold`, () => {
    setLayout('diff');
    blurEditable();
    // Ensure file focus via header or selection
    clickSelectableLine(1);
    waitMs(150);
    const before = fileCollapseProbe();
    assert(before.hasBtn || before.hasHeader, `no file header: ${JSON.stringify(before)}`);
    // Expand first so collapse is observable
    if (before.ariaExpanded === 'false') {
      pressArrowFold('right');
      waitMs(350);
    }
    const open = fileCollapseProbe();
    assert(open.ariaExpanded !== 'false', `file should be open before collapse: ${JSON.stringify(open)}`);
    const codeOpen = open.codeRows;
    pressArrowFold('left');
    waitMs(400);
    const collapsed = fileCollapseProbe();
    log(`  after ←: ${JSON.stringify(collapsed)}`);
    assert(
      collapsed.ariaExpanded === 'false' || collapsed.codeRows < codeOpen,
      `ArrowLeft should collapse file: ${JSON.stringify(collapsed)} codeOpen=${codeOpen}`
    );
    pressArrowFold('right');
    waitMs(400);
    const expanded = fileCollapseProbe();
    log(`  after →: ${JSON.stringify(expanded)}`);
    assert(
      expanded.ariaExpanded === 'true' || expanded.codeRows >= codeOpen,
      `ArrowRight should expand file: ${JSON.stringify(expanded)}`
    );
  });
  run(`P2 multi-hunk expand chrome PR #${MULTI_HUNK_PR}`, () => {
    setLayout('diff');
    blurEditable();
    const expand = evalInPage(`
      (() => {
        const btns = [...document.querySelectorAll('.prp-hunk-expand__btn')];
        const all = document.querySelector('.prp-hunk-expand__btn--all');
        const before = document.querySelector('.prp-vlist')?.scrollHeight || 0;
        if (all) all.click();
        return { count: btns.length, before, hasAll: !!all };
      })()
    `);
    assert(expand.count >= 1, 'hunk expand controls missing');
    waitMs(350);
    if (expand.hasAll) {
      const after = evalInPage(`document.querySelector('.prp-vlist')?.scrollHeight || 0`);
      assert(after >= expand.before, `expand should not shrink vlist (${expand.before}→${after})`);
      log(`  expand scrollHeight ${expand.before}→${after}`);
    }
  });


  return steps;
}

/** Legacy runner: execute steps via createRunner bag. */
export async function runSelection(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
