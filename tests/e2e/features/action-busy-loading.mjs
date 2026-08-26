/**
 * Busy-key loading: only the initiating CTA shows a spinner.
 *
 *   rstest run -c rstest.e2e.config.ts action-busy-loading
 */
import {
  assert,
  DEMO_PR,
  evalInPage,
  log,
  openPr,
  setLayout,
  waitDetailReady,
  waitDiffFilesReady,
  waitMs,
} from '../lib/harness.mjs';

function setActionBusy(busy, key = null) {
  evalInPage(`
    document.dispatchEvent(
      new CustomEvent('prp-set-action-busy', {
        bubbles: true,
        detail: ${JSON.stringify({ busy: Boolean(busy), key: key || null })},
      })
    );
    true
  `);
  waitMs(80);
}

function probeBusy(scopeSel) {
  return evalInPage(`
    (() => {
      const scope = ${JSON.stringify(scopeSel || '')};
      const root = scope
        ? document.querySelector(scope)
        : document.querySelector('.prp-overlay');
      const btns = [...(root?.querySelectorAll('button.prp-btn') || [])].map((b) => ({
        label: (b.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 48),
        loading:
          b.getAttribute('data-loading') === '1' ||
          b.classList.contains('prp-btn--loading'),
        disabled: !!b.disabled,
        submit: b.getAttribute('data-prp-composer-submit') === '1',
      }));
      return {
        hostBusy: document.documentElement.getAttribute('data-prp-action-busy'),
        hostKey: document.documentElement.getAttribute('data-prp-busy-key'),
        loadingLabels: btns.filter((b) => b.loading).map((b) => b.label),
        loadingCount: btns.filter((b) => b.loading).length,
        submitLoading: btns.some((b) => b.submit && b.loading),
        btns,
      };
    })()
  `);
}

function openFinishReviewUi() {
  const clicked = evalInPage(`
    (() => {
      const btn = [...document.querySelectorAll('button, [role="button"]')].find(
        (el) =>
          /submit review|finish review|leave review/i.test(
            (
              (el.getAttribute('aria-label') || '') +
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
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) {
    if (evalInPage(`!!document.querySelector('[data-prp-finish-review="1"]')`)) {
      return clicked;
    }
    waitMs(200);
  }
  return clicked;
}

export function getSteps() {
  const steps = [];
  const run = (name, fn) => {
    steps.push({ name, fn });
  };

  run('AB.0 open DEMO_PR conversation', () => {
    openPr(DEMO_PR, { viaUrl: true });
    setLayout('conversation');
    waitDetailReady({ meta: true, files: false, label: 'AB.0' });
    const composer = evalInPage(
      `!!document.querySelector('[data-prp-composer-root="1"]')`
    );
    assert(composer, 'conversation composer missing');
  });

  run('AB.1 comment key → only composer submit loads', () => {
    evalInPage(`
      document.querySelector('[data-prp-composer-mode="comment"]')?.click();
      true
    `);
    waitMs(120);
    setActionBusy(true, 'comment');
    const snap = probeBusy('[data-prp-composer-root="1"]');
    log(`  comment busy: ${JSON.stringify(snap)}`);
    assert(snap.hostBusy === '1', `host busy attr missing: ${JSON.stringify(snap)}`);
    assert(snap.hostKey === 'comment', `host key: ${JSON.stringify(snap.hostKey)}`);
    assert(snap.submitLoading, `submit CTA not loading: ${JSON.stringify(snap)}`);
    assert(
      snap.loadingCount === 1,
      `expected only submit spinner, got ${snap.loadingCount}: ${JSON.stringify(snap.loadingLabels)}`
    );
  });

  run('AB.2 keyless busy → no composer spinner', () => {
    setActionBusy(true);
    const snap = probeBusy('[data-prp-composer-root="1"]');
    log(`  keyless busy: ${JSON.stringify(snap)}`);
    assert(snap.hostBusy === '1', 'host should stay busy');
    assert(!snap.hostKey, `keyless must not set host key: ${JSON.stringify(snap.hostKey)}`);
    assert(
      snap.loadingCount === 0,
      `keyless busy must not spin CTAs: ${JSON.stringify(snap.loadingLabels)}`
    );
  });

  run('AB.3 finish-review comment key → Comment loads, siblings do not', () => {
    setActionBusy(false);
    setLayout('diff');
    waitDetailReady({ meta: true, files: true, label: 'AB.3' });
    waitDiffFilesReady('AB.3');
    openFinishReviewUi();
    const panel = evalInPage(
      `!!document.querySelector('[data-prp-finish-review="1"]')`
    );
    assert(panel, 'finish-review panel not open');
    setActionBusy(true, 'review-comment');
    const snap = probeBusy('[data-prp-finish-review="1"]');
    log(`  finish comment busy: ${JSON.stringify(snap)}`);
    assert(snap.hostKey === 'review-comment', `host key: ${JSON.stringify(snap)}`);
    assert(
      snap.loadingCount === 1,
      `expected one finish spinner: ${JSON.stringify(snap.loadingLabels)}`
    );
    const loaded = String(snap.loadingLabels?.[0] || '');
    assert(
      /comment|submitting/i.test(loaded),
      `expected Comment CTA loading, got ${JSON.stringify(loaded)}`
    );
  });

  run('AB.4 finish-review approve key → Approve loads (when present)', () => {
    setActionBusy(true, 'approve');
    const snap = probeBusy('[data-prp-finish-review="1"]');
    log(`  finish approve busy: ${JSON.stringify(snap)}`);
    const hasApprove = (snap.btns || []).some((b) =>
      /approve/i.test(b.label || '')
    );
    if (!hasApprove) {
      log('  skip approve spinner (verdict hidden on this PR)');
      return;
    }
    assert(
      snap.loadingCount === 1,
      `expected only Approve spinner: ${JSON.stringify(snap.loadingLabels)}`
    );
    assert(
      /approve|working/i.test(String(snap.loadingLabels?.[0] || '')),
      `expected Approve loading: ${JSON.stringify(snap.loadingLabels)}`
    );
  });

  run('AB.5 clear busy → no overlay spinners', () => {
    setActionBusy(false);
    waitMs(80);
    const snap = probeBusy('.prp-overlay');
    log(`  idle: ${JSON.stringify({ hostBusy: snap.hostBusy, n: snap.loadingCount })}`);
    assert(!snap.hostBusy, `host busy leftover: ${JSON.stringify(snap.hostBusy)}`);
    assert(
      snap.loadingCount === 0,
      `idle overlay still loading: ${JSON.stringify(snap.loadingLabels)}`
    );
  });

  return steps;
}
