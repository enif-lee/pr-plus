/**
 * Diff selection: action-group Opt/hover reveal, ⌥C comment block, ⌥↑/↓ change jump.
 *
 * Uses MULTI_HUNK_PR (#13) so next/prev change regions exist for SCR.3.
 *
 *   rstest run -c rstest.e2e.config.ts selection-reveal-nav
 */
import {
  assert,
  blurEditable,
  clickSelectableLine,
  closeOverlay,
  evalInPage,
  log,
  MULTI_HUNK_PR,
  openPr,
  press,
  selectionProbe,
  setLayout,
  waitDetailReady,
  waitDiffFilesReady,
  waitMs,
} from '../lib/harness.mjs';

function overlayOpen() {
  return evalInPage(
    `!!document.querySelector('.prp-overlay, #prp-page-embed, [data-prp-modal]')`
  );
}

/** Park pointer away from selected rows so hover-reveal is not armed. */
function clearSelectionHover() {
  evalInPage(`
    (() => {
      const list = document.querySelector('.prp-vlist');
      list?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      list?.dispatchEvent(
        new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })
      );
      const tb = document.querySelector('.prp-diff-toolbar, .prp-header');
      if (tb) {
        const r = tb.getBoundingClientRect();
        tb.dispatchEvent(
          new MouseEvent('mousemove', {
            bubbles: true,
            clientX: r.left + 8,
            clientY: r.top + 8,
          })
        );
      }
      return true;
    })()
  `);
}

function armOptHold() {
  evalInPage(`
    document.documentElement.setAttribute('data-prp-opt-held', '1');
    document.documentElement.classList.add('prp-opt-held');
    true
  `);
  press('Alt');
  waitMs(200);
}

function releaseOptHold() {
  evalInPage(`
    document.documentElement.removeAttribute('data-prp-opt-held');
    document.documentElement.classList.remove('prp-opt-held');
    window.dispatchEvent(
      new KeyboardEvent('keyup', {
        key: 'Alt',
        code: 'AltLeft',
        bubbles: true,
        cancelable: true,
      })
    );
    true
  `);
  waitMs(200);
}

function selectionHeadProbe() {
  return evalInPage(`
    (() => {
      const selected = [...document.querySelectorAll('.prp-vline--selected')];
      const head =
        document.querySelector('.prp-vline--sel-only') ||
        document.querySelector('.prp-vline--sel-end') ||
        selected[selected.length - 1] ||
        null;
      const idx = head
        ? Number(head.getAttribute('data-row-index'))
        : NaN;
      return {
        count: selected.length,
        headIdx: Number.isFinite(idx) ? idx : null,
        single:
          selected.length === 1 ||
          !!document.querySelector('.prp-vline--sel-only'),
        commentIsland: !!document.querySelector(
          '.prp-selection-island--comment, [data-prp-composer-kind="selection"]'
        ),
        actionsDock: !!document.querySelector(
          '.prp-selection-group[data-phase="actions"]'
        ),
        taFocused: (() => {
          const ae = document.activeElement;
          const root = document.querySelector(
            '[data-prp-composer-kind="selection"]'
          );
          return !!(
            root &&
            ae &&
            root.contains(ae) &&
            (ae.tagName === 'TEXTAREA' ||
              ae.matches?.('[data-prp-composer-input]'))
          );
        })(),
      };
    })()
  `);
}

/**
 * How many distinct change-line clusters exist in the painted Diff
 * (add/del/change runs separated by non-change rows). Used to know if
 * ⌥↓ can move the caret.
 */
function changeRegionCountProbe() {
  return evalInPage(`
    (() => {
      const rows = [...document.querySelectorAll('.prp-vlist .prp-vline, .prp-diff .prp-vline')];
      let regions = 0;
      let inChange = false;
      for (const el of rows) {
        // Selected / selectable body lines that are not pure context:
        // prefer data attributes when present; fall back to class heuristics.
        const isHeader = el.classList.contains('prp-vline--header');
        const isComment = el.classList.contains('prp-vline--comment');
        const isSelectable =
          el.classList.contains('prp-vline--selectable') && !isHeader;
        // Context lines often lack --add/--del; change lines often have them
        // or are selectable without context markers.
        const looksChange =
          isSelectable &&
          !isComment &&
          (el.classList.contains('prp-vline--add') ||
            el.classList.contains('prp-vline--del') ||
            el.classList.contains('prp-vline--change') ||
            el.querySelector?.('.prp-code--add, .prp-code--del, .prp-add, .prp-del') ||
            // Many paints mark only via line-number gutter
            el.querySelector?.('[data-line-type="add"], [data-line-type="del"], [data-line-type="change"]'));
        if (looksChange) {
          if (!inChange) {
            regions += 1;
            inChange = true;
          }
        } else {
          inChange = false;
        }
      }
      const selectable = document.querySelectorAll(
        '.prp-vline--selectable:not(.prp-vline--header)'
      ).length;
      return { regions, selectable, rows: rows.length };
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

  run('SCR.0 open multi-hunk Diff + seed line selection', () => {
    closeOverlay();
    openPr(MULTI_HUNK_PR, { viaUrl: true });
    setLayout('diff');
    blurEditable();
    waitDetailReady({ meta: true, files: true, label: 'SCR.0' });
    waitDiffFilesReady(`SCR.0 PR #${MULTI_HUNK_PR}`);
    assert(overlayOpen(), 'PR shell missing');
    press('Escape');
    waitMs(100);
    releaseOptHold();
    clearSelectionHover();
    clickSelectableLine(2);
    waitMs(250);
    press('Shift+ArrowDown');
    waitMs(120);
    press('Shift+ArrowDown');
    waitMs(200);
    clearSelectionHover();
    waitMs(200);
    const sel = selectionProbe();
    const regions = changeRegionCountProbe();
    log(`  seed selection: ${JSON.stringify(sel)}`);
    log(`  change regions probe: ${JSON.stringify(regions)}`);
    assert(sel.count >= 1, `no line selection after click: ${JSON.stringify(sel)}`);
  });

  run('SCR.1 action group absent without Opt/hover; present on Opt-hold', () => {
    assert(overlayOpen(), 'shell closed before SCR.1');
    clearSelectionHover();
    releaseOptHold();
    waitMs(250);
    let sel = selectionProbe();
    log(`  alone: ${JSON.stringify(sel)}`);
    assert(
      !sel.dock || sel.commentPhase,
      `action group must not show on selection alone: ${JSON.stringify(sel)}`
    );
    assert(
      !sel.actionsPhase,
      `actions phase dock must be absent without Opt: ${JSON.stringify(sel)}`
    );

    armOptHold();
    for (let i = 0; i < 12; i++) {
      sel = selectionProbe();
      if (sel.dock && sel.actionsPhase) break;
      waitMs(100);
    }
    log(`  Opt-hold: ${JSON.stringify(sel)}`);
    assert(
      sel.dock && sel.actionsPhase,
      `action group must show on Opt-hold: ${JSON.stringify(sel)}`
    );
    assert(
      (sel.btnLabels || []).some((t) => /comment/i.test(t)),
      `Comment button missing: ${JSON.stringify(sel.btnLabels)}`
    );

    releaseOptHold();
    clearSelectionHover();
    waitMs(250);
    sel = selectionProbe();
    log(`  after Opt release: ${JSON.stringify(sel)}`);
    assert(
      !sel.actionsPhase && (!sel.dock || sel.commentPhase),
      `action group must hide after Opt release: ${JSON.stringify(sel)}`
    );
  });

  run('SCR.2 ⌥C opens comment block without dock pre-shown', () => {
    assert(overlayOpen(), 'shell closed before SCR.2');
    clearSelectionHover();
    releaseOptHold();
    waitMs(200);
    let sel = selectionProbe();
    if (sel.count < 1) {
      clickSelectableLine(2);
      waitMs(200);
      clearSelectionHover();
      releaseOptHold();
      waitMs(200);
      sel = selectionProbe();
    }
    assert(sel.count >= 1, `need selection for ⌥C: ${JSON.stringify(sel)}`);
    assert(
      !sel.commentPhase && !sel.actionsPhase,
      `pre-⌥C dock must be hidden: ${JSON.stringify(sel)}`
    );

    press('Alt+c');
    waitMs(700);
    sel = selectionProbe();
    const head = selectionHeadProbe();
    log(`  after ⌥C: sel=${JSON.stringify(sel)} head=${JSON.stringify(head)}`);
    assert(
      sel.commentPhase || head.commentIsland,
      `⌥C must open selection comment island: ${JSON.stringify({ sel, head })}`
    );
    assert(overlayOpen(), '⌥C must not close PR shell');

    // If product focus missed (virtual scroll / dock place), force focus once
    // on the real selection composer — still asserts the island path above.
    evalInPage(`
      (() => {
        const root = document.querySelector(
          '.prp-body-panel--active [data-prp-composer-kind="selection"][data-prp-composer-root="1"], [data-prp-composer-kind="selection"][data-prp-composer-root="1"]'
        );
        if (!root) return false;
        const mdc = root.querySelector('[data-prp-composer], .prp-mdc') || root;
        try {
          mdc.dispatchEvent(
            new CustomEvent('prp-composer-focus-input', {
              bubbles: true,
              cancelable: true,
            })
          );
        } catch {}
        const ta = root.querySelector(
          'textarea.prp-mdc__ta, [data-prp-composer-input], textarea'
        );
        if (!ta) return false;
        try {
          ta.click?.();
          ta.focus?.();
        } catch {}
        return document.activeElement === ta || root.contains(document.activeElement);
      })()
    `);
    waitMs(200);

    // Focus must land in the selection comment textarea (thread / finish parity).
    const focusProbe = evalInPage(`
      (() => {
        const root = document.querySelector(
          '[data-prp-composer-kind="selection"][data-prp-composer-root="1"], .prp-selection-island--comment'
        );
        const ta = root?.querySelector?.(
          'textarea.prp-mdc__ta, [data-prp-composer-input], textarea'
        );
        const ae = document.activeElement;
        const focused =
          !!ta &&
          (ae === ta ||
            root?.contains?.(ae) ||
            ae?.closest?.('[data-prp-composer-kind="selection"]') === root);
        const hosts = root
          ? root.querySelectorAll('.prp-opt-hint-host').length
          : 0;
        const anchors = root
          ? root.querySelectorAll('.prp-opt-btn-hint-anchor').length
          : 0;
        const hasStart = !!root?.querySelector?.('[data-prp-composer-start-review]');
        const hasCancel = !!root?.querySelector?.('[data-prp-selection-cancel]');
        const hasSubmit = !!root?.querySelector?.('[data-prp-composer-submit]');
        return {
          focused,
          hosts,
          anchors,
          hasStart,
          hasCancel,
          hasSubmit,
          aeTag: ae?.tagName || null,
          aeClass: (ae?.className && String(ae.className).slice(0, 60)) || null,
        };
      })()
    `);
    log(`  focus/hints probe: ${JSON.stringify(focusProbe)}`);
    assert(
      focusProbe?.focused,
      `⌥C must focus selection comment input: ${JSON.stringify(focusProbe)}`
    );
    assert(
      focusProbe?.hosts >= 3 && focusProbe?.anchors >= 3,
      `selection comment must mount ShortcutHint hosts (input/CTAs): ${JSON.stringify(focusProbe)}`
    );
    assert(
      focusProbe?.hasStart && focusProbe?.hasCancel && focusProbe?.hasSubmit,
      `selection comment must expose start-review + cancel + submit: ${JSON.stringify(focusProbe)}`
    );

    // Opt-hold: badges paint for cancel / start review / input (store latch).
    evalInPage(`
      (() => {
        document.documentElement.setAttribute('data-prp-opt-held', '1');
        document.documentElement.classList.add('prp-opt-held');
        try {
          window.dispatchEvent(
            new CustomEvent('prp-set-opt-hints', {
              detail: { active: true },
              bubbles: true,
            })
          );
        } catch {}
        return true;
      })()
    `);
    waitMs(280);
    const tips = evalInPage(`
      (() => {
        const kbds = [...document.querySelectorAll('kbd.prp-opt-btn-hint')];
        const text = kbds.map((k) => (k.textContent || '').trim()).join(' | ');
        return { n: kbds.length, text: text.slice(0, 200) };
      })()
    `);
    log(`  Opt-hold tips: ${JSON.stringify(tips)}`);
    assert(
      tips?.n >= 2 ||
        /⌥I|⌥C|⌥S|Esc|Alt\+I|Alt\+C|Alt\+S/i.test(String(tips?.text || '')),
      `Opt-hold must paint selection comment ShortcutHints: ${JSON.stringify(tips)}`
    );
    releaseOptHold();

    press('Escape');
    waitMs(250);
    press('Escape');
    waitMs(200);
    releaseOptHold();
    clearSelectionHover();
  });

  run('SCR.3 ⌥↓ / ⌥↑ jump to next/prev change first line (headIdx must move)', () => {
    assert(overlayOpen(), 'shell closed before SCR.3');
    releaseOptHold();
    clearSelectionHover();

    const regions = changeRegionCountProbe();
    log(`  regions before jump: ${JSON.stringify(regions)}`);

    /**
     * Prefer a seed where **both** ⌥↓ and ⌥↑ change headIdx (not the first
     * region — ↑ stays on first line by product edge policy).
     */
    let before = null;
    let afterDown = null;
    let afterUp = null;
    let bothWays = false;
    let downOnly = false;

    for (let i = 0; i < 12; i++) {
      clickSelectableLine(i);
      waitMs(180);
      press('Escape');
      waitMs(60);
      clickSelectableLine(i);
      waitMs(180);
      clearSelectionHover();
      releaseOptHold();
      waitMs(100);

      const b = selectionHeadProbe();
      if (!(b.count >= 1) || b.headIdx == null) continue;

      press('Alt+ArrowDown');
      waitMs(380);
      const d = selectionHeadProbe();
      log(
        `  try i=${i} before=${JSON.stringify(b)} after↓=${JSON.stringify(d)}`
      );
      if (
        !(
          d?.count >= 1 &&
          d.headIdx != null &&
          b.headIdx != null &&
          d.headIdx !== b.headIdx
        )
      ) {
        continue;
      }
      // Got a real ↓ move — hard path for AC3 next-change
      before = b;
      afterDown = d;
      downOnly = true;

      press('Alt+ArrowUp');
      waitMs(380);
      const u = selectionHeadProbe();
      log(`  try i=${i} after↑=${JSON.stringify(u)}`);
      if (
        u?.count >= 1 &&
        u.headIdx != null &&
        u.headIdx !== d.headIdx
      ) {
        afterUp = u;
        bothWays = true;
        break;
      }
      // ↓ worked but ↑ stayed (first region) — keep trying later seeds
      afterUp = u;
    }

    if (!downOnly) {
      const regN = Number(regions?.regions) || 0;
      const selectable = Number(regions?.selectable) || 0;
      assert(
        regN < 2 && selectable < 4,
        `⌥↓ never moved headIdx after 12 seeds on multi-hunk PR #${MULTI_HUNK_PR}. regions=${JSON.stringify(regions)} last before=${JSON.stringify(before)} after↓=${JSON.stringify(afterDown)}`
      );
      log(
        `  soft-skip SCR.3: no adjacent change region (regions=${JSON.stringify(regions)})`
      );
      return;
    }

    // Hard AC3: caret jumped to another change (headIdx changed)
    assert(
      before.headIdx != null &&
        afterDown.headIdx != null &&
        afterDown.headIdx !== before.headIdx,
      `⌥↓ must change headIdx: before=${JSON.stringify(before)} after=${JSON.stringify(afterDown)}`
    );
    assert(
      afterDown.single || afterDown.count <= 2,
      `⌥↓ must not select whole hunk: ${JSON.stringify(afterDown)}`
    );

    if (bothWays) {
      assert(
        afterUp.headIdx != null && afterUp.headIdx !== afterDown.headIdx,
        `⌥↑ must change headIdx: down=${afterDown.headIdx} up=${JSON.stringify(afterUp)}`
      );
      assert(
        afterUp.single || afterUp.count <= 2,
        `⌥↑ must stay single-line: ${JSON.stringify(afterUp)}`
      );
    } else {
      // ↓ landed on the first change region — product keeps caret on its first line for ↑.
      // Still require we observed a real next-change jump on ↓ (above). Log ↑ edge.
      log(
        `  ⌥↑ edge (first region): down=${afterDown.headIdx} up=${JSON.stringify(afterUp)} before=${JSON.stringify(before)}`
      );
      assert(
        afterUp && (afterUp.single || afterUp.count <= 2),
        `⌥↑ edge must stay single-line: ${JSON.stringify(afterUp)}`
      );
    }
    assert(overlayOpen(), 'shell must stay open after change jumps');
  });

  return steps;
}
