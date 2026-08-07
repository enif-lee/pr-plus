/**
 * Nested Escape: Diff settings / picker / input blur must not close PR shell.
 *
 *   rstest run -c rstest.e2e.config.ts esc-nested
 */
import {
  assert,
  blurEditable,
  DEMO_PR,
  evalInPage,
  log,
  openPr,
  press,
  setLayout,
  waitDetailReady,
  waitDiffFilesReady,
  waitMs,
} from '../lib/harness.mjs';

function overlayOpen() {
  return evalInPage(
    `!!document.querySelector('.prp-overlay, .prp-modal, [data-prp-modal], #prp-page-embed')`
  );
}

function settingsOpen() {
  return evalInPage(
    `!!document.querySelector('[data-prp-review-filter-menu="1"], .prp-diff-review-settings--portal')`
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

  run('ESC.0 open DEMO_PR Diff', () => {
    openPr(DEMO_PR, { viaUrl: true });
    setLayout('diff');
    blurEditable();
    waitDetailReady({ meta: true, files: true, label: 'ESC.0' });
    waitDiffFilesReady('ESC.0');
    assert(overlayOpen(), 'PR modal overlay missing');
  });

  run('ESC.1 Diff settings Esc closes menu only', () => {
    blurEditable();
    // Open gear settings
    const opened = evalInPage(`
      (() => {
        const gear = document.querySelector(
          '[data-prp-review-filter-gear="1"], button[aria-label*="settings" i], button[aria-label*="View settings" i]'
        );
        if (!gear) return { ok: false, reason: 'no-gear' };
        gear.scrollIntoView?.({ block: 'nearest' });
        gear.click();
        return {
          ok: true,
          expanded: gear.getAttribute('aria-expanded'),
        };
      })()
    `);
    log(`  open settings: ${JSON.stringify(opened)}`);
    waitMs(350);
    const t0 = Date.now();
    let open = false;
    while (Date.now() - t0 < 4000) {
      open = settingsOpen();
      if (open) break;
      waitMs(150);
    }
    assert(open, `Diff settings menu did not open: ${JSON.stringify(opened)}`);
    assert(overlayOpen(), 'shell must stay open with settings');

    press('Escape');
    waitMs(350);
    assert(
      !settingsOpen(),
      'Esc must close Diff settings menu'
    );
    assert(
      overlayOpen(),
      'Esc on Diff settings must not close PR shell'
    );
  });

  run('ESC.2 SearchableSelect / store picker Esc keeps shell', () => {
    // Open commit or file filter picker if present; else open label/assignee via
    // Conversation chrome is optional — try Diff commit filter first.
    blurEditable();
    const tryOpen = evalInPage(`
      (() => {
        // Common Diff toolbar commit/filter triggers
        const candidates = [
          ...document.querySelectorAll(
            'button[aria-haspopup], button[aria-label*="commit" i], button[aria-label*="filter" i], .prp-diff-toolbar button, .prp-sselect-trigger'
          ),
        ];
        for (const b of candidates) {
          const lab = (
            (b.getAttribute('aria-label') || '') +
            (b.textContent || '')
          ).toLowerCase();
          if (
            /commit|base|filter|branch|file|assignee|label|reviewer|milestone/.test(
              lab
            ) &&
            !/settings|view settings|whitespace/.test(lab)
          ) {
            b.click();
            return { via: 'button', lab: lab.slice(0, 40) };
          }
        }
        // Force open via any [aria-expanded=false] haspopup in active Diff panel
        const panel = document.querySelector('.prp-body-panel--active');
        const hp = panel?.querySelector?.(
          'button[aria-haspopup="listbox"], button[aria-haspopup="menu"]'
        );
        if (hp) {
          hp.click();
          return { via: 'haspopup', lab: (hp.getAttribute('aria-label') || '').slice(0, 40) };
        }
        return { via: 'none' };
      })()
    `);
    log(`  open picker: ${JSON.stringify(tryOpen)}`);
    waitMs(400);
    const panelOpen = evalInPage(`
      !!document.querySelector(
        '.prp-sselect-panel, [data-prp-nested-layer="1"], [role="listbox"], .prp-picker'
      )
    `);
    if (!panelOpen) {
      log('  soft-skip: no stacked selector reachable on Diff DEMO PR');
      assert(overlayOpen(), 'shell still open after picker probe');
      return;
    }
    press('Escape');
    waitMs(350);
    const stillPanel = evalInPage(`
      !!document.querySelector('.prp-sselect-panel[data-prp-nested-layer="1"]')
    `);
    assert(!stillPanel, 'Esc must dismiss SearchableSelect panel');
    assert(overlayOpen(), 'Esc on stacked selector must not close PR shell');
  });

  run('ESC.3 Composer / search input Esc blurs without shell close', () => {
    assert(overlayOpen(), 'shell must be open for ESC.3 (no soft-skip)');
    blurEditable();
    waitMs(80);

    // Diff Find bar (⌘F / Meta+f) — product path used by diff-nav e2e
    press('Meta+f');
    waitMs(400);

    const probeFocus = () =>
      evalInPage(`
      (() => {
        const scope =
          document.querySelector('.prp-overlay') ||
          document.querySelector('#prp-page-embed');
        if (!scope) return { ok: false, reason: 'no-prp-scope' };
        const selectors = [
          '.prp-search__input',
          '.prp-search input',
          'input[placeholder*="Find in diff" i]',
          'input[placeholder*="Find in diff, comments" i]',
          '.prp-diff-float-nav__goto-input',
          'textarea.prp-mdc__ta',
          '[data-prp-composer-input]',
          '.prp-header__title-input',
        ];
        let el = null;
        for (const s of selectors) {
          el = scope.querySelector(s);
          if (el && !el.disabled) break;
          el = null;
        }
        if (!el) {
          return {
            ok: false,
            reason: 'no-prp-editable',
            searchOpen: !!scope.querySelector('.prp-search, .prp-diff-toolbar__thread-tools--search'),
          };
        }
        try {
          el.focus({ preventScroll: true });
        } catch {
          try { el.focus(); } catch {}
        }
        const ae = document.activeElement;
        const ok = ae === el || (ae && scope.contains(ae) && (
          ae.classList?.contains('prp-search__input') ||
          ae.classList?.contains('prp-mdc__ta') ||
          ae.matches?.('textarea.prp-mdc__ta, [data-prp-composer-input], .prp-search__input, .prp-header__title-input')
        ));
        return {
          ok: !!ok,
          tag: ae?.tagName || null,
          cls: String(ae?.className || '').slice(0, 48),
          inOverlay: !!(ae && (ae.closest?.('.prp-overlay') || ae.closest?.('#prp-page-embed'))),
        };
      })()
    `);

    let focused = probeFocus();
    log(`  focus after Meta+f: ${JSON.stringify(focused)}`);

    // Conversation footer composer if Diff search did not mount
    if (!focused?.ok) {
      setLayout('conversation');
      waitMs(600);
      blurEditable();
      waitMs(100);
      // Open/focus conversation main composer
      evalInPage(`
        (() => {
          const scope =
            document.querySelector('.prp-overlay') ||
            document.querySelector('#prp-page-embed');
          const ghost = scope?.querySelector?.(
            '[data-prp-composer-kind="conversation"] button.prp-mdc__ghost, .prp-composer-focus-host button.prp-mdc__ghost, .prp-card--composer button.prp-mdc__ghost'
          );
          ghost?.click?.();
          const ta = scope?.querySelector?.(
            '[data-prp-composer-kind="conversation"] textarea.prp-mdc__ta, [data-prp-composer-kind="conversation"] [data-prp-composer-input], .prp-card--composer textarea.prp-mdc__ta, textarea.prp-mdc__ta'
          );
          try { ta?.focus?.(); } catch {}
          return !!ta;
        })()
      `);
      waitMs(300);
      focused = probeFocus();
      log(`  focus conversation composer: ${JSON.stringify(focused)}`);
    }

    // Last retry: Meta+f again on Diff
    if (!focused?.ok) {
      setLayout('diff');
      waitMs(400);
      press('Meta+f');
      waitMs(500);
      focused = probeFocus();
      log(`  focus Meta+f retry: ${JSON.stringify(focused)}`);
    }

    assert(
      focused?.ok === true,
      `ESC.3 must focus a pr+ editable (not GH native). shell open=${overlayOpen()} probe=${JSON.stringify(focused)}`
    );

    press('Escape');
    waitMs(350);
    const after = evalInPage(`
      (() => {
        const scope =
          document.querySelector('.prp-overlay') ||
          document.querySelector('#prp-page-embed');
        const ae = document.activeElement;
        const prpEditable =
          ae &&
          scope?.contains?.(ae) &&
          (ae.classList?.contains('prp-search__input') ||
            ae.classList?.contains('prp-mdc__ta') ||
            ae.classList?.contains('prp-header__title-input') ||
            ae.matches?.(
              'textarea.prp-mdc__ta, [data-prp-composer-input], .prp-search__input, .prp-header__title-input, .prp-diff-float-nav__goto-input'
            ));
        return {
          overlay: !!document.querySelector('.prp-overlay, #prp-page-embed'),
          editableFocused: !!prpEditable,
          tag: ae?.tagName || null,
          cls: String(ae?.className || '').slice(0, 40),
        };
      })()
    `);
    log(`  after Esc: ${JSON.stringify(after)}`);
    assert(after?.overlay, 'Esc on pr+ input must not close PR shell');
    assert(
      !after?.editableFocused,
      `Esc must blur focused pr+ input: ${JSON.stringify(after)}`
    );
  });

  return steps;
}
