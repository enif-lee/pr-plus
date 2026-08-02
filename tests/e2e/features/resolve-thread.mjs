/**
 * Resolve conversation: empty reply must still click; mutation needs PRRT_ id.
 *
 * Strong assertions cover:
 *  - Resolve button **rendered** in DOM (selector, label, PRRT attr, open actions row, layout box)
 *  - Visible without typing in reply (composer-actions--open)
 *  - Click with empty reply succeeds (no rateLimit schema error)
 *  - Unresolve button rendered after resolve + filter/expand, then restore
 */
import { execSync } from 'node:child_process';
import {
  assert,
  blurEditable,
  DEMO_PR,
  openPr,
  openPulls,
  setLayout,
  waitDetailReady,
  waitDiffFilesReady,
  waitMs,
} from '../lib/harness.mjs';
import { evalInPage } from '../lib/ab.mjs';

/** Probe all resolve buttons + visibility geometry. */
function probeResolveButtons() {
  return evalInPage(`
    (() => {
      const threads = [...document.querySelectorAll('.prp-inline-thread')];
      const btns = [...document.querySelectorAll('[data-prp-composer-resolve="1"]')];
      const canResolveRoots = document.querySelectorAll(
        '[data-prp-composer-root][data-prp-can-resolve="1"]'
      ).length;
      const openActionRows = document.querySelectorAll(
        '.prp-inline-thread__composer-actions--open'
      ).length;
      const details = btns.map((b) => {
        const r = b.getBoundingClientRect();
        const style = window.getComputedStyle(b);
        const row = b.closest('.prp-inline-thread__composer-actions');
        const rowOpen = row?.classList?.contains(
          'prp-inline-thread__composer-actions--open'
        );
        const rowDisplay = row ? window.getComputedStyle(row).display : null;
        return {
          label: (b.textContent || '').trim(),
          id: b.getAttribute('data-prp-thread-node-id') || null,
          disabled: Boolean(b.disabled) || b.getAttribute('aria-disabled') === 'true',
          title: b.getAttribute('title') || b.getAttribute('aria-label') || '',
          w: Math.round(r.width),
          h: Math.round(r.height),
          visible:
            r.width > 0 &&
            r.height > 0 &&
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            style.opacity !== '0',
          rowOpen: Boolean(rowOpen),
          rowDisplay,
          inThread: Boolean(b.closest('.prp-inline-thread')),
        };
      });
      const resolveBtns = details.filter((d) =>
        /Resolve conversation/i.test(d.label || '')
      );
      const unresolveBtns = details.filter((d) =>
        /Unresolve conversation/i.test(d.label || '')
      );
      const prrtResolve = resolveBtns.filter((d) => /^PRRT_/i.test(d.id || ''));
      const visiblePrrtResolve = prrtResolve.filter((d) => d.visible && !d.disabled);
      return {
        threadCount: threads.length,
        btnCount: btns.length,
        canResolveRoots,
        openActionRows,
        resolveCount: resolveBtns.length,
        unresolveCount: unresolveBtns.length,
        prrtResolveCount: prrtResolve.length,
        visiblePrrtResolveCount: visiblePrrtResolve.length,
        sample: visiblePrrtResolve[0] || prrtResolve[0] || resolveBtns[0] || null,
        details: details.slice(0, 8),
      };
    })()
  `);
}

function waitForVisibleResolve(timeoutMs = 15000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = probeResolveButtons();
    if (Number(last?.visiblePrrtResolveCount) >= 1) return last;
    waitMs(300);
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

  /** Shared between R3/R4 — PRRT id we resolved */
  let resolvedThreadId = null;

  run(`R1 open PR #${DEMO_PR} Diff (GraphQL-first threads)`, () => {
    openPulls();
    openPr(DEMO_PR);
    waitDetailReady({ number: DEMO_PR, timeoutMs: 60000 });
    setLayout('diff');
    waitDiffFilesReady(`resolve-thread #${DEMO_PR}`);
    // Soft revalidate / full-threads so shell+PRRT and eager comments settle
    evalInPage(`
      (() => {
        const b = [...document.querySelectorAll('button')].find((el) =>
          /refresh/i.test(
            (el.getAttribute('aria-label') || '') + (el.title || '')
          )
        );
        if (b) b.click();
        return !!b;
      })()
    `);
    waitMs(3500);
    waitDetailReady({ number: DEMO_PR, files: true, timeoutMs: 45000 });
    blurEditable();
    waitMs(300);

    const snap = waitForVisibleResolve(12000);
    assert(
      Number(snap?.threadCount) >= 1,
      `R1: expected inline threads rendered: ${JSON.stringify(snap)}`
    );
  });

  run('R2 Resolve button rendered (DOM + visible + PRRT + open actions)', () => {
    blurEditable();
    waitMs(100);
    const snap = waitForVisibleResolve(10000);

    assert(
      Number(snap?.threadCount) >= 1,
      `R2: no .prp-inline-thread: ${JSON.stringify(snap)}`
    );
    assert(
      Number(snap?.btnCount) >= 1,
      `R2: no [data-prp-composer-resolve="1"] in DOM: ${JSON.stringify(snap)}`
    );
    assert(
      Number(snap?.canResolveRoots) >= 1,
      `R2: missing data-prp-can-resolve roots: ${JSON.stringify(snap)}`
    );
    assert(
      Number(snap?.openActionRows) >= 1,
      `R2: composer-actions--open not present (button row hidden): ${JSON.stringify(snap)}`
    );
    assert(
      Number(snap?.resolveCount) >= 1,
      `R2: no "Resolve conversation" label buttons: ${JSON.stringify(snap)}`
    );
    assert(
      Number(snap?.prrtResolveCount) >= 1,
      `R2: Resolve buttons lack data-prp-thread-node-id PRRT_…: ${JSON.stringify(snap)}`
    );
    assert(
      Number(snap?.visiblePrrtResolveCount) >= 1,
      `R2: PRRT Resolve button not laid out (w/h/visibility): ${JSON.stringify(snap)}`
    );

    const s = snap.sample;
    assert(s, `R2: missing sample button: ${JSON.stringify(snap)}`);
    assert(
      s.inThread === true,
      `R2: resolve button not inside .prp-inline-thread: ${JSON.stringify(s)}`
    );
    assert(
      s.rowOpen === true || s.rowDisplay === 'flex',
      `R2: actions row not open/flex: ${JSON.stringify(s)}`
    );
    assert(
      s.disabled === false,
      `R2: Resolve button disabled: ${JSON.stringify(s)}`
    );
    assert(
      /^PRRT_/i.test(s.id || ''),
      `R2: bad thread node id: ${JSON.stringify(s)}`
    );
    assert(
      /Resolve conversation/i.test(s.label || ''),
      `R2: unexpected label: ${JSON.stringify(s)}`
    );
    assert(
      Number(s.w) >= 40 && Number(s.h) >= 16,
      `R2: button box too small (not painted): ${JSON.stringify(s)}`
    );
  });

  run('R3 click Resolve with empty reply (button stays targetable)', () => {
    blurEditable();
    waitMs(100);
    const beforeProbe = probeResolveButtons();
    assert(
      Number(beforeProbe?.visiblePrrtResolveCount) >= 1,
      `R3: no visible PRRT Resolve before click: ${JSON.stringify(beforeProbe)}`
    );
    const target = beforeProbe.sample;
    assert(target?.id, `R3: no target id: ${JSON.stringify(beforeProbe)}`);
    assert(
      target.visible && !target.disabled,
      `R3: target not clickable: ${JSON.stringify(target)}`
    );
    resolvedThreadId = target.id;

    const clickRes = evalInPage(`
      (() => {
        const id = ${JSON.stringify(target.id)};
        const b = [...document.querySelectorAll('[data-prp-composer-resolve="1"]')].find(
          (el) => el.getAttribute('data-prp-thread-node-id') === id
        );
        if (!b) return { ok: false, reason: 'missing-btn' };
        const r0 = b.getBoundingClientRect();
        if (r0.width < 1 || r0.height < 1) {
          return { ok: false, reason: 'zero-box', w: r0.width, h: r0.height };
        }
        // Empty-reply path: mousedown must not hide the row before click
        b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        const mid = document.querySelector(
          '[data-prp-composer-resolve="1"][data-prp-thread-node-id="' + id + '"]'
        );
        if (!mid) return { ok: false, reason: 'btn-gone-after-mousedown' };
        mid.click();
        return {
          ok: true,
          label: (mid.textContent || '').trim(),
          stillVisible: mid.getBoundingClientRect().width > 0,
        };
      })()
    `);
    assert(
      clickRes?.ok,
      `R3: click failed (empty-reply mousedown path): ${JSON.stringify(clickRes)}`
    );

    let after = null;
    for (let i = 0; i < 48; i++) {
      waitMs(250);
      after = evalInPage(`
        (() => {
          const id = ${JSON.stringify(target.id)};
          const bodyText = document.body.innerText || '';
          const rateLimitError = /rateLimit|Field ['"]rateLimit['"]|Cannot query field/i.test(
            bodyText
          );
          const unresolveBtn = [...document.querySelectorAll('[data-prp-composer-resolve="1"]')].find(
            (el) =>
              el.getAttribute('data-prp-thread-node-id') === id &&
              /Unresolve/i.test(el.textContent || '')
          );
          let unresolveGeom = null;
          if (unresolveBtn) {
            const r = unresolveBtn.getBoundingClientRect();
            unresolveGeom = {
              w: Math.round(r.width),
              h: Math.round(r.height),
              visible: r.width > 0 && r.height > 0,
            };
          }
          const collapsed = document.querySelectorAll(
            '.prp-inline-thread--collapsed'
          ).length;
          const filter =
            document.querySelector('.prp-review-filter, [class*="review-filter"]')
              ?.textContent || '';
          const msgHit = /Thread resolved|Thread unresolved/i.test(bodyText);
          const gqlFail = /GitHub GraphQL:/i.test(bodyText);
          return {
            unresolveInDom: !!unresolveBtn,
            unresolveLabel: (unresolveBtn?.textContent || '').trim(),
            unresolveGeom,
            collapsed,
            filter: String(filter).slice(0, 100),
            rateLimitError,
            msgHit,
            gqlFail,
          };
        })()
      `);
      if (after?.rateLimitError || after?.gqlFail) break;
      if (
        after?.unresolveInDom ||
        after?.msgHit ||
        Number(after?.collapsed) > Number(beforeProbe?.details?.[0] ? 0 : 0) ||
        /Resolved\s*[1-9]/i.test(after?.filter || '')
      ) {
        // prefer strong signal
        if (
          after?.unresolveInDom ||
          after?.msgHit ||
          /Resolved\s*[1-9]/i.test(after?.filter || '') ||
          Number(after?.collapsed) >= 1
        ) {
          break;
        }
      }
    }
    assert(
      !after?.rateLimitError,
      `R3: rateLimit schema error: ${JSON.stringify(after)}`
    );
    assert(!after?.gqlFail, `R3: GraphQL error: ${JSON.stringify(after)}`);

    // Strong product signal: unresolve control in DOM and/or toast and/or filter
    const ok =
      after?.unresolveInDom ||
      after?.msgHit ||
      Number(after?.collapsed) >= 1 ||
      /Resolved\s*[1-9]/i.test(after?.filter || '');
    assert(
      ok,
      `R3: resolve had no UI effect: ${JSON.stringify({ target, after })}`
    );

    // If Unresolve is in DOM, it must also be a real button node with PRRT id
    if (after?.unresolveInDom) {
      assert(
        /Unresolve conversation/i.test(after.unresolveLabel || ''),
        `R3: bad unresolve label: ${JSON.stringify(after)}`
      );
    }

    // Write-through resolve keeps actionBusy until the mutation settles. Unresolve
    // is disabled while busy — wait so R4 does not click a no-op disabled button.
    for (let i = 0; i < 40; i++) {
      waitMs(100);
      const ready = evalInPage(`
        (() => {
          const bodyText = document.body.innerText || '';
          const busy =
            document.querySelector('[data-prp-action-busy="1"]') ||
            document.querySelector('.prp-modal[data-busy="1"]') ||
            [...document.querySelectorAll('[data-prp-composer-resolve="1"]')].some(
              (el) => el.disabled || el.getAttribute('aria-disabled') === 'true'
            );
          const toast =
            /Thread resolved/i.test(bodyText) ||
            /Thread unresolved/i.test(bodyText);
          return { busy: !!busy, toast };
        })()
      `);
      if (ready && ready.busy === false) break;
    }
  });

  run('R4 Unresolve button rendered + restore', () => {
    waitMs(400);
    const id = resolvedThreadId;
    assert(id, 'R4: missing resolvedThreadId from R3');

    // Show resolved threads (filter) + expand collapsed so Unresolve can paint
    evalInPage(`
      (() => {
        const btns = [...document.querySelectorAll('button, [role="button"]')];
        const resolved = btns.find((el) =>
          /^\\s*Resolved\\b/i.test((el.textContent || '').trim())
        );
        if (resolved) resolved.click();
        else {
          const all = btns.find((el) =>
            /^\\s*All\\b/i.test((el.textContent || '').trim())
          );
          if (all) all.click();
        }
        return true;
      })()
    `);
    waitMs(700);
    evalInPage(`
      (() => {
        document
          .querySelectorAll('.prp-inline-thread--collapsed .prp-thread-toggle')
          .forEach((t) => t.click());
        return document.querySelectorAll('.prp-inline-thread--collapsed').length;
      })()
    `);
    waitMs(500);

    let unresolveProbe = null;
    for (let i = 0; i < 40; i++) {
      unresolveProbe = evalInPage(`
        (() => {
          const id = ${JSON.stringify(id)};
          const all = [...document.querySelectorAll('[data-prp-composer-resolve="1"]')];
          let b =
            all.find(
              (el) =>
                el.getAttribute('data-prp-thread-node-id') === id &&
                /Unresolve/i.test(el.textContent || '')
            ) ||
            all.find((el) => /Unresolve conversation/i.test(el.textContent || ''));
          if (!b) {
            return {
              found: false,
              btnCount: all.length,
              labels: all.slice(0, 5).map((el) => (el.textContent || '').trim()),
              threadCount: document.querySelectorAll('.prp-inline-thread').length,
              collapsed: document.querySelectorAll('.prp-inline-thread--collapsed').length,
              busy: document.querySelectorAll('[aria-busy="true"], .prp-btn--loading').length,
            };
          }
          const r = b.getBoundingClientRect();
          const style = window.getComputedStyle(b);
          const row = b.closest('.prp-inline-thread__composer-actions');
          const disabled =
            Boolean(b.disabled) ||
            b.getAttribute('aria-disabled') === 'true' ||
            b.getAttribute('aria-busy') === 'true' ||
            b.classList.contains('prp-btn--loading');
          return {
            found: true,
            label: (b.textContent || '').trim(),
            id: b.getAttribute('data-prp-thread-node-id') || null,
            disabled,
            w: Math.round(r.width),
            h: Math.round(r.height),
            visible:
              r.width > 0 &&
              r.height > 0 &&
              style.display !== 'none' &&
              style.visibility !== 'hidden',
            rowOpen: row?.classList?.contains(
              'prp-inline-thread__composer-actions--open'
            ),
            inThread: Boolean(b.closest('.prp-inline-thread')),
          };
        })()
      `);
      // Wait until painted AND not actionBusy (resolve refresh can leave busy briefly)
      if (
        unresolveProbe?.found &&
        unresolveProbe?.visible &&
        unresolveProbe?.disabled === false
      ) {
        break;
      }
      waitMs(300);
    }

    if (!unresolveProbe?.found) {
      // Cleanup so PR does not stay resolved; still fail the render assertion
      try {
        execSync(
          `gh api graphql -f query='mutation { unresolveReviewThread(input:{threadId:"${id}"}) { thread { isResolved } } }'`,
          { encoding: 'utf8' }
        );
      } catch {
        /* ignore */
      }
      assert(
        false,
        `R4: Unresolve button not rendered after resolve+filter/expand: ${JSON.stringify(unresolveProbe)}`
      );
    }

    assert(
      /^PRRT_/i.test(unresolveProbe.id || id),
      `R4: Unresolve missing PRRT id: ${JSON.stringify(unresolveProbe)}`
    );
    assert(
      /Unresolve conversation/i.test(unresolveProbe.label || ''),
      `R4: unexpected Unresolve label: ${JSON.stringify(unresolveProbe)}`
    );
    assert(
      unresolveProbe.visible === true,
      `R4: Unresolve not visible (geometry): ${JSON.stringify(unresolveProbe)}`
    );
    assert(
      Number(unresolveProbe.w) >= 40 && Number(unresolveProbe.h) >= 16,
      `R4: Unresolve box too small: ${JSON.stringify(unresolveProbe)}`
    );
    assert(
      unresolveProbe.disabled === false,
      `R4: Unresolve disabled: ${JSON.stringify(unresolveProbe)}`
    );
    assert(
      unresolveProbe.inThread === true,
      `R4: Unresolve not in thread: ${JSON.stringify(unresolveProbe)}`
    );

    const unresolveBefore = Number(
      evalInPage(`
        [...document.querySelectorAll('[data-prp-composer-resolve="1"]')].filter(
          (el) => /Unresolve/i.test(el.textContent || '')
        ).length
      `) || 0
    );
    const clicked = evalInPage(`
      (() => {
        const id = ${JSON.stringify(unresolveProbe.id || id)};
        const btns = [...document.querySelectorAll('[data-prp-composer-resolve="1"]')];
        // Prefer exact PRRT match (enabled Unresolve) — never fall through to a
        // different resolved thread or a still-busy disabled control.
        let b = btns.find(
          (el) =>
            el.getAttribute('data-prp-thread-node-id') === id &&
            /Unresolve/i.test(el.textContent || '') &&
            !el.disabled
        );
        if (!b) {
          b = btns.find(
            (el) =>
              el.getAttribute('data-prp-thread-node-id') === id &&
              /Unresolve/i.test(el.textContent || '')
          );
        }
        if (!b) return { ok: false, reason: 'no-btn' };
        if (b.disabled) return { ok: false, reason: 'disabled', id };
        // mousedown (cancelable) + native click — matches product empty-reply path.
        // Re-query after mousedown in case the row re-rendered under React.
        b.dispatchEvent(
          new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            view: window,
          })
        );
        const mid =
          document.querySelector(
            '[data-prp-composer-resolve="1"][data-prp-thread-node-id="' +
              id +
              '"]'
          ) || b;
        mid.click();
        const afterBtn = document.querySelector(
          '[data-prp-composer-resolve="1"][data-prp-thread-node-id="' + id + '"]'
        );
        return {
          ok: true,
          id: mid.getAttribute('data-prp-thread-node-id') || '',
          labelAfter: (afterBtn?.textContent || '').trim(),
          toast: (
            document.querySelector('.prp-action-toast__text')?.textContent || ''
          ).trim(),
          disabledAfter: afterBtn ? Boolean(afterBtn.disabled) : null,
        };
      })()
    `);
    assert(
      clicked?.ok,
      `R4: could not click Unresolve: ${JSON.stringify(clicked)}`
    );

    // After unresolve the thread leaves the "Resolved" filter (correct UX).
    // Switch back to All so the restored "Resolve conversation" control can paint.
    waitMs(200);
    evalInPage(`
      (() => {
        const btns = [...document.querySelectorAll('button, [role="button"]')];
        const all = btns.find((el) =>
          /^\\s*All\\b/i.test((el.textContent || '').trim())
        );
        if (all) all.click();
        return true;
      })()
    `);
    waitMs(400);
    // Expand any collapsed rows so the Resolve control is targetable.
    evalInPage(`
      (() => {
        document
          .querySelectorAll('.prp-inline-thread--collapsed .prp-thread-toggle')
          .forEach((t) => t.click());
        return true;
      })()
    `);

    let after = null;
    for (let i = 0; i < 48; i++) {
      waitMs(250);
      after = evalInPage(`
        (() => {
          const id = ${JSON.stringify(unresolveProbe.id || id)};
          const bodyText = document.body.innerText || '';
          const resolveBtn = [...document.querySelectorAll('[data-prp-composer-resolve="1"]')].find(
            (el) =>
              el.getAttribute('data-prp-thread-node-id') === id &&
              /Resolve conversation/i.test(el.textContent || '')
          );
          let geom = null;
          if (resolveBtn) {
            const r = resolveBtn.getBoundingClientRect();
            geom = {
              w: Math.round(r.width),
              h: Math.round(r.height),
              visible: r.width > 0 && r.height > 0,
            };
          }
          const unresolveLeft = [...document.querySelectorAll('[data-prp-composer-resolve="1"]')].filter(
            (el) => /Unresolve/i.test(el.textContent || '')
          ).length;
          return {
            resolveAgainInDom: !!resolveBtn,
            resolveLabel: (resolveBtn?.textContent || '').trim(),
            geom,
            msgHit: /Thread unresolved/i.test(bodyText),
            gqlFail: /GitHub GraphQL:/i.test(bodyText),
            rateLimitError: /rateLimit|Field ['"]rateLimit['"]/i.test(bodyText),
            unresolveLeft,
          };
        })()
      `);
      if (after?.rateLimitError || after?.gqlFail) break;
      if (
        after?.resolveAgainInDom ||
        after?.msgHit ||
        after?.unresolveLeft === 0 ||
        (unresolveBefore > 0 &&
          Number(after?.unresolveLeft) < unresolveBefore)
      ) {
        break;
      }
    }
    assert(
      !after?.rateLimitError,
      `R4: unresolve rateLimit: ${JSON.stringify(after)}`
    );
    assert(!after?.gqlFail, `R4: unresolve GraphQL error: ${JSON.stringify(after)}`);
    assert(
      after?.resolveAgainInDom ||
        after?.msgHit ||
        after?.unresolveLeft === 0 ||
        (unresolveBefore > 0 &&
          Number(after?.unresolveLeft) < unresolveBefore),
      `R4: unresolve no effect: ${JSON.stringify({ after, unresolveBefore, clicked })}`
    );
    if (after?.resolveAgainInDom) {
      assert(
        /Resolve conversation/i.test(after.resolveLabel || ''),
        `R4: Resolve label not restored: ${JSON.stringify(after)}`
      );
      assert(
        after.geom?.visible === true,
        `R4: restored Resolve not visible: ${JSON.stringify(after)}`
      );
    }
  });

  return steps;
}

/** Legacy bag runner */
export async function runResolveThread(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
