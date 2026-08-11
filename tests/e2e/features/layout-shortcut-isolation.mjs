/**
 * Diff ↔ Conversation side-action isolation.
 * Diff: Conversation meta chords (labels / milestone / reviewer / assignee) must not open pickers.
 * Conversation: Diff-only file chords must not mutate Diff keep-alive SoT markers.
 * Diff positive: a Diff-owned chord changes a real Diff marker (scroll / active file).
 */
import {
  DEMO_PR,
  assert,
  blurEditable,
  evalInPage,
  layout,
  log,
  openPr,
  press,
  setLayout,
  waitMs,
} from '../lib/harness.mjs';
import { TICK } from '../lib/runner.mjs';

/**
 * @returns {import('../lib/e2e-register.ts').E2eStep[]}
 */
export function getSteps() {
  /** @type {{ name: string, fn: () => unknown | Promise<unknown> }[]} */
  const steps = [];
  const run = (name, fn) => {
    steps.push({ name, fn });
  };

  const pickerOpen = () =>
    evalInPage(
      `!!document.querySelector('[data-prp-sselect="1"], .prp-sselect-panel')`
    );

  const pickerTitle = () =>
    evalInPage(`
      (() => {
        const p = document.querySelector('[data-prp-sselect="1"], .prp-sselect-panel');
        return p?.getAttribute('aria-label') ||
          p?.querySelector('.prp-sselect-title')?.textContent ||
          null;
      })()
    `);

  const convAsideVisible = () =>
    evalInPage(`
      (() => {
        const panel = document.querySelector('.prp-body-panel--conversation');
        if (!panel) return false;
        const active = panel.classList.contains('prp-body-panel--active');
        const cs = getComputedStyle(panel);
        return active && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none';
      })()
    `);

  const diffPanelVisible = () =>
    evalInPage(`
      (() => {
        const panel = document.querySelector('.prp-body-panel--diff');
        if (!panel) return false;
        const active = panel.classList.contains('prp-body-panel--active');
        const cs = getComputedStyle(panel);
        return active && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none';
      })()
    `);

  /**
   * Diff keep-alive SoT snapshot (reads keep-alive panel DOM even when inert).
   * Catches broken gates that mutate active file / viewed / scroll without
   * switching layout.
   */
  const diffSotProbe = () =>
    evalInPage(`
      (() => {
        const root = document.querySelector('.prp-body-panel--diff') || document;
        const active =
          root.querySelector('.prp-filetree__item--active') ||
          root.querySelector('.prp-filetree [aria-current]');
        const path =
          active?.getAttribute('data-file-path') ||
          active?.getAttribute('data-path') ||
          (active?.textContent || '').trim().slice(0, 80) ||
          null;
        const viewed = [...root.querySelectorAll('.prp-filetree__viewed input')]
          .map((inp) => ({
            path:
              inp.closest('[data-file-path]')?.getAttribute('data-file-path') ||
              '',
            checked: !!inp.checked,
          }))
          .filter((x) => x.path)
          .sort((a, b) => a.path.localeCompare(b.path));
        const vlist =
          root.querySelector('.prp-vlist') ||
          document.querySelector('.prp-body-panel--diff .prp-vlist');
        return {
          path,
          viewed,
          scrollTop: vlist ? vlist.scrollTop : null,
          scrollHeight: vlist ? vlist.scrollHeight : null,
          clientHeight: vlist ? vlist.clientHeight : null,
        };
      })()
    `);

  const fireOptShift = (letter) => {
    const code = `Key${letter.toUpperCase()}`;
    evalInPage(`
      (() => {
        const t = window;
        const opts = {
          key: '${letter.toLowerCase()}',
          code: '${code}',
          altKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
          composed: true,
        };
        t.dispatchEvent(new KeyboardEvent('keydown', opts));
        t.dispatchEvent(new KeyboardEvent('keyup', opts));
        return true;
      })()
    `);
    waitMs(400);
  };

  const fireOptShiftChord = (key, code) => {
    evalInPage(`
      (() => {
        const opts = {
          key: ${JSON.stringify(key)},
          code: ${JSON.stringify(code)},
          altKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
          composed: true,
        };
        window.dispatchEvent(new KeyboardEvent('keydown', opts));
        window.dispatchEvent(new KeyboardEvent('keyup', opts));
        return true;
      })()
    `);
    waitMs(Math.max(TICK, 250));
  };

  run('P-ISO.0 ensure modal shell', () => {
    if (!evalInPage(`!!document.querySelector('.prp-overlay')`)) {
      openPr(DEMO_PR);
    }
    assert(
      evalInPage(`!!document.querySelector('.prp-overlay')`),
      'modal overlay missing'
    );
  });

  run('P-ISO.1 Diff: Conversation meta chords do not open pickers', () => {
    setLayout('diff');
    assert(layout() === 'diff', `expected diff layout, got ${layout()}`);
    assert(diffPanelVisible(), 'Diff panel should be visible active surface');
    assert(!convAsideVisible(), 'Conversation panel must not be visible on Diff');

    // Close any leftover picker
    if (pickerOpen()) {
      press('Escape');
      waitMs(200);
    }

    for (const [letter, label] of [
      ['L', 'labels'],
      ['P', 'milestone'],
      ['A', 'assignee'],
      // R is viewed-toggle on Diff — must not open Add reviewer
      ['R', 'reviewer'],
    ]) {
      fireOptShift(letter);
      assert(
        !pickerOpen(),
        `Diff layout: ⌥⇧${letter} (${label}) must not open meta picker (got ${pickerTitle()})`
      );
    }
    log('Diff blocked Conversation meta chords');
  });

  run('P-ISO.2 Conversation: positive control opens labels picker', () => {
    setLayout('conversation');
    assert(
      layout() === 'conversation',
      `expected conversation, got ${layout()}`
    );
    assert(convAsideVisible(), 'Conversation panel should be visible');
    assert(!diffPanelVisible(), 'Diff panel must not be visible on Conversation');

    if (pickerOpen()) {
      press('Escape');
      waitMs(200);
    }
    fireOptShift('L');
    assert(pickerOpen(), 'Conversation: ⌥⇧L should open labels picker');
    const title = String(pickerTitle() || '');
    assert(
      /label/i.test(title),
      `expected labels picker title, got ${title}`
    );
    press('Escape');
    waitMs(250);
    assert(!pickerOpen(), 'Esc should close labels picker');
    log('Conversation labels positive control ok');
  });

  run('P-ISO.3 Conversation: Diff-only chords leave Diff SoT unchanged', () => {
    // Visit Diff first so keep-alive Diff panel has real file/scroll state
    setLayout('diff');
    waitMs(200);
    setLayout('conversation');
    assert(layout() === 'conversation', 'must be Conversation');
    assert(!diffPanelVisible(), 'Diff panel must not be the visible surface');
    if (pickerOpen()) {
      press('Escape');
      waitMs(200);
    }

    const before = diffSotProbe();
    assert(
      before && (before.path != null || before.scrollTop != null),
      `Diff keep-alive SoT missing (path/scroll): ${JSON.stringify(before)}`
    );

    // Diff-only only (not ⌥⇧R — that is Add reviewer on Conversation).
    // file prev/next + page scroll must not mutate keep-alive Diff SoT.
    fireOptShiftChord('[', 'BracketLeft');
    fireOptShiftChord(']', 'BracketRight');
    fireOptShiftChord('ArrowDown', 'ArrowDown');
    fireOptShiftChord('ArrowUp', 'ArrowUp');
    waitMs(200);

    const after = diffSotProbe();
    assert(layout() === 'conversation', 'must remain Conversation');
    assert(
      !evalInPage(
        `document.querySelector('.prp-body-panel--diff.prp-body-panel--active') != null`
      ),
      'Diff panel must not become active'
    );
    assert(!pickerOpen(), 'Diff-only chords must not open a picker');
    assert(
      JSON.stringify(before.path) === JSON.stringify(after.path),
      `active file path mutated under Conversation: ${before.path} → ${after.path}`
    );
    assert(
      JSON.stringify(before.viewed) === JSON.stringify(after.viewed),
      `viewed set mutated under Conversation: ${JSON.stringify(before.viewed)} → ${JSON.stringify(after.viewed)}`
    );
    assert(
      Number(before.scrollTop) === Number(after.scrollTop),
      `Diff vlist scrollTop mutated under Conversation: ${before.scrollTop} → ${after.scrollTop}`
    );
    log(
      `Conversation Diff-SoT stable path=${after.path || '?'} scroll=${after.scrollTop}`
    );
  });

  run('P-ISO.4 Diff: Diff-owned positive control mutates Diff marker', () => {
    setLayout('diff');
    blurEditable();
    assert(diffPanelVisible(), 'Diff surface active');
    if (pickerOpen()) {
      press('Escape');
      waitMs(200);
    }

    // Blocked Conversation meta still no-ops
    fireOptShift('L');
    fireOptShift('P');
    assert(
      !pickerOpen(),
      `meta pickers must stay closed on Diff (got ${pickerTitle()})`
    );

    // Positive Diff-owned control: ⌥⇧↓ page scroll moves Diff vlist
    evalInPage(`
      (() => {
        document.documentElement.removeAttribute('data-prp-opt-held');
        document.documentElement.classList.remove('prp-opt-held');
        const el = document.querySelector(
          '.prp-body-panel--diff.prp-body-panel--active .prp-vlist, .prp-vlist'
        );
        if (el) el.scrollTop = 0;
        return true;
      })()
    `);
    waitMs(200);
    const before = diffSotProbe();
    assert(before && before.scrollTop != null, 'Diff vlist missing for scroll probe');
    const maxScroll = Math.max(
      0,
      Number(before.scrollHeight || 0) - Number(before.clientHeight || 0)
    );

    fireOptShiftChord('ArrowDown', 'ArrowDown');
    fireOptShiftChord('ArrowDown', 'ArrowDown');
    waitMs(150);
    let after = diffSotProbe();
    let pageDelta = Number(after.scrollTop) - Number(before.scrollTop);

    // Fallback: harness press delivery if synthetic event was ignored
    if (pageDelta < 20 && maxScroll > 40) {
      press('Alt+Shift+ArrowDown');
      waitMs(TICK);
      press('Alt+Shift+ArrowDown');
      waitMs(TICK);
      after = diffSotProbe();
      pageDelta = Number(after.scrollTop) - Number(before.scrollTop);
    }

    if (maxScroll > 40) {
      assert(
        pageDelta >= 20,
        `Diff ⌥⇧↓ must move vlist (delta=${pageDelta}, maxScroll=${maxScroll})`
      );
    } else {
      // Tiny diff: still require Diff-owned filetree/active path present
      assert(
        !!after.path ||
          evalInPage(`!!document.querySelector('.prp-body-panel--diff .prp-filetree')`),
        'Diff chrome (filetree/active path) required as positive surface marker'
      );
      log(`  short diff maxScroll=${maxScroll} — surface marker only`);
    }

    assert(layout() === 'diff', 'layout must remain Diff');
    assert(diffPanelVisible(), 'Diff surface still active');
    log(`Diff positive page-scroll delta=${pageDelta} path=${after.path || '?'}`);
  });

  return steps;
}

export default { getSteps };
