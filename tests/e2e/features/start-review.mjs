/**
 * Start review flow (no finish/submit):
 *   discard leftover → Start review → Add comment → Comment CTA hidden → Discard
 *
 *   rstest run -c rstest.e2e.config.ts start-review
 */
import { execSync } from 'node:child_process';
import {
  assert,
  blurEditable,
  clickSelectableLine,
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

/**
 * Prefer MULTI_HUNK_PR (#13): DEMO_PR (#7) is locked on GH → Start review 422
 * "Issue is locked". #13 is unlocked and has multi-line diffs for selection.
 */
const TARGET_PR = MULTI_HUNK_PR;

const MARK = `e2e-sr-${Date.now().toString(36)}`;

/** Best-effort REST view of PENDING reviews (gh auth; may differ from extension PAT). */
function ghPendingReviews(prNumber = TARGET_PR) {
  try {
    const out = execSync(
      `gh api "repos/enif-lee/pr-plus/pulls/${Number(prNumber)}/reviews?per_page=30" --jq '[.[]|select(.state=="PENDING")|{id,node_id,user:.user.login}]'`,
      { encoding: 'utf8', timeout: 15000 }
    );
    return JSON.parse(out || '[]');
  } catch (e) {
    return { error: String(e?.message || e).slice(0, 120) };
  }
}

function overlayOpen() {
  return evalInPage(
    `!!document.querySelector('.prp-overlay, #prp-page-embed, [data-prp-modal]')`
  );
}

function selectionIslandProbe() {
  return evalInPage(`
    (() => {
      const island = document.querySelector(
        '[data-prp-composer-kind="selection"], .prp-selection-island--comment'
      );
      if (!island) {
        return {
          island: false,
          pendingOnly: false,
          labels: [],
          hasCommentCta: false,
          hasStartReview: false,
          hasAddComment: false,
          submitLabels: [],
        };
      }
      const labels = [...island.querySelectorAll('button')]
        .map((b) => (b.textContent || '').replace(/\\s+/g, ' ').trim())
        .filter(Boolean);
      const submitLabels = [...island.querySelectorAll('[data-prp-composer-submit]')]
        .map((b) => (b.textContent || '').replace(/\\s+/g, ' ').trim())
        .filter(Boolean);
      const hasCommentCta = labels.some((t) => /^Comment$/i.test(t));
      const hasStartReview = labels.some((t) => /Start review/i.test(t));
      const hasAddComment = labels.some((t) => /Add comment/i.test(t));
      return {
        island: true,
        pendingOnly: island.getAttribute('data-prp-pending-only') === '1',
        labels,
        hasCommentCta,
        hasStartReview,
        hasAddComment,
        submitLabels,
      };
    })()
  `);
}

function pendingToolbarProbe() {
  return evalInPage(`
    (() => {
      const countEl = document.querySelector('.prp-diff-toolbar__pending-count');
      const countText = countEl ? (countEl.textContent || '').trim() : '';
      const n = countText ? Number(countText) : 0;
      const submitBtn = [...document.querySelectorAll('button, [role="button"]')].find(
        (el) =>
          /submit review|finish review/i.test(
            ((el.getAttribute('aria-label') || '') +
              (el.textContent || '') +
              (el.title || '')
            ).replace(/\\s+/g, ' ')
          )
      );
      return {
        pendingCount: Number.isFinite(n) ? n : 0,
        hasCountBadge: !!countEl,
        submitLabel: submitBtn
          ? (submitBtn.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 48)
          : null,
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

function finishOpen() {
  return evalInPage(
    `!!document.querySelector('[data-prp-finish-review="1"]')`
  );
}

function discardPendingViaFinish() {
  // Close selection island / nested UI so toolbar Submit review is clickable
  for (let i = 0; i < 4; i++) {
    press('Escape');
    waitMs(80);
  }
  blurEditable();
  waitMs(150);

  // Product open: custom event (host/App), then toolbar button, then ⌥↵
  evalInPage(`
    (() => {
      try {
        window.dispatchEvent(
          new CustomEvent('prp-open-finish-review', {
            detail: { kind: 'comment' },
          })
        );
      } catch { /* ignore */ }
      return true;
    })()
  `);
  waitMs(500);
  if (!finishOpen()) {
    openFinishReviewUi();
    waitMs(500);
  }
  if (!finishOpen()) {
    // Click pending count badge area / submit review in toolbar only
    evalInPage(`
      (() => {
        const bar = document.querySelector('.prp-diff-toolbar__pending');
        const btn = bar?.querySelector?.('button');
        if (btn) {
          btn.click();
          return { via: 'toolbar-pending' };
        }
        return { via: 'none' };
      })()
    `);
    waitMs(500);
  }
  if (!finishOpen()) {
    press('Alt+Enter');
    waitMs(600);
  }
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) {
    if (finishOpen()) break;
    waitMs(200);
  }
  if (!finishOpen()) {
    // Last resort: bridge discard if extension exposes it
    const bridge = evalInPage(`
      (() => {
        const api = globalThis.PRTreeFetch;
        if (!api?.deletePendingPullReview) return { ok: false, reason: 'no-api' };
        return { ok: true, hasApi: true };
      })()
    `);
    log(`  finish still closed; bridge probe: ${JSON.stringify(bridge)}`);
    return { ok: false, reason: 'finish-not-open', bridge };
  }
  const r = evalInPage(`
    (() => {
      const panel = document.querySelector('[data-prp-finish-review="1"]');
      if (!panel) return { ok: false, reason: 'no-panel' };
      const discard = [...panel.querySelectorAll('button')].find((b) =>
        /discard/i.test(
          (b.textContent || '') +
            (b.title || '') +
            (b.getAttribute('aria-label') || '')
        )
      );
      if (!discard) {
        const cancel = panel.querySelector(
          '[data-prp-finish-cancel] button, button'
        );
        cancel?.click?.();
        return { ok: true, reason: 'no-discard-btn', closed: true };
      }
      discard.click();
      return { ok: true, via: 'discard', label: (discard.textContent || '').trim() };
    })()
  `);
  waitMs(1000);
  if (finishOpen()) {
    press('Escape');
    waitMs(250);
  }
  return r;
}

function openSelectionComment(lineIndex) {
  releaseOptHold();
  press('Escape');
  waitMs(80);
  press('Escape');
  waitMs(80);
  const clicked = clickSelectableLine(lineIndex);
  waitMs(200);
  press('Alt+c');
  waitMs(450);
  const t0 = Date.now();
  let island = selectionIslandProbe();
  while (Date.now() - t0 < 4000 && !island.island) {
    waitMs(150);
    island = selectionIslandProbe();
  }
  return { clicked, island };
}

function actionMsgProbe() {
  return evalInPage(`
    (() => {
      const el =
        document.querySelector('.prp-diff-toolbar [role="status"]') ||
        document.querySelector('.prp-action-msg, [data-prp-action-msg]') ||
        document.querySelector('.prp-diff-toolbar .prp-toast, .prp-header [class*="msg"]');
      const bar = document.querySelector('.prp-diff-toolbar');
      const txt = (el?.textContent || bar?.textContent || '').replace(/\\s+/g, ' ').trim();
      return {
        msg: txt.slice(0, 160),
        busy: !!document.querySelector(
          '[data-loading="1"], .prp-btn--loading, [aria-busy="true"]'
        ),
      };
    })()
  `);
}

function fillSelectionComposer(body) {
  return evalInPage(`
    (() => {
      const root = document.querySelector(
        '[data-prp-composer-kind="selection"], .prp-selection-island--comment'
      );
      const ta =
        root?.querySelector?.('textarea.prp-mdc__ta, [data-prp-composer-input], textarea') ||
        null;
      if (!ta || ta.disabled) return { ok: false, reason: 'no-ta' };
      try { ta.focus({ preventScroll: true }); } catch { try { ta.focus(); } catch {} }
      const text = ${JSON.stringify(String(body))};
      // React controlled: native setter + valueTracker + synthetic onChange
      try {
        const tracker = ta._valueTracker;
        if (tracker && typeof tracker.setValue === 'function') tracker.setValue('');
      } catch { /* ignore */ }
      const proto = window.HTMLTextAreaElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(ta, text);
      else ta.value = text;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      // React 18/19 props onChange (reliable for controlled parents)
      let viaFiber = false;
      try {
        const pkey = Object.keys(ta).find((k) => k.startsWith('__reactProps$'));
        const props = pkey ? ta[pkey] : null;
        if (props && typeof props.onChange === 'function') {
          props.onChange({
            target: ta,
            currentTarget: ta,
            type: 'change',
            bubbles: true,
            preventDefault() {},
            stopPropagation() {},
          });
          viaFiber = true;
        }
      } catch { /* ignore */ }
      const startBtn = root.querySelector('[data-prp-composer-start-review]');
      const selected = document.querySelectorAll('.prp-vline--selected').length;
      return {
        ok: String(ta.value || '').length > 0,
        len: String(ta.value || '').length,
        active: document.activeElement === ta,
        startDisabled: !!startBtn?.disabled,
        viaFiber,
        selected,
        labels: [...root.querySelectorAll('button')].map((b) => ({
          t: (b.textContent || '').trim().slice(0, 24),
          dis: !!b.disabled,
        })),
      };
    })()
  `);
}

function toastProbe() {
  return evalInPage(`
    (() => {
      const t = document.querySelector('.prp-action-toast, .prp-action-toast__text');
      return {
        text: (t?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
        tone: t?.closest?.('.prp-action-toast')?.getAttribute?.('data-tone') || null,
      };
    })()
  `);
}

function clickSelectionCta(kind) {
  // kind: 'start' | 'add' | 'pending' (either start or add)
  return evalInPage(`
    (() => {
      const root = document.querySelector(
        '[data-prp-composer-kind="selection"], .prp-selection-island--comment'
      );
      if (!root) return { ok: false, reason: 'no-island' };
      const kind = ${JSON.stringify(kind)};
      let btn =
        root.querySelector('[data-prp-composer-start-review]') ||
        null;
      if (!btn) {
        const want =
          kind === 'start'
            ? /Start review/i
            : kind === 'add'
              ? /Add comment/i
              : /Start review|Add comment/i;
        btn = [...root.querySelectorAll('button')].find((b) =>
          want.test((b.textContent || '').trim())
        );
      }
      if (!btn || btn.disabled) {
        return {
          ok: false,
          reason: 'no-btn',
          disabled: !!btn?.disabled,
          labels: [...root.querySelectorAll('button')].map((b) =>
            (b.textContent || '').trim()
          ),
        };
      }
      try {
        btn.dispatchEvent(
          new MouseEvent('mousedown', { bubbles: true, cancelable: true })
        );
      } catch { /* ignore */ }
      btn.click();
      return {
        ok: true,
        label: (btn.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      };
    })()
  `);
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
  waitMs(100);
}

function waitPendingCount(min = 1, ms = 12000) {
  const t0 = Date.now();
  let last = pendingToolbarProbe();
  while (Date.now() - t0 < ms) {
    last = pendingToolbarProbe();
    if ((last.pendingCount || 0) >= min || last.hasCountBadge) return last;
    waitMs(250);
  }
  return last;
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

  run(`SR.0 open PR #${TARGET_PR} Diff (unlocked)`, () => {
    // Pick up SW/fetch after rebuild (attach path + pendingReviewNodeId latch)
    try {
      evalInPage(
        `document.dispatchEvent(new CustomEvent('prp-reload-extension', { bubbles: true })); true`
      );
      log('  [SR.0] prp-reload-extension dispatched');
      waitMs(2500);
    } catch (e) {
      log(`  [SR.0] reload-extension skipped: ${String(e?.message || e).slice(0, 80)}`);
    }
    openPr(TARGET_PR, { viaUrl: true });
    setLayout('diff');
    blurEditable();
    waitDetailReady({ meta: true, files: true, label: 'SR.0' });
    waitDiffFilesReady('SR.0');
    assert(overlayOpen(), 'PR shell missing');
  });

  run('SR.1 discard leftover PENDING if any (no submit)', () => {
    blurEditable();
    releaseOptHold();
    const before = pendingToolbarProbe();
    log(`  pending before cleanup: ${JSON.stringify(before)}`);
    if (before.pendingCount > 0 || before.hasCountBadge) {
      const d = discardPendingViaFinish();
      log(`  discard leftover: ${JSON.stringify(d)}`);
      waitMs(600);
      const after = pendingToolbarProbe();
      log(`  pending after cleanup: ${JSON.stringify(after)}`);
      // Soft: if discard failed leave a note; later steps may still work on clean PR
      if ((after.pendingCount || 0) > 0) {
        log(
          `  WARN leftover pending still ${after.pendingCount} — continue carefully`
        );
      }
    } else {
      log('  no leftover pending');
    }
  });

  run('SR.2 Start review from selection comment', () => {
    assert(overlayOpen(), 'shell closed before SR.2');
    const open = openSelectionComment(2);
    log(`  open comment: ${JSON.stringify(open)}`);
    assert(
      open.island?.island,
      `selection comment island missing: ${JSON.stringify(open)}`
    );
    // Pre-pending: Comment + Start review should be available (unless already pending)
    const pre = selectionIslandProbe();
    log(`  pre Start review CTAs: ${JSON.stringify(pre)}`);
    if (!pre.pendingOnly && pre.hasCommentCta) {
      log('  Comment CTA present before Start review — OK');
    }

    const body = `${MARK}-start selection start-review`;
    let filled = fillSelectionComposer(body);
    log(`  fill: ${JSON.stringify(filled)}`);
    assert(filled?.ok, `could not fill selection composer: ${JSON.stringify(filled)}`);
    waitMs(250);
    // Re-fill if Start button still disabled (React draft not synced yet)
    if (filled.startDisabled) {
      filled = fillSelectionComposer(body);
      waitMs(300);
      log(`  re-fill: ${JSON.stringify(filled)}`);
    }

    // Ensure selection still painted before submit
    const selSnap = selectionProbe();
    log(`  selection before submit: ${JSON.stringify(selSnap)}`);
    assert(
      (selSnap?.count || 0) >= 1,
      `need line selection before Start review: ${JSON.stringify(selSnap)}`
    );

    let click = clickSelectionCta('pending');
    log(`  click Start/Add: ${JSON.stringify(click)}`);
    if (!click?.ok) {
      fillSelectionComposer(body);
      waitMs(200);
      press('Alt+s');
      waitMs(500);
      click = { ok: true, via: 'alt-s' };
      log(`  fallback Alt+s`);
    }
    assert(click?.ok, `Start review click failed: ${JSON.stringify(click)}`);

    // Success: island dismisses on pending attach; toast may show result
    const tDismiss = Date.now();
    let dismissed = false;
    let lastToast = null;
    while (Date.now() - tDismiss < 15000) {
      const isl = selectionIslandProbe();
      lastToast = toastProbe();
      if (!isl.island) {
        dismissed = true;
        log(`  island dismissed toast=${JSON.stringify(lastToast)}`);
        break;
      }
      if (lastToast?.text) log(`  toast: ${JSON.stringify(lastToast)}`);
      // Retry once if still open and no busy after 2s (missed draft)
      if (Date.now() - tDismiss > 2000 && Date.now() - tDismiss < 2800) {
        fillSelectionComposer(body);
        waitMs(100);
        clickSelectionCta('pending');
        log(`  retry click after 2s`);
      }
      waitMs(300);
    }
    const pend = waitPendingCount(1, dismissed ? 4000 : 12000);
    log(`  pending after Start review: ${JSON.stringify(pend)} dismissed=${dismissed}`);
    const msgEnd = actionMsgProbe();
    log(`  action end: ${JSON.stringify(msgEnd)}`);
    const ghPend = ghPendingReviews(TARGET_PR);
    log(`  gh PENDING reviews after Start: ${JSON.stringify(ghPend)}`);
    const latched = evalInPage(
      `document.documentElement.getAttribute('data-prp-pending-review-node')`
    );
    log(`  latched pending review node: ${JSON.stringify(latched)}`);
    // Product must latch PRR_ after Start so Add comment uses GraphQL attach.
    // Soft log if missing — SR.3 still hard-asserts Add success.
    if (!latched && Array.isArray(ghPend) && ghPend[0]?.node_id) {
      log(
        `  WARN: product did not latch PRR_ (gh has ${ghPend[0].node_id}); Add will rely on ensure/find`
      );
    }

    // Re-open island on another line for pending-only probe
    press('Escape');
    waitMs(100);
    const open2 = openSelectionComment(3);
    const post = selectionIslandProbe();
    log(`  after start island: ${JSON.stringify({ open2, post, pend })}`);
    assert(
      dismissed ||
        (pend.pendingCount || 0) >= 1 ||
        pend.hasCountBadge ||
        post.pendingOnly ||
        post.hasAddComment,
      `Start review did not create PENDING: pend=${JSON.stringify(pend)} island=${JSON.stringify(post)} msg=${JSON.stringify(msgEnd)} toast=${JSON.stringify(lastToast)}`
    );
  });
  run('SR.3 Add comment; Comment CTA hidden; Add comment present', () => {
    assert(overlayOpen(), 'shell closed before SR.3');

    // Snapshot pending **before** Add comment so success is not confused with
    // leftover Start-review pending alone.
    const pendBefore = pendingToolbarProbe();
    const pendingBeforeN = Number(pendBefore.pendingCount) || 0;
    log(`  pending before Add: ${JSON.stringify(pendBefore)}`);
    assert(
      pendingBeforeN >= 1 || pendBefore.hasCountBadge,
      `SR.3 requires PENDING from Start review: ${JSON.stringify(pendBefore)}`
    );

    // Let GitHub list/GraphQL catch up after Start review create+attach
    waitMs(1500);

    // Fresh line (not the Start-review line) so a new pending thread can form
    press('Escape');
    waitMs(80);
    press('Escape');
    waitMs(80);
    const open = openSelectionComment(6);
    let island = open.island || selectionIslandProbe();
    assert(
      island?.island,
      `need comment island for Add comment: ${JSON.stringify(open)}`
    );

    // Core product assert: no single Comment while PENDING
    island = selectionIslandProbe();
    log(`  CTAs while PENDING: ${JSON.stringify(island)}`);
    assert(
      !island.hasCommentCta,
      `immediate Comment button must be hidden while PENDING: ${JSON.stringify(island)}`
    );
    assert(
      island.pendingOnly ||
        island.hasAddComment ||
        island.submitLabels.some((t) => /Add comment/i.test(t)),
      `Add comment must be present while PENDING: ${JSON.stringify(island)}`
    );

    const body = `${MARK}-add selection add-comment`;
    let filled = fillSelectionComposer(body);
    log(`  fill add: ${JSON.stringify(filled)}`);
    assert(filled?.ok, `fill for Add comment failed: ${JSON.stringify(filled)}`);
    waitMs(300);
    if (filled.startDisabled) {
      filled = fillSelectionComposer(body);
      waitMs(300);
      log(`  re-fill add: ${JSON.stringify(filled)}`);
    }

    let click = clickSelectionCta('add');
    log(`  click Add comment: ${JSON.stringify(click)}`);
    if (!click?.ok) {
      fillSelectionComposer(body);
      waitMs(150);
      click = clickSelectionCta('pending');
      log(`  retry pending CTA: ${JSON.stringify(click)}`);
    }
    if (!click?.ok) {
      press('Alt+s');
      waitMs(400);
      click = { ok: true, via: 'alt-s' };
    }
    assert(click?.ok, `Add comment click failed: ${JSON.stringify(click)}`);

    // Hard success: island dismiss, or "Added to pending" toast, or pending count ↑
    const t0 = Date.now();
    let dismissed = false;
    let toastOk = false;
    let toastErr = null;
    let lastToast = null;
    let pend = pendBefore;
    while (Date.now() - t0 < 15000) {
      if (!selectionIslandProbe().island) dismissed = true;
      lastToast = toastProbe();
      const t = String(lastToast?.text || '');
      if (/added to pending|added file comment to pending/i.test(t)) {
        toastOk = true;
      }
      if (/fail|error|422|could not|locked|required/i.test(t)) {
        toastErr = t;
      }
      pend = pendingToolbarProbe();
      const n = Number(pend.pendingCount) || 0;
      // Thread-count may stay 1 if second attach lands as same unit; prefer
      // dismiss/toast. Still accept count increase when it happens.
      if (dismissed || toastOk || n > pendingBeforeN) break;
      // Mid-wait retry once if island still open (draft miss)
      if (
        !dismissed &&
        Date.now() - t0 > 2500 &&
        Date.now() - t0 < 3200
      ) {
        fillSelectionComposer(body);
        waitMs(120);
        clickSelectionCta('add');
        log(`  retry Add click mid-wait`);
      }
      waitMs(300);
    }
    log(
      `  pending after Add: ${JSON.stringify(pend)} dismissed=${dismissed} toastOk=${toastOk} toast=${JSON.stringify(lastToast)} err=${toastErr || ''}`
    );
    // One-pending 422 means attach used create instead of GraphQL — fail hard
    // with that signal (product regression). Other errors also fail.
    if (toastErr) {
      const ghPend = ghPendingReviews(TARGET_PR);
      log(`  gh PENDING at Add fail: ${JSON.stringify(ghPend)}`);
      assert(
        false,
        `Add comment failed with toast: ${toastErr} (beforePending=${pendingBeforeN} after=${JSON.stringify(pend)} dismissed=${dismissed} ghPending=${JSON.stringify(ghPend)})`
      );
    }
    // Must prove **this** Add comment succeeded — not merely that Start-review
    // pending still exists (pendingCount>=1 alone is theater).
    const countUp = (Number(pend.pendingCount) || 0) > pendingBeforeN;
    assert(
      dismissed || toastOk || countUp,
      `Add comment did not complete: need island dismiss and/or "Added to pending" toast and/or pendingCount increase (before=${pendingBeforeN}). pend=${JSON.stringify(pend)} toast=${JSON.stringify(lastToast)} dismissed=${dismissed}`
    );
  });
  run('SR.4 Discard pending review (no submit/finish)', () => {
    assert(overlayOpen(), 'shell closed before SR.4');
    // Close any open island
    press('Escape');
    waitMs(100);
    press('Escape');
    waitMs(100);
    blurEditable();

    const before = pendingToolbarProbe();
    log(`  pending before discard: ${JSON.stringify(before)}`);
    if ((before.pendingCount || 0) < 1 && !before.hasCountBadge) {
      log('  no pending to discard — soft-pass cleanup');
      return;
    }
    const d = discardPendingViaFinish();
    log(`  discard: ${JSON.stringify(d)}`);
    assert(d?.ok, `Discard failed: ${JSON.stringify(d)}`);

    const t0 = Date.now();
    let after = pendingToolbarProbe();
    while (Date.now() - t0 < 10000) {
      after = pendingToolbarProbe();
      if ((after.pendingCount || 0) === 0 && !after.hasCountBadge) break;
      waitMs(300);
    }
    log(`  pending after discard: ${JSON.stringify(after)}`);
    assert(
      (after.pendingCount || 0) === 0 && !after.hasCountBadge,
      `pending must clear after Discard (do not leave stuck PENDING): ${JSON.stringify(after)}`
    );

    // Comment CTA returns when no PENDING
    const open = openSelectionComment(5);
    const island = open.island || selectionIslandProbe();
    log(`  CTAs after discard: ${JSON.stringify(island)}`);
    if (island.island) {
      assert(
        !island.pendingOnly && (island.hasCommentCta || island.hasStartReview),
        `after discard expect Comment/Start review again: ${JSON.stringify(island)}`
      );
    }
    // Leave clean: close island without posting
    press('Escape');
    waitMs(80);
    press('Escape');
    waitMs(80);
  });

  return steps;
}

export async function runStartReview() {
  const { createRunner } = await import('../lib/runner.mjs');
  const { run, report } = createRunner();
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
  return report('start-review');
}
