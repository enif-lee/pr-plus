/**
 * Finish-review form Esc layering + ⌥I + OptBtnHint; does not close PR shell.
 *
 *   rstest run -c rstest.e2e.config.ts finish-review
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

function finishOpen() {
  return evalInPage(
    `!!document.querySelector('[data-prp-finish-review="1"]')`
  );
}

function overlayOpen() {
  return evalInPage(
    `!!document.querySelector('.prp-overlay, .prp-modal, [data-prp-modal]')`
  );
}

function openFinishReviewUi() {
  // Prefer Submit review control; fallback custom event used by leave-review chords
  const clicked = evalInPage(`
    (() => {
      const btn = [...document.querySelectorAll('button, [role="button"]')].find(
        (el) =>
          /submit review|finish review|leave review/i.test(
            ((el.getAttribute('aria-label') || '') +
              (el.textContent || '') +
              (el.title || '')
            ).replace(/\\s+/g, ' ')
          )
      );
      if (btn) {
        btn.click();
        return { via: 'button', t: (btn.textContent || '').trim().slice(0, 40) };
      }
      try {
        window.dispatchEvent(
          new CustomEvent('prp-open-finish-review', {
            detail: { kind: 'comment' },
          })
        );
        return { via: 'event' };
      } catch (e) {
        return { via: 'fail', err: String(e?.message || e) };
      }
    })()
  `);
  log(`  open finish: ${JSON.stringify(clicked)}`);
  waitMs(500);
  return clicked;
}

function focusFinishInput() {
  return evalInPage(`
    (() => {
      const panel = document.querySelector('[data-prp-finish-review="1"]');
      const ta = panel?.querySelector?.(
        'textarea.prp-mdc__ta, textarea, [data-prp-composer-input]'
      );
      if (!ta) return { ok: false };
      ta.focus();
      return {
        ok: document.activeElement === ta,
        tag: document.activeElement?.tagName || null,
      };
    })()
  `);
}

function finishInputFocused() {
  return evalInPage(`
    (() => {
      const panel = document.querySelector('[data-prp-finish-review="1"]');
      const ae = document.activeElement;
      return !!(panel && ae && panel.contains(ae) &&
        (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable));
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

  run('FR.0 open DEMO_PR Diff', () => {
    openPr(DEMO_PR, { viaUrl: true });
    setLayout('diff');
    blurEditable();
    waitDetailReady({ meta: true, files: true, label: 'FR.0' });
    waitDiffFilesReady('FR.0');
    assert(overlayOpen(), 'PR modal overlay missing');
  });

  run('FR.1 open finish-review form', () => {
    blurEditable();
    openFinishReviewUi();
    const t0 = Date.now();
    let open = false;
    while (Date.now() - t0 < 5000) {
      open = finishOpen();
      if (open) break;
      waitMs(200);
    }
    assert(open, 'finish-review form did not open');
    assert(overlayOpen(), 'PR overlay must stay open when finish-review opens');
  });

  run('FR.2 Esc while finish input focused blurs only', () => {
    assert(finishOpen(), 'finish-review must be open');
    const focused = focusFinishInput();
    log(`  focus input: ${JSON.stringify(focused)}`);
    assert(focused?.ok, `could not focus finish textarea: ${JSON.stringify(focused)}`);
    press('Escape');
    waitMs(250);
    assert(finishOpen(), 'Esc on finish input must not close finish-review form');
    assert(overlayOpen(), 'Esc on finish input must not close PR shell');
    assert(
      !finishInputFocused(),
      'Esc on finish input must blur the textarea'
    );
  });

  run('FR.3 second Esc closes finish form only', () => {
    assert(finishOpen(), 'finish-review must still be open');
    blurEditable();
    waitMs(100);
    // Ensure no input focus inside finish form
    evalInPage(`
      (() => {
        const ae = document.activeElement;
        if (ae && document.querySelector('[data-prp-finish-review="1"]')?.contains(ae)) {
          ae.blur?.();
        }
        return true;
      })()
    `);
    waitMs(80);
    press('Escape');
    waitMs(350);
    assert(!finishOpen(), 'Esc (no input focus) must close finish-review form');
    assert(overlayOpen(), 'Esc closing finish-review must not close PR shell');
  });

  run('FR.4 ⌥I focuses finish composer + Cancel/⌥I OptBtnHint hosts', () => {
    openFinishReviewUi();
    waitMs(400);
    assert(finishOpen(), 're-open finish-review for ⌥I');
    blurEditable();
    waitMs(100);
    // Blur any other textareas so focus probe is unambiguous
    evalInPage(`
      (() => {
        document.documentElement.removeAttribute('data-prp-last-shortcut-action');
        for (const el of document.querySelectorAll('textarea, [contenteditable="true"]')) {
          if (!document.querySelector('[data-prp-finish-review="1"]')?.contains(el)) {
            try { el.blur?.(); } catch {}
          }
        }
        return true;
      })()
    `);
    waitMs(80);
    press('Alt+i');
    waitMs(350);
    let after = evalInPage(`
      (() => {
        const panel = document.querySelector('[data-prp-finish-review="1"]');
        const ae = document.activeElement;
        const inFinish =
          panel &&
          ae &&
          panel.contains(ae) &&
          (ae.matches?.('textarea, [data-prp-composer-input]') ||
            ae.tagName === 'TEXTAREA');
        const cancelHost = panel?.querySelector?.('[data-prp-finish-cancel="1"]');
        const composerHost = panel?.querySelector?.(
          '[data-prp-finish-composer="1"]'
        );
        return {
          inFinish: !!inFinish,
          tag: ae?.tagName || null,
          aeInPanel: !!(panel && ae && panel.contains(ae)),
          hasCancelHost: !!cancelHost,
          hasComposerHost: !!composerHost,
          cancelHasOptHint: !!cancelHost?.querySelector?.(
            '.prp-opt-btn-hint, [class*="opt-btn-hint"]'
          ),
          composerHasOptHint: !!composerHost?.querySelector?.(
            '.prp-opt-btn-hint, [class*="opt-btn-hint"]'
          ),
          cancelOptHost: cancelHost?.classList?.contains('prp-opt-hint-host'),
          composerOptHost: composerHost?.classList?.contains('prp-opt-hint-host'),
        };
      })()
    `);
    log(`  ⌥I / hosts (1): ${JSON.stringify(after)}`);
    if (!after?.inFinish) {
      // Retry physical KeyI once after ensuring form still open
      assert(finishOpen(), 'finish-review closed before ⌥I retry');
      press('Alt+KeyI');
      waitMs(400);
      after = evalInPage(`
        (() => {
          const panel = document.querySelector('[data-prp-finish-review="1"]');
          const ae = document.activeElement;
          const inFinish =
            panel &&
            ae &&
            panel.contains(ae) &&
            (ae.matches?.('textarea, [data-prp-composer-input]') ||
              ae.tagName === 'TEXTAREA');
          const cancelHost = panel?.querySelector?.('[data-prp-finish-cancel="1"]');
          const composerHost = panel?.querySelector?.(
            '[data-prp-finish-composer="1"]'
          );
          return {
            inFinish: !!inFinish,
            tag: ae?.tagName || null,
            aeInPanel: !!(panel && ae && panel.contains(ae)),
            hasCancelHost: !!cancelHost,
            hasComposerHost: !!composerHost,
            cancelOptHost: cancelHost?.classList?.contains('prp-opt-hint-host'),
            composerOptHost: composerHost?.classList?.contains('prp-opt-hint-host'),
          };
        })()
      `);
      log(`  ⌥I / hosts (2): ${JSON.stringify(after)}`);
    }
    assert(
      after?.inFinish,
      `⌥I must focus finish-review textarea: ${JSON.stringify(after)}`
    );
    assert(
      after?.hasCancelHost && after?.hasComposerHost,
      `Cancel + composer Opt hosts required: ${JSON.stringify(after)}`
    );
    assert(
      after?.cancelOptHost && after?.composerOptHost,
      `OptBtnHint hosts missing class prp-opt-hint-host: ${JSON.stringify(after)}`
    );
    // Close form for clean teardown
    blurEditable();
    waitMs(80);
    press('Escape');
    waitMs(200);
    press('Escape');
    waitMs(300);
  });

  return steps;
}
