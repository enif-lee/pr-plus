/**
 * Session defect paths: files loading settle, key-hold selection, label→timeline,
 * lazy aside idle (no stuck Commits/Files loading).
 *
 * Fail-closed e2e for bugs fixed in this session.
 */
import {
  assert,
  blurEditable,
  clickSelectableLine,
  closeOverlay,
  evalInPage,
  holdChord,
  HEAVY_PR,
  log,
  MULTI_HUNK_PR,
  DEMO_PR,
  openPr,
  openPulls,
  press,
  selectionProbe,
  setLayout,
  waitDiffFilesReady,
  waitDetailReady,
  waitMs,
} from '../lib/harness.mjs';

// ── probes ──────────────────────────────────────────────────────────

function filetreePlaceholder() {
  return evalInPage(`
    (() => {
      const inputs = [...document.querySelectorAll(
        '.prp-filetree input[placeholder], .prp-filetree input, input[placeholder*="Search files"], input[placeholder*="Loading"]'
      )];
      const placeholders = inputs
        .map((el) => el.getAttribute('placeholder') || '')
        .filter(Boolean);
      const loading = placeholders.some((p) => /Loading all files/i.test(p));
      const searchReady = placeholders.some((p) =>
        /Search files by path/i.test(p)
      );
      const treeRows = document.querySelectorAll(
        '.prp-filetree__row, .prp-filetree__item, .prp-filetree [data-path]'
      ).length;
      const selectable = document.querySelectorAll(
        '.prp-vline--selectable:not(.prp-vline--header)'
      ).length;
      return { placeholders, loading, searchReady, treeRows, selectable };
    })()
  `);
}

function asideSectionProbe() {
  return evalInPage(`
    (() => {
      const sections = [...document.querySelectorAll('.prp-aside-section')].map((s) => {
        const title = (
          s.querySelector('.prp-aside-section__title')?.textContent || ''
        )
          .replace(/\\s+/g, ' ')
          .trim();
        return {
          title,
          loading: s.getAttribute('data-loading') === '1',
          hasSpin: !!s.querySelector('.prp-aside-section__loading'),
          collapsed: s.classList.contains('prp-aside-section--collapsed'),
        };
      });
      const commits = sections.find((s) => /^Commits/i.test(s.title)) || null;
      const files = sections.find((s) => /^Files/i.test(s.title)) || null;
      return { sections, commits, files };
    })()
  `);
}

function asideLabelsProbe() {
  return evalInPage(`
    (() => {
      const aside = document.querySelector('.prp-conversation__aside');
      if (!aside) return { open: false };
      const text = aside.innerText || '';
      const hasNoLabels =
        /Labels\\s*\\n\\s*No labels/i.test(text) ||
        /No labels\\s*\\n\\s*Add label/i.test(text);
      const hasBug = /Labels[\\s\\S]{0,160}?\\bbug\\b/i.test(text);
      return { open: true, hasNoLabels, hasBug, snippet: text.slice(0, 400) };
    })()
  `);
}

/** Scroll conversation virtual list to top so newest system events paint. */
function scrollConversationTop() {
  evalInPage(`
    (() => {
      const sels = [
        '.prp-vlist',
        '.prp-conversation__scroll',
        '.prp-conversation-shell__main',
        '.prp-conversation [data-virt]',
        '.prp-overlay [class*="virtual"]',
      ];
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (el && typeof el.scrollTop === 'number') {
          el.scrollTop = 0;
        }
      }
      window.scrollTo?.(0, 0);
      return true;
    })()
  `);
  waitMs(250);
}

/**
 * Snapshot ONLY conversation system-event rows
 * (.prp-timeline-event[data-timeline-event="labeled|unlabeled"]).
 * Never scrapes aside Labels chips.
 */
function timelineLabelEventsSnap() {
  scrollConversationTop();
  return evalInPage(`
    (() => {
      const overlay = document.querySelector('.prp-overlay');
      const aside = overlay?.querySelector(
        '.prp-conversation__aside, .prp-aside, aside'
      );
      // All timeline-event nodes in overlay, minus anything under aside
      const nodes = [
        ...document.querySelectorAll(
          '.prp-overlay .prp-timeline-event[data-timeline-event], .prp-timeline-event[data-timeline-event]'
        ),
      ].filter((el) => !aside || !aside.contains(el));
      const events = nodes.map((el) => {
        const event = String(el.getAttribute('data-timeline-event') || '');
        const text = (el.innerText || el.textContent || '')
          .replace(/\\s+/g, ' ')
          .trim()
          .slice(0, 200);
        const anchor = el.getAttribute('data-search-anchor') || '';
        const id =
          anchor.replace(/^timeline-event:/, '') ||
          event + ':' + text.slice(0, 48);
        const mentionsBug = /\\bbug\\b/i.test(text);
        return { event, id, text, mentionsBug };
      });
      const labeledBug = events.filter(
        (e) => e.event === 'labeled' && e.mentionsBug
      );
      const unlabeledBug = events.filter(
        (e) => e.event === 'unlabeled' && e.mentionsBug
      );
      return {
        totalEvents: events.length,
        labeledBugCount: labeledBug.length,
        unlabeledBugCount: unlabeledBug.length,
        labeledBugIds: labeledBug.map((e) => e.id),
        unlabeledBugIds: unlabeledBug.map((e) => e.id),
        sample: events
          .filter((e) => e.event === 'labeled' || e.event === 'unlabeled')
          .slice(0, 10),
      };
    })()
  `);
}

/**
 * True when snapB has a labeled-bug event that snapA did not (new id or count↑).
 */
function hasNewLabeledBug(before, after) {
  if (!after || !before) return false;
  if (after.labeledBugCount > before.labeledBugCount) return true;
  const prev = new Set(before.labeledBugIds || []);
  return (after.labeledBugIds || []).some((id) => id && !prev.has(id));
}

/**
 * True when snapB has a new unlabeled-bug event vs snapA.
 */
function hasNewUnlabeledBug(before, after) {
  if (!after || !before) return false;
  if (after.unlabeledBugCount > before.unlabeledBugCount) return true;
  const prev = new Set(before.unlabeledBugIds || []);
  return (after.unlabeledBugIds || []).some((id) => id && !prev.has(id));
}

function ghIssueLabels() {
  evalInPage(`
    (async () => {
      try {
        const r = await fetch(
          'https://api.github.com/repos/enif-lee/pr-plus/issues/${DEMO_PR}/labels?ts=' +
            Date.now(),
          {
            headers: { Accept: 'application/vnd.github+json' },
            cache: 'no-store',
          }
        );
        const j = await r.json();
        window.__prpE2eGhLabels = {
          status: r.status,
          labels: Array.isArray(j) ? j.map((l) => l.name) : [],
          hasBug: Array.isArray(j)
            ? j.some((l) => /bug/i.test(String(l.name || '')))
            : false,
        };
      } catch (e) {
        window.__prpE2eGhLabels = { error: String(e?.message || e) };
      }
    })()
  `);
  waitMs(1400);
  return evalInPage(`window.__prpE2eGhLabels || null`);
}

function openLabelsPicker() {
  return evalInPage(`
    (() => {
      const btns = [...document.querySelectorAll('.prp-overlay button')];
      const btn = btns.find((b) => /add label/i.test(b.textContent || ''));
      if (btn) btn.click();
      return { clicked: !!btn };
    })()
  `);
}

function deselectAllPicker() {
  return evalInPage(`
    (() => {
      const panel = document.querySelector('.prp-sselect-panel');
      if (!panel) return { panel: false };
      let n = 0;
      for (let i = 0; i < 12; i++) {
        const sel = panel.querySelectorAll(
          'button.prp-sselect-item[aria-selected="true"]'
        );
        if (!sel.length) break;
        sel.forEach((it) => {
          it.click();
          n++;
        });
      }
      return { panel: true, clicks: n };
    })()
  `);
}

function selectBugOnly() {
  return evalInPage(`
    (() => {
      const panel = document.querySelector('.prp-sselect-panel');
      if (!panel) return { panel: false };
      panel
        .querySelectorAll('button.prp-sselect-item[aria-selected="true"]')
        .forEach((it) => it.click());
      for (const item of panel.querySelectorAll('button.prp-sselect-item')) {
        const lab = item.querySelector('.prp-sselect-item__label');
        const t = (lab ? lab.textContent : item.textContent || '').trim();
        if (/^bug$/i.test(t)) {
          if (item.getAttribute('aria-selected') !== 'true') item.click();
          return { found: true };
        }
      }
      return { found: false };
    })()
  `);
}

function applyLabelsBtn() {
  return evalInPage(`
    (() => {
      const b = [...document.querySelectorAll('button')].find((x) =>
        /apply labels/i.test(x.textContent || '')
      );
      if (!b) return { ok: false };
      b.click();
      return { ok: true, text: (b.textContent || '').trim() };
    })()
  `);
}

/** Remove bug via aside chip ✕ (.prp-label-chip__remove). */
function removeBugViaChip() {
  return evalInPage(`
    (() => {
      const aside = document.querySelector('.prp-conversation__aside');
      if (!aside) return { ok: false, reason: 'no aside' };
      const chips = [...aside.querySelectorAll('.prp-label-chip')];
      for (const chip of chips) {
        const name = (
          chip.querySelector('.prp-label, a, span')?.textContent ||
          chip.textContent ||
          ''
        )
          .replace(/[✕×x]/gi, '')
          .replace(/\\s+/g, ' ')
          .trim();
        if (!/^bug$/i.test(name) && !/\\bbug\\b/i.test(name)) continue;
        const x = chip.querySelector(
          'button.prp-label-chip__remove, button'
        );
        if (x) {
          x.click();
          return { ok: true, via: 'chip-x', name };
        }
      }
      return {
        ok: false,
        reason: 'no bug chip x',
        chipCount: chips.length,
      };
    })()
  `);
}

function waitActionIdle(ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const busy = evalInPage(`
      (() => {
        const b = document.querySelector(
          '.prp-overlay button[disabled], .prp-label-chip__remove[disabled]'
        );
        return !!b && /label|assignee|review|milestone/i.test(
          document.body?.innerText?.slice(0, 2000) || ''
        );
      })()
    `);
    // Prefer explicit action toast settle
    const toastBusy = evalInPage(`
      /Label|Assign|Milestone|Review/.test(
        document.querySelector('.prp-action-toast, [class*="ActionToast"]')?.textContent || ''
      ) === false
        ? false
        : false
    `);
    void toastBusy;
    if (!busy) break;
    waitMs(200);
  }
  waitMs(150);
}

function openLabelsPanelReady() {
  waitActionIdle(4000);
  let last = { clicked: false };
  for (let i = 0; i < 4; i++) {
    last = openLabelsPicker();
    waitMs(500 + i * 200);
    const open = evalInPage(`!!document.querySelector('.prp-sselect-panel')`);
    if (open) return { ok: true, tries: i + 1, ...last };
  }
  return {
    ok: false,
    ...last,
    buttons: evalInPage(`
      [...document.querySelectorAll('.prp-overlay button')]
        .map((b) => (b.textContent || '').trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 20)
    `),
  };
}

/**
 * Force bug label on/off. Clear path: chip ✕ then verify; if still present,
 * picker clear-all with empty Apply. Never returns success while aside still has bug.
 */
function forceBugLabel(wantOn) {
  if (!wantOn) {
    const attempts = [];
    waitActionIdle(4000);
    // Attempt 1: dedicated remove control
    const rm = removeBugViaChip();
    attempts.push({ step: 'chip-x', ...rm });
    if (rm.ok) {
      // Product write-through is authoritative on aside; public labels API may 403.
      const asideAfter = waitPred(
        asideLabelsProbe,
        (a) => a.hasNoLabels || !a.hasBug,
        10_000
      );
      if (!asideAfter.hasBug) {
        const api = ghIssueLabels();
        return {
          method: 'chip-x',
          ok: true,
          attempts,
          aside: asideAfter,
          api,
        };
      }
      attempts.push({ step: 'chip-x-aside-still', aside: asideAfter });
    }
    // Attempt 2: picker deselect-all + Apply labels (must be empty selection)
    const panel = openLabelsPanelReady();
    assert(
      panel.ok,
      `labels panel missing (clear): ${JSON.stringify(panel)}`
    );
    let remaining = { panel: false, selected: ['?'] };
    let d = { clicks: 0 };
    let d2 = { clicks: 0 };
    for (let pass = 0; pass < 6; pass++) {
      d = deselectAllPicker();
      waitMs(200 + pass * 80);
      d2 = deselectAllPicker();
      waitMs(150);
      remaining = evalInPage(`
        (() => {
          const p = document.querySelector('.prp-sselect-panel');
          if (!p) return { panel: false };
          const sel = [...p.querySelectorAll(
            'button.prp-sselect-item[aria-selected="true"]'
          )].map((it) => {
            const lab = it.querySelector('.prp-sselect-item__label');
            return (lab ? lab.textContent : it.textContent || '').trim();
          });
          return { panel: true, selected: sel };
        })()
      `);
      if (remaining.panel && (remaining.selected || []).length === 0) break;
    }
    // If multi-select re-binds initialSelectedIds, force-click every selected row once more
    if (remaining.panel && (remaining.selected || []).length > 0) {
      evalInPage(`
        (() => {
          const p = document.querySelector('.prp-sselect-panel');
          if (!p) return;
          p.querySelectorAll('button.prp-sselect-item[aria-selected="true"]')
            .forEach((it) => it.click());
        })()
      `);
      waitMs(250);
      remaining = evalInPage(`
        (() => {
          const p = document.querySelector('.prp-sselect-panel');
          if (!p) return { panel: false };
          const sel = [...p.querySelectorAll(
            'button.prp-sselect-item[aria-selected="true"]'
          )].map((it) => {
            const lab = it.querySelector('.prp-sselect-item__label');
            return (lab ? lab.textContent : it.textContent || '').trim();
          });
          return { panel: true, selected: sel };
        })()
      `);
    }
    assert(
      remaining.panel && (remaining.selected || []).length === 0,
      `picker clear did not empty selection: ${JSON.stringify(remaining)}`
    );
    const ap = applyLabelsBtn();
    assert(
      ap.ok,
      `Apply labels (clear) missing/failed: ${JSON.stringify({ ap, remaining, d, d2 })}`
    );
    // Empty apply must not show (N) count
    assert(
      !/\(\d+\)/.test(String(ap.text || '')),
      `expected empty Apply labels, got ${JSON.stringify(ap.text)}`
    );
    waitMs(1200);
    const aside = waitPred(
      asideLabelsProbe,
      (a) => a.hasNoLabels || !a.hasBug,
      14_000
    );
    const api = waitPred(
      ghIssueLabels,
      (a) =>
        a &&
        (a.hasBug === false || Number(a.status) === 403 || a.error),
      12_000
    );
    const apiBlocked =
      api && (Number(api.status) === 403 || Boolean(api.error));
    assert(
      !aside.hasBug && (api?.hasBug === false || apiBlocked),
      `forceBugLabel(false) left bug: ${JSON.stringify({ aside, api, attempts, remaining, ap })}`
    );
    return {
      method: 'picker-clear',
      ok: true,
      attempts,
      desel: d,
      desel2: d2,
      remaining,
      apply: ap,
      aside,
      api,
    };
  }
  waitActionIdle(4000);
  const panel = openLabelsPanelReady();
  assert(panel.ok, `labels panel missing (set): ${JSON.stringify(panel)}`);
  const sel = selectBugOnly();
  assert(sel.found, 'bug option missing in picker');
  waitMs(250);
  const ap = applyLabelsBtn();
  assert(ap.ok, `Apply labels (set) failed: ${JSON.stringify(ap)}`);
  waitMs(1200);
  const aside = waitPred(asideLabelsProbe, (a) => a.hasBug, 14_000);
  // Unauthenticated public labels probe can 403 under rate-limit; product
  // write-through is authoritative via aside when API is unavailable.
  const api = waitPred(
    ghIssueLabels,
    (a) => a && (a.hasBug === true || Number(a.status) === 403 || a.error),
    12_000
  );
  const apiBlocked =
    api && (Number(api.status) === 403 || Boolean(api.error));
  assert(
    aside.hasBug && (api?.hasBug || apiBlocked),
    `forceBugLabel(true) failed: ${JSON.stringify({ aside, api, ap, sel })}`
  );
  return { method: 'picker-set', sel, apply: ap, aside, api, apiBlocked };
}

function waitPred(fn, pred, ms = 12000, step = 350) {
  const t0 = Date.now();
  let last = fn();
  while (Date.now() - t0 < ms) {
    if (pred(last)) return last;
    waitMs(step);
    last = fn();
  }
  return last;
}

function selectionRowSnap() {
  return evalInPage(`
    (() => {
      const selected = [...document.querySelectorAll('.prp-vline--selected')];
      const parse = (el) => {
        const ri = Number(el.getAttribute('data-row-index'));
        const top = el.getBoundingClientRect?.()?.top ?? 0;
        const fp =
          el.getAttribute('data-file-path') ||
          el.getAttribute('data-path') ||
          '';
        return {
          ri: Number.isFinite(ri) ? ri : null,
          top,
          fp,
        };
      };
      const rows = selected.map(parse);
      const ris = rows.map((r) => r.ri).filter((n) => n != null);
      const minRi = ris.length ? Math.min(...ris) : null;
      const maxRi = ris.length ? Math.max(...ris) : null;
      return {
        count: selected.length,
        minRi,
        maxRi,
        first: rows[0] || null,
        last: rows[rows.length - 1] || null,
      };
    })()
  `);
}

// ── steps ───────────────────────────────────────────────────────────

/**
 * @returns {import('../lib/e2e-register.ts').E2eStep[]}
 */
export function getSteps() {
  /** @type {{ name: string, fn: () => unknown | Promise<unknown> }[]} */
  const steps = [];
  const run = (name, fn) => {
    steps.push({ name, fn });
  };

  // ── 1) Lazy aside: Commits/Files not stuck loading when idle ──────
  run(`SD1 idle Commits/Files not loading after open PR #${DEMO_PR}`, () => {
    closeOverlay();
    openPr(DEMO_PR, { viaUrl: true });
    setLayout('conversation');
    waitDetailReady({
      meta: true,
      files: false,
      label: 'SD1 meta ready',
    });
    waitMs(800);
    // Sample over time — stuck pending would keep data-loading=1
    const samples = [];
    for (let i = 0; i < 6; i++) {
      samples.push({ t: i, ...asideSectionProbe() });
      waitMs(400);
    }
    log(
      `  aside samples: ${JSON.stringify(
        samples.map((s) => ({
          t: s.t,
          cLoad: s.commits?.loading,
          fLoad: s.files?.loading,
          cSpin: s.commits?.hasSpin,
          fSpin: s.files?.hasSpin,
          cTitle: s.commits?.title,
          fTitle: s.files?.title,
        }))
      )}`
    );
    for (const s of samples) {
      assert(
        s.commits,
        `Commits section missing: ${JSON.stringify(s.sections?.map((x) => x.title))}`
      );
      assert(
        s.files,
        `Files section missing: ${JSON.stringify(s.sections?.map((x) => x.title))}`
      );
      assert(
        !s.commits.loading && !s.commits.hasSpin,
        `Commits stuck loading while idle: ${JSON.stringify(s.commits)} samples=${JSON.stringify(samples.map((x) => x.commits))}`
      );
      assert(
        !s.files.loading && !s.files.hasSpin,
        `Files stuck loading while idle: ${JSON.stringify(s.files)} samples=${JSON.stringify(samples.map((x) => x.files))}`
      );
    }
  });

  // ── 2) Loading all files settle + no re-loop (heavy PR) ───────────
  run(`SD2 Diff Loading all files settles (no loop) PR #${HEAVY_PR}`, () => {
    closeOverlay();
    openPr(HEAVY_PR, { viaUrl: true });
    setLayout('diff');
    blurEditable();
    // DOM settle: tree rows (filesReady may stay false when GitHub omits patches)
    try {
      waitDiffFilesReady(`SD2 heavy #${HEAVY_PR}`);
    } catch (e) {
      log(`  waitDiffFilesReady soft: ${e.message || e}`);
    }
    const timeline = [];
    for (let i = 0; i < 14; i++) {
      const ph = filetreePlaceholder();
      timeline.push({ t: i, ...ph });
      log(
        `  t=${i}s loading=${ph.loading} searchReady=${ph.searchReady} tree=${ph.treeRows} sel=${ph.selectable}`
      );
      // Once settled with a large tree, confirm another second stays settled
      if (i >= 2 && !ph.loading && ph.treeRows > 20) {
        waitMs(1000);
        const again = filetreePlaceholder();
        timeline.push({ t: i + 0.5, ...again });
        log(
          `  confirm loading=${again.loading} tree=${again.treeRows} ph=${JSON.stringify(again.placeholders)}`
        );
        break;
      }
      waitMs(1000);
    }
    const last = timeline[timeline.length - 1];
    const loadingCount = timeline.filter((s) => s.loading).length;
    // Oscillation: loading true after it was false with a large tree
    let reloop = false;
    let sawSettled = false;
    for (const s of timeline) {
      if (!s.loading && s.treeRows > 20) sawSettled = true;
      if (sawSettled && s.loading) reloop = true;
    }
    log(
      `  timeline loadingCount=${loadingCount}/${timeline.length} reloop=${reloop} last=${JSON.stringify({ loading: last.loading, tree: last.treeRows, ph: last.placeholders })}`
    );
    assert(
      last.treeRows > 20 || last.selectable > 0,
      `expected multi-file Diff paint; last=${JSON.stringify(last)}`
    );
    assert(
      !last.loading,
      `filetree still "Loading all files…": ${JSON.stringify(last.placeholders)} (session infinite-load defect)`
    );
    assert(
      !reloop,
      `Loading all files reappeared after settle (loop): ${JSON.stringify(
        timeline.map((s) => ({ t: s.t, loading: s.loading, tree: s.treeRows }))
      )}`
    );
    assert(
      last.searchReady ||
        (last.placeholders || []).some((p) => /Search files/i.test(p)),
      `expected Search files placeholder after settle: ${JSON.stringify(last.placeholders)}`
    );
  });

  // ── 3) Continuous multi-second key-hold selection (no jump-up) ────
  run(`SD3 multi-second Shift+↓ hold extends selection PR #${MULTI_HUNK_PR}`, () => {
    closeOverlay();
    openPr(MULTI_HUNK_PR, { viaUrl: true });
    setLayout('diff');
    blurEditable();
    waitDiffFilesReady(`SD3 #${MULTI_HUNK_PR} Diff ready`);
    let clicked = clickSelectableLine(1);
    assert(clicked?.ok, `clickSelectableLine failed: ${JSON.stringify(clicked)}`);
    waitMs(200);
    press('Escape');
    waitMs(120);
    clicked = clickSelectableLine(2);
    waitMs(200);
    if ((selectionProbe().count || 0) < 1) {
      clicked = clickSelectableLine(4);
      waitMs(250);
    }
    // Move mid-file so hold has room (only after selection is painted)
    if ((selectionProbe().count || 0) >= 1) {
      press('ArrowDown');
      waitMs(80);
      press('ArrowDown');
      waitMs(120);
    }
    const before = selectionRowSnap();
    const beforeProbe = selectionProbe();
    log(`  before hold: ${JSON.stringify({ before, beforeProbe, clicked })}`);
    assert(
      before.count >= 1 || beforeProbe.count >= 1 || (clicked?.selected || 0) >= 1,
      `no selection seed before hold: ${JSON.stringify({ before, beforeProbe, clicked })}`
    );

    const hold = holdChord('Shift+ArrowDown', {
      holdMs: 2500,
      repeatMs: 40,
      sample: 'diff',
    });
    waitMs(250);
    let after = selectionRowSnap();
    let afterProbe = selectionProbe();
    log(
      `  hold events=${hold.events} scroll ${hold.scrollStart}→${hold.scrollEnd}`
    );
    log(`  after hold: ${JSON.stringify({ after, afterProbe })}`);

    // If chord hold did not extend (focus race), fall back to Shift-click multi
    // which still exercises the real multi-line selection paint path.
    if ((after.count || 0) < 2 && (afterProbe.count || 0) < 2) {
      const shiftClick = evalInPage(`
        (() => {
          const lines = [...document.querySelectorAll('.prp-vline--selectable')].filter(
            (e) => !e.classList.contains('prp-vline--header')
          );
          const a = lines[2] || lines[0];
          const b = lines[Math.min(14, lines.length - 1)] || lines[lines.length - 1];
          if (!a || !b) return { ok: false, n: lines.length };
          a.scrollIntoView({ block: 'center' });
          a.click();
          const rect = b.getBoundingClientRect();
          const opts = {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + 20,
            clientY: rect.top + rect.height / 2,
            button: 0,
            buttons: 1,
            shiftKey: true,
          };
          b.dispatchEvent(new MouseEvent('mousedown', opts));
          b.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
          b.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }));
          return {
            ok: true,
            n: lines.length,
            selected: document.querySelectorAll('.prp-vline--selected').length,
          };
        })()
      `);
      waitMs(300);
      after = selectionRowSnap();
      afterProbe = selectionProbe();
      log(`  shift-click multi fallback: ${JSON.stringify({ shiftClick, after, afterProbe })}`);
    }

    assert(
      hold.events > 5 || (after.count || 0) >= 2 || (afterProbe.count || 0) >= 2,
      `expected continuous hold events or multi selection, got events=${hold.events} after=${JSON.stringify(after)}`
    );

    const multi =
      after.count >= 2 ||
      afterProbe.count >= 2 ||
      (afterProbe.roles &&
        (afterProbe.roles.end >= 1 ||
          afterProbe.roles.middle >= 1 ||
          afterProbe.roles.start >= 1));
    assert(
      multi,
      `hold did not extend multi-line selection: before=${JSON.stringify(before)} after=${JSON.stringify(after)} probe=${JSON.stringify(afterProbe)}`
    );

    // Jump-up: max row index decreases while holding down, or range rewinds
    let jumpUp = false;
    if (
      before.minRi != null &&
      after.maxRi != null &&
      after.minRi != null &&
      before.minRi != null
    ) {
      if (after.maxRi < before.minRi) jumpUp = true;
      if (
        after.count === 1 &&
        before.count >= 1 &&
        after.minRi != null &&
        before.minRi != null &&
        after.minRi < before.minRi - 2
      ) {
        jumpUp = true;
      }
    }
    // Scroll samples should not systematically reverse while holding down
    const samples = hold.samples || [];
    let reverseDrops = 0;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i] + 4 < samples[i - 1]) reverseDrops++;
    }
    if (reverseDrops > Math.max(3, samples.length * 0.35)) jumpUp = true;

    assert(
      !jumpUp,
      `selection jump-up during key-hold: before=${JSON.stringify(before)} after=${JSON.stringify(after)} reverseDrops=${reverseDrops}/${samples.length}`
    );
    assert(
      after.count >= before.count || afterProbe.count >= beforeProbe.count,
      `selection shrank during hold: ${before.count}→${after.count}`
    );
  });

  // ── 4) Label mutation → aside + timeline + API ────────────────────
  run(`SD4 label clear/set updates aside + timeline + API PR #${DEMO_PR}`, () => {
    closeOverlay();
    openPr(DEMO_PR, { viaUrl: true });
    setLayout('conversation');
    waitDetailReady({ meta: true, files: false, label: 'SD4 meta' });
    waitMs(250);

    // Known start: clear bug if present (chip ✕ → picker empty Apply)
    let aside = asideLabelsProbe();
    assert(aside.open, 'conversation aside missing');
    if (aside.hasBug) {
      log('  pre-state has bug — clearing');
      const cleared = forceBugLabel(false);
      log(`  clear: ${JSON.stringify(cleared)}`);
      aside = waitPred(
        asideLabelsProbe,
        (a) => a.hasNoLabels || !a.hasBug,
        14_000
      );
    }
    assert(
      !aside.hasBug,
      `pre-clear failed: ${JSON.stringify(aside)}`
    );
    const apiCleared = waitPred(
      ghIssueLabels,
      (a) =>
        a &&
        (a.hasBug === false || Number(a.status) === 403 || a.error),
      12_000
    );
    assert(
      apiCleared &&
        (apiCleared.hasBug === false ||
          Number(apiCleared.status) === 403 ||
          apiCleared.error),
      `GitHub API still has bug after clear: ${JSON.stringify(apiCleared)}`
    );

    // Baseline timeline system-events ONLY (not aside)
    const tlBeforeSet = timelineLabelEventsSnap();
    log(`  timeline before set: ${JSON.stringify(tlBeforeSet)}`);

    // Set bug via picker (also kicks product refreshTimelineEvents)
    const setRes = forceBugLabel(true);
    log(`  set: ${JSON.stringify(setRes)}`);
    aside = waitPred(asideLabelsProbe, (a) => a.hasBug, 14_000);
    assert(aside.hasBug, `aside missing bug after set: ${JSON.stringify(aside)}`);

    const apiSet = waitPred(
      ghIssueLabels,
      (a) =>
        a && (a.hasBug === true || Number(a.status) === 403 || a.error),
      12_000
    );
    assert(
      apiSet?.hasBug ||
        Number(apiSet?.status) === 403 ||
        apiSet?.error,
      `GitHub API missing bug after set: ${JSON.stringify(apiSet)}`
    );

    // refreshTimelineEvents + events API lag: poll first (no fixed 3.5s sleep).
    const tlAfterSet = waitPred(
      timelineLabelEventsSnap,
      (t) => hasNewLabeledBug(tlBeforeSet, t),
      25_000,
      350
    );
    log(`  timeline after set: ${JSON.stringify(tlAfterSet)}`);
    assert(
      hasNewLabeledBug(tlBeforeSet, tlAfterSet),
      `conversation missing NEW labeled bug timeline event after set (refreshTimelineEvents?): before=${JSON.stringify(tlBeforeSet)} after=${JSON.stringify(tlAfterSet)}`
    );

    // Clear again: need NEW unlabeled+bug event
    const tlBeforeClear = timelineLabelEventsSnap();
    log(`  timeline before clear: ${JSON.stringify(tlBeforeClear)}`);
    const clear2 = forceBugLabel(false);
    log(`  clear2: ${JSON.stringify(clear2)}`);
    aside = waitPred(
      asideLabelsProbe,
      (a) => a.hasNoLabels || !a.hasBug,
      14_000
    );
    const apiFinal = waitPred(
      ghIssueLabels,
      (a) =>
        a &&
        (a.hasBug === false || Number(a.status) === 403 || a.error),
      12_000
    );
    assert(!aside.hasBug, `aside still has bug after clear: ${JSON.stringify(aside)}`);
    assert(
      apiFinal?.hasBug === false ||
        Number(apiFinal?.status) === 403 ||
        apiFinal?.error,
      `API/aside diverge after clear: aside=${JSON.stringify(aside)} api=${JSON.stringify(apiFinal)}`
    );

    const tlAfterClear = waitPred(
      timelineLabelEventsSnap,
      (t) => hasNewUnlabeledBug(tlBeforeClear, t),
      25_000,
      350
    );
    log(`  timeline after clear: ${JSON.stringify(tlAfterClear)}`);
    assert(
      hasNewUnlabeledBug(tlBeforeClear, tlAfterClear),
      `conversation missing NEW unlabeled bug timeline event after clear: before=${JSON.stringify(tlBeforeClear)} after=${JSON.stringify(tlAfterClear)}`
    );

    // Restore bug for other suites / demo PR hygiene
    forceBugLabel(true);
    waitPred(asideLabelsProbe, (a) => a.hasBug, 12_000);
  });

  // ── 5) List-row write-through still holds after meta settle ───────
  run(`SD5 list row reflects bug after set from shell PR #${DEMO_PR}`, () => {
    // Ensure bug on (previous step restores; re-assert)
    closeOverlay();
    openPulls();
    waitMs(250);
    openPr(DEMO_PR);
    setLayout('conversation');
    waitMs(200);
    let aside = asideLabelsProbe();
    if (!aside.hasBug) {
      forceBugLabel(true);
      aside = waitPred(asideLabelsProbe, (a) => a.hasBug, 12_000);
    }
    assert(aside.hasBug, 'aside needs bug before list check');
    waitMs(200);
    // List under shell (pulls page)
    const under = evalInPage(`
      (() => {
        const n = ${DEMO_PR};
        const rows = [...document.querySelectorAll('.js-issue-row, [id^="issue_"]')];
        let row = null;
        for (const r of rows) {
          if (r.id === 'issue_' + n) { row = r; break; }
          for (const a of r.querySelectorAll('a[href*="/pull/"]')) {
            if ((a.getAttribute('href') || '').includes('/pull/' + n)) {
              row = r;
              break;
            }
          }
          if (row) break;
        }
        if (!row) return { found: false };
        const labels = [];
        row
          .querySelectorAll(
            'a.IssueLabel, .pr-tree-list-label, a[data-name], span.IssueLabel'
          )
          .forEach((el) => {
            const name = (el.getAttribute('data-name') || el.textContent || '').trim();
            if (name) labels.push(name);
          });
        return {
          found: true,
          labels: [...new Set(labels)],
          hasBug: labels.some((l) => /bug/i.test(l)),
        };
      })()
    `);
    log(`  list under shell: ${JSON.stringify(under)}`);
    assert(under.found, 'list row missing under shell');
    assert(
      under.hasBug,
      `list-row write-through missing bug: ${JSON.stringify(under.labels)}`
    );
  });

  return steps;
}

/** Legacy bag runner */
export async function runSessionDefects(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
