/**
 * Diff review-filter toggles: status chips + gear hide-outdated / authors.
 * Asserts real DOM pressed/checked state changes (not a reimplemented filter oracle).
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
  waitDiffFilesReady,
  waitMs,
} from '../lib/harness.mjs';

/**
 * @returns {import('../lib/e2e-register.ts').E2eStep[]}
 */
export function getSteps() {
  /** @type {{ name: string, fn: () => unknown | Promise<unknown> }[]} */
  const steps = [];
  const run = (name, fn) => {
    steps.push({ name, fn });
  };

  function ensureDiff() {
    if (!evalInPage(`!!document.querySelector('.prp-overlay')`)) {
      openPr(DEMO_PR, { viaUrl: true });
    }
    setLayout('diff');
    blurEditable();
    waitDiffFilesReady(`review-filter PR #${DEMO_PR} Diff files ready`);
    // Find-in-diff replaces review-filter chrome — close it.
    for (let i = 0; i < 3; i++) {
      const searchOpen = evalInPage(`
        !!document.querySelector(
          '.prp-diff-toolbar__thread-tools--search, .prp-search-bar, input[placeholder*="Find in diff" i]'
        )
      `);
      if (!searchOpen) break;
      press('Escape');
      waitMs(150);
    }
  }

  function probeChips() {
    return evalInPage(`
      (() => {
        const btns = Array.from(
          document.querySelectorAll('.prp-review-filter__btn')
        );
        return btns.map((b) => {
          const text = (b.textContent || '').replace(/\\s+/g, ' ').trim();
          const m = text.match(/^(Unresolved|Resolved|Pending)/i);
          return {
            text,
            kind: m ? m[1].toLowerCase() : null,
            on:
              b.getAttribute('aria-pressed') === 'true' ||
              b.classList.contains('prp-review-filter__btn--on'),
          };
        });
      })()
    `);
  }

  function clickChip(kind) {
    return evalInPage(`
      (() => {
        const want = ${JSON.stringify(String(kind).toLowerCase())};
        const btns = Array.from(
          document.querySelectorAll('.prp-review-filter__btn')
        );
        for (const b of btns) {
          const text = (b.textContent || '').replace(/\\s+/g, ' ').trim();
          const m = text.match(/^(Unresolved|Resolved|Pending)/i);
          const k = m ? m[1].toLowerCase() : '';
          if (k === want) {
            b.click();
            return {
              clicked: true,
              text,
              on:
                b.getAttribute('aria-pressed') === 'true' ||
                b.classList.contains('prp-review-filter__btn--on'),
            };
          }
        }
        return { clicked: false };
      })()
    `);
  }

  function openGearMenu() {
    evalInPage(`
      (() => {
        const gear = document.querySelector('[data-prp-review-filter-gear="1"]');
        if (gear) gear.click();
        return !!gear;
      })()
    `);
    waitMs(250);
  }

  function probeGear() {
    return evalInPage(`
      (() => {
        const menu = document.querySelector('[data-prp-review-filter-menu="1"]');
        if (!menu) return { menuOpen: false };
        const hideOd = menu.querySelector('[data-prp-hide-outdated="1"]');
        // Fallback: label text when data attr missing on older builds
        const hideOdInput =
          hideOd ||
          Array.from(menu.querySelectorAll('input[type="checkbox"]')).find(
            (el) =>
              /outdated/i.test(
                (el.closest('label')?.textContent || el.parentElement?.textContent || '')
              )
          ) ||
          null;
        const authorInputs = Array.from(
          menu.querySelectorAll(
            '.prp-diff-review-settings__row--author input[type="checkbox"]'
          )
        );
        return {
          menuOpen: true,
          hideOutdated: hideOdInput
            ? {
                checked: !!hideOdInput.checked,
                disabled: !!hideOdInput.disabled,
              }
            : null,
          authors: authorInputs.map((el) => ({
            checked: !!el.checked,
            login: (
              el
                .closest('label')
                ?.querySelector('.prp-diff-review-settings__author-login')
                ?.textContent || ''
            )
              .trim()
              .toLowerCase(),
          })),
        };
      })()
    `);
  }

  run('RF.0 open Diff for review-filter', () => {
    ensureDiff();
    // Wait for gear (thread chrome)
    let hasGear = false;
    for (let i = 0; i < 16; i++) {
      hasGear = !!evalInPage(
        `!!document.querySelector('[data-prp-review-filter-gear="1"]')`
      );
      if (hasGear) break;
      waitMs(300);
    }
    assert(hasGear, 'review filter gear missing after Diff open');
    // The gear belongs to the Diff shell and can paint before async review
    // threads populate the status counts/chips. Wait for the actual control
    // under test instead of treating shell readiness as thread readiness.
    let chips = probeChips();
    for (
      let i = 0;
      i < 40 && !(chips || []).some((c) => c.kind === 'unresolved');
      i++
    ) {
      waitMs(250);
      chips = probeChips();
    }
    log('RF.0 chips', chips);
    // On demo PR with threads, Unresolved chip should exist
    const unresolved = (chips || []).find((c) => c.kind === 'unresolved');
    assert(
      unresolved,
      `Unresolved chip missing: ${JSON.stringify(chips)}`
    );
  });

  run('RF.1 toggle Resolved status chip (aria-pressed flips)', () => {
    ensureDiff();
    waitMs(200);
    const before = probeChips();
    const resolvedBefore = (before || []).find((c) => c.kind === 'resolved');
    if (!resolvedBefore) {
      // Some PRs may lack a Resolved chip UI if zero resolved threads —
      // still require Unresolved toggle as fallback proof of multi-select.
      const unresBefore = (before || []).find((c) => c.kind === 'unresolved');
      assert(unresBefore, `no status chips: ${JSON.stringify(before)}`);
      const wasOn = !!unresBefore.on;
      const click = clickChip('unresolved');
      assert(click?.clicked, `click Unresolved failed: ${JSON.stringify(click)}`);
      waitMs(350);
      const after = probeChips();
      const unresAfter = (after || []).find((c) => c.kind === 'unresolved');
      assert(
        unresAfter && unresAfter.on !== wasOn,
        `Unresolved aria-pressed did not flip before=${JSON.stringify(before)} after=${JSON.stringify(after)}`
      );
      // Restore default-ish: click again so later steps see Unresolved on
      clickChip('unresolved');
      waitMs(200);
      log('RF.1 toggled Unresolved (no Resolved chip)');
      return;
    }
    const wasOn = !!resolvedBefore.on;
    const click = clickChip('resolved');
    assert(click?.clicked, `click Resolved failed: ${JSON.stringify(click)}`);
    waitMs(350);
    const after = probeChips();
    const resolvedAfter = (after || []).find((c) => c.kind === 'resolved');
    assert(
      resolvedAfter && resolvedAfter.on !== wasOn,
      `Resolved aria-pressed did not flip before=${JSON.stringify(before)} after=${JSON.stringify(after)}`
    );
    // Second toggle restores prior state for subsequent steps
    clickChip('resolved');
    waitMs(200);
    const restored = probeChips();
    const r2 = (restored || []).find((c) => c.kind === 'resolved');
    assert(
      r2 && r2.on === wasOn,
      `Resolved did not restore: was=${wasOn} now=${JSON.stringify(restored)}`
    );
    log('RF.1 Resolved toggle OK', { wasOn, after: resolvedAfter });
  });

  run('RF.2 gear: toggle Hide outdated comments', () => {
    ensureDiff();
    openGearMenu();
    let gear = probeGear();
    for (let i = 0; i < 6 && !gear?.menuOpen; i++) {
      openGearMenu();
      gear = probeGear();
    }
    assert(gear?.menuOpen, `gear menu not open: ${JSON.stringify(gear)}`);
    assert(
      gear?.hideOutdated,
      `Hide outdated control missing: ${JSON.stringify(gear)}`
    );
    const wasChecked = !!gear.hideOutdated.checked;
    // Click the checkbox (or its label)
    const toggled = evalInPage(`
      (() => {
        const menu = document.querySelector('[data-prp-review-filter-menu="1"]');
        if (!menu) return { ok: false, reason: 'no-menu' };
        let input = menu.querySelector('[data-prp-hide-outdated="1"]');
        if (!input) {
          input = Array.from(
            menu.querySelectorAll('input[type="checkbox"]')
          ).find((el) =>
            /outdated/i.test(
              (el.closest('label')?.textContent || '')
            )
          );
        }
        if (!input) return { ok: false, reason: 'no-input' };
        const label = input.closest('label');
        if (label) label.click();
        else input.click();
        return { ok: true, checked: !!input.checked };
      })()
    `);
    assert(toggled?.ok, `hide outdated click failed: ${JSON.stringify(toggled)}`);
    waitMs(400);
    const after = probeGear();
    assert(
      after?.menuOpen && after?.hideOutdated,
      `menu closed after toggle: ${JSON.stringify(after)}`
    );
    assert(
      after.hideOutdated.checked !== wasChecked,
      `Hide outdated checked did not flip was=${wasChecked} now=${JSON.stringify(after)}`
    );
    // Restore
    evalInPage(`
      (() => {
        const menu = document.querySelector('[data-prp-review-filter-menu="1"]');
        let input = menu?.querySelector('[data-prp-hide-outdated="1"]');
        if (!input) {
          input = Array.from(
            menu?.querySelectorAll('input[type="checkbox"]') || []
          ).find((el) =>
            /outdated/i.test((el.closest('label')?.textContent || ''))
          );
        }
        if (!input) return false;
        const label = input.closest('label');
        if (label) label.click();
        else input.click();
        return true;
      })()
    `);
    waitMs(200);
    log('RF.2 hide outdated toggle OK', { wasChecked, after: after.hideOutdated });
  });

  run('RF.3 gear: author checkbox toggles when authors present', () => {
    ensureDiff();
    openGearMenu();
    let gear = probeGear();
    for (let i = 0; i < 6 && !gear?.menuOpen; i++) {
      openGearMenu();
      gear = probeGear();
    }
    assert(gear?.menuOpen, `gear menu not open: ${JSON.stringify(gear)}`);
    const authors = Array.isArray(gear.authors) ? gear.authors : [];
    if (!authors.length) {
      log('RF.3 skip — no review authors listed yet');
      // Close menu
      evalInPage(`
        (() => {
          const gear = document.querySelector('[data-prp-review-filter-gear="1"]');
          if (gear) gear.click();
        })()
      `);
      return;
    }
    const first = authors[0];
    const wasChecked = !!first.checked;
    const clickAuth = evalInPage(`
      (() => {
        const menu = document.querySelector('[data-prp-review-filter-menu="1"]');
        const row = menu?.querySelector(
          '.prp-diff-review-settings__row--author input[type="checkbox"]'
        );
        if (!row) return { ok: false };
        const label = row.closest('label');
        if (label) label.click();
        else row.click();
        return { ok: true, checked: !!row.checked };
      })()
    `);
    assert(clickAuth?.ok, `author click failed: ${JSON.stringify(clickAuth)}`);
    waitMs(400);
    const after = probeGear();
    const afterFirst = (after?.authors || [])[0];
    assert(
      afterFirst && afterFirst.checked !== wasChecked,
      `author checked did not flip was=${wasChecked} after=${JSON.stringify(after)}`
    );
    // Restore
    evalInPage(`
      (() => {
        const menu = document.querySelector('[data-prp-review-filter-menu="1"]');
        const row = menu?.querySelector(
          '.prp-diff-review-settings__row--author input[type="checkbox"]'
        );
        if (!row) return;
        const label = row.closest('label');
        if (label) label.click();
        else row.click();
      })()
    `);
    waitMs(150);
    evalInPage(`
      (() => {
        const gear = document.querySelector('[data-prp-review-filter-gear="1"]');
        if (gear) gear.click();
      })()
    `);
    log('RF.3 author toggle OK', { login: first.login, wasChecked });
  });

  return steps;
}

/** Legacy bag runner entry. */
export async function runReviewFilter() {
  const { createRunner } = await import('../lib/runner.mjs');
  const { ensureBrowser, closeAll, log: l } = await import('../lib/harness.mjs');
  const { run, report } = createRunner();
  l('=== review-filter e2e ===');
  ensureBrowser();
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
  closeAll();
  return report('review-filter');
}
