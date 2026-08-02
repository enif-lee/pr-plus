/**
 * Thread bodies after GraphQL shell + selective comments:
 *  - Inline threads must show real markdown (not empty "_No content_")
 *  - Authors must not collapse to the "user" placeholder for loaded roots
 *  - After Diff layout + optional refresh, at least one thread has real body text
 *  - GraphQL cost log: shell cost ≤ 1; byIds not scaled by reactors(first:1)
 *
 *   rstest run -c rstest.e2e.config.ts thread-bodies
 */
import {
  assert,
  clearGraphqlCostLog,
  DEMO_PR,
  dumpGraphqlCostLog,
  openPr,
  openPulls,
  setLayout,
  waitDetailReady,
  waitDiffFilesReady,
  waitMs,
  log,
} from '../lib/harness.mjs';
import { evalInPage } from '../lib/ab.mjs';

/**
 * Pick cost-log rows for shell / byIds ops from dumpGraphqlCostLog summary.
 * @param {any} summary
 */
function costRowsForThreads(summary) {
  const byOp = Array.isArray(summary?.byOp) ? summary.byOp : [];
  const shell = byOp.filter((r) =>
    /reviewThreads\.(last|first)\.shell/i.test(String(r.op || ''))
  );
  const byIds = byOp.filter((r) =>
    /reviewThreads\.byIds/i.test(String(r.op || ''))
  );
  const shellCost = shell.reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const shellMax = shell.reduce(
    (m, r) => Math.max(m, Number(r.maxCost) || Number(r.cost) || 0),
    0
  );
  const byIdsCost = byIds.reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const byIdsMax = byIds.reduce(
    (m, r) => Math.max(m, Number(r.maxCost) || Number(r.cost) || 0),
    0
  );
  const byIdsCalls = byIds.reduce((s, r) => s + (Number(r.calls) || 0), 0);
  return {
    shell,
    byIds,
    shellCost,
    shellMax,
    byIdsCost,
    byIdsMax,
    byIdsCalls,
  };
}

/**
 * Snapshot Diff inline threads: bodies, authors, empty "No content" rows.
 */
function probeThreadBodies() {
  return evalInPage(`
    (() => {
      const cards = [...document.querySelectorAll('.prp-inline-thread')];
      const rows = cards.map((card, i) => {
        const md = card.querySelector('.prp-md');
        const authorEl =
          card.querySelector('.prp-user-link') ||
          card.querySelector('[data-prp-author]') ||
          card.querySelector('a[href*="/"]');
        const body = (md?.textContent || '').trim();
        const author = (authorEl?.textContent || '').trim();
        const collapsed = card.classList.contains('prp-inline-thread--collapsed');
        const isNoContent =
          /^_?No content_?$/i.test(body) || body === 'No content';
        const isUserPlaceholder = !author || /^user$/i.test(author);
        return {
          i,
          body: body.slice(0, 80),
          author: author.slice(0, 40),
          collapsed,
          isNoContent,
          isUserPlaceholder,
          hasRealBody: Boolean(body) && !isNoContent,
        };
      });
      const withBody = rows.filter((r) => r.hasRealBody);
      const emptyNoContent = rows.filter((r) => r.isNoContent);
      const userOnlyEmpty = rows.filter(
        (r) => r.isNoContent && r.isUserPlaceholder
      );
      return {
        threadCount: cards.length,
        withBodyCount: withBody.length,
        emptyNoContentCount: emptyNoContent.length,
        userOnlyEmptyCount: userOnlyEmpty.length,
        sampleBodies: withBody.slice(0, 3).map((r) => r.body),
        emptySample: emptyNoContent.slice(0, 3),
        rows: rows.slice(0, 12),
      };
    })()
  `);
}

/**
 * Detail-store probe: reviewComments should not be only empty shell placeholders
 * when GraphQL first:1 / by-ids ran.
 */
function probeDetailComments() {
  return evalInPage(`
    (() => {
      const host =
        document.getElementById('prp-page-embed') ||
        document.getElementById('prp-modal-host');
      // Prefer page-exposed e2e snapshot if present
      let detail = null;
      try {
        const raw = host?.getAttribute('data-prp-e2e-detail');
        if (raw) detail = JSON.parse(raw);
      } catch {}
      // Fallback: scan DOM only (detail may not be exposed)
      const mdBodies = [...document.querySelectorAll('.prp-inline-thread .prp-md')].map(
        (e) => (e.textContent || '').trim()
      );
      const real = mdBodies.filter(
        (b) => b && !/^_?No content_?$/i.test(b) && b !== 'No content'
      );
      return {
        mdCount: mdBodies.length,
        realBodyCount: real.length,
        realSample: real.slice(0, 3),
        hasDetailAttr: Boolean(detail),
      };
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

  run('TB.0 reload extension (pick up SW fetch query)', () => {
    // Unpacked SW can stay stale across rebuilds; force chrome.runtime.reload.
    try {
      evalInPage(
        `document.dispatchEvent(new CustomEvent('prp-reload-extension', { bubbles: true })); true`
      );
      log('  [TB.0] prp-reload-extension dispatched');
      waitMs(3500);
    } catch (e) {
      log(`  [TB.0] reload soft-fail ${e?.message || e}`);
    }
  });

  run('TB.1 open pulls', () => {
    openPulls();
  });

  run(`TB.2 open PR #${DEMO_PR}`, () => {
    clearGraphqlCostLog();
    openPr(DEMO_PR);
    waitDetailReady({ number: DEMO_PR, timeoutMs: 60000 });
  });

  run('TB.3 Diff layout + files ready', () => {
    setLayout('diff');
    waitDiffFilesReady(`thread-bodies #${DEMO_PR}`);
    waitMs(1200);
  });

  run('TB.3b GraphQL cost: shell ≤1; byIds not first:1-scaled', () => {
    const dump = dumpGraphqlCostLog({ label: 'TB open/diff settle' });
    const summary = dump?.summary || null;
    const rows = costRowsForThreads(summary);
    log(
      `  [TB.3b] shellCost=${rows.shellCost} shellMax=${rows.shellMax} ` +
        `byIdsCost=${rows.byIdsCost} byIdsMax=${rows.byIdsMax} byIdsCalls=${rows.byIdsCalls} ` +
        `ops=${JSON.stringify((summary?.byOp || []).map((r) => r.op).slice(0, 16))}`
    );
    // Shell must have run for threads open (last.shell or first.shell)
    assert(
      rows.shell.length > 0,
      `expected reviewThreads.*.shell in cost log; byOp=${JSON.stringify(summary?.byOp || [])}`
    );
    assert(
      rows.shellMax <= 1 && rows.shellCost <= rows.shell.length * 1,
      `shell cost must be ≤1 per call; got cost=${rows.shellCost} max=${rows.shellMax} ` +
        `shellRows=${JSON.stringify(rows.shell)}`
    );
    // If byIds ran (unresolved eager), count-only reactors keep cost flat (~1),
    // not ≈ unresolved thread count. Demo PR#7 has multiple unresolved; with
    // reactors(first:1) maxCost was ≈ id count. Allow small multi-call total.
    if (rows.byIdsCalls > 0) {
      assert(
        rows.byIdsMax <= 2,
        `byIds maxCost must stay low with reactors{totalCount} (not ~1/id); ` +
          `got max=${rows.byIdsMax} cost=${rows.byIdsCost} calls=${rows.byIdsCalls} ` +
          `byIds=${JSON.stringify(rows.byIds)}`
      );
      // Average per call should not look like "one point per unresolved id"
      const avg = rows.byIdsCost / rows.byIdsCalls;
      assert(
        avg <= 3,
        `byIds avg cost too high (suspect reactors(first:1) tax): avg=${avg} ` +
          `cost=${rows.byIdsCost} calls=${rows.byIdsCalls}`
      );
    }
  });

  run('TB.4 inline threads have real bodies (not empty No content)', () => {
    const p = probeThreadBodies();
    assert(p.threadCount > 0, `expected inline threads, got ${p.threadCount}`);
    assert(
      p.withBodyCount > 0,
      `expected at least one thread with real body; ` +
        `withBody=${p.withBodyCount} emptyNoContent=${p.emptyNoContentCount} ` +
        `sample=${JSON.stringify(p.rows?.slice?.(0, 4) || p)}`
    );
    // Regression: bulk merge must not wipe first:1 into empty shell placeholders
    // for every visible expanded thread. Allow collapsed resolved with short body,
    // but flag mass "No content" + "user" placeholders.
    assert(
      p.userOnlyEmptyCount === 0 || p.withBodyCount >= p.userOnlyEmptyCount,
      `too many empty user/No-content shells: ` +
        `userOnlyEmpty=${p.userOnlyEmptyCount} withBody=${p.withBodyCount} ` +
        `emptySample=${JSON.stringify(p.emptySample)}`
    );
    // Hard fail if majority of visible threads are empty placeholders
    if (p.threadCount >= 2) {
      assert(
        p.emptyNoContentCount < p.threadCount,
        `all/most threads are empty No content (${p.emptyNoContentCount}/${p.threadCount})`
      );
    }
  });

  run('TB.4b expand deferred thread forces byIds; cost stays flat', () => {
    // On demo PR, single-comment unresolved may skip open byIds (shell first:1
    // marks commentsLoaded). Expand a collapsed resolved multi-reply to exercise
    // ReviewThreadsByIdsFull with reactors{totalCount}.
    clearGraphqlCostLog();
    const expanded = evalInPage(`
      (() => {
        const btn = document.querySelector(
          '.prp-inline-thread--collapsed .prp-thread-toggle'
        );
        if (!btn) return { ok: false, reason: 'no-collapsed-toggle' };
        btn.click();
        return { ok: true };
      })()
    `);
    log(`  [TB.4b] expand ${JSON.stringify(expanded)}`);
    waitMs(3500);
    const dump = dumpGraphqlCostLog({ label: 'TB after expand deferred' });
    const rows = costRowsForThreads(dump?.summary || null);
    const logEntries = Array.isArray(dump?.log) ? dump.log : [];
    const byIdsEntries = logEntries.filter((e) =>
      /reviewThreads\.byIds/i.test(String(e?.op || ''))
    );
    log(
      `  [TB.4b] byIdsCalls=${rows.byIdsCalls} byIdsMax=${rows.byIdsMax} ` +
        `byIdsCost=${rows.byIdsCost} entries=${byIdsEntries.length} ` +
        `sample=${JSON.stringify(byIdsEntries.slice(0, 3))}`
    );
    if (expanded?.ok && byIdsEntries.length > 0) {
      for (const e of byIdsEntries) {
        assert(
          !e.err,
          `byIds must succeed (no comments first:1/100 conflict); err=${e.err} ` +
            `entry=${JSON.stringify(e)}`
        );
        const c = Number(e.cost);
        assert(
          Number.isFinite(c) && c <= 2,
          `byIds expand cost must be flat with reactors{totalCount}; got cost=${c} ` +
            `entry=${JSON.stringify(e)}`
        );
      }
      assert(
        rows.byIdsMax <= 2 && rows.byIdsMax >= 0,
        `byIds maxCost ≤2 after expand; got ${rows.byIdsMax}`
      );
      // Prefer true success with cost 1 on single-id expand (product count-only).
      const okCosts = byIdsEntries
        .map((e) => Number(e.cost))
        .filter((c) => Number.isFinite(c));
      assert(
        okCosts.some((c) => c <= 1),
        `expected at least one byIds call with cost≤1; costs=${JSON.stringify(okCosts)}`
      );
    } else if (expanded?.ok) {
      // Expand may hydrate from cache without network; bodies must still improve
      const p = probeThreadBodies();
      assert(
        p.withBodyCount > 0,
        `expand without byIds log still needs real bodies; ${JSON.stringify(p)}`
      );
      log('  [TB.4b] WARN: no byIds cost rows (cache hit?); body gate only');
    } else {
      log('  [TB.4b] skip: no collapsed thread to expand');
    }
  });

  run('TB.5 DOM markdown bodies non-empty after settle', () => {
    waitMs(500);
    const d = probeDetailComments();
    assert(
      d.realBodyCount > 0,
      `expected real .prp-md bodies after Diff settle; got ${JSON.stringify(d)}`
    );
  });

  run('TB.6 soft refresh keeps bodies + cost still flat', () => {
    const before = probeThreadBodies();
    clearGraphqlCostLog();
    evalInPage(`
      (() => {
        const b = [...document.querySelectorAll('button')].find((el) =>
          /refresh/i.test(
            (el.getAttribute('aria-label') || '') + (el.title || '') + (el.textContent || '')
          )
        );
        if (b) { b.click(); return true; }
        return false;
      })()
    `);
    waitMs(4000);
    waitDetailReady({ number: DEMO_PR, timeoutMs: 45000 });
    waitMs(800);
    const after = probeThreadBodies();
    assert(
      after.withBodyCount > 0,
      `after refresh: expected real bodies; ${JSON.stringify({
        before: before.withBodyCount,
        after: after.withBodyCount,
        empty: after.emptyNoContentCount,
        sample: after.rows?.slice?.(0, 4),
      })}`
    );
    assert(
      after.userOnlyEmptyCount === 0 ||
        after.withBodyCount >= after.userOnlyEmptyCount,
      `after refresh: empty user shells dominate; empty=${after.userOnlyEmptyCount} body=${after.withBodyCount}`
    );
    const dump = dumpGraphqlCostLog({ label: 'TB after refresh' });
    const rows = costRowsForThreads(dump?.summary || null);
    log(
      `  [TB.6] refresh shellMax=${rows.shellMax} byIdsMax=${rows.byIdsMax} ` +
        `byIdsCost=${rows.byIdsCost} calls=${rows.byIdsCalls}`
    );
    if (rows.shell.length) {
      assert(
        rows.shellMax <= 1,
        `refresh shell maxCost ≤1; got ${rows.shellMax} ${JSON.stringify(rows.shell)}`
      );
    }
    if (rows.byIdsCalls > 0) {
      assert(
        rows.byIdsMax <= 2,
        `refresh byIds maxCost ≤2 with count-only reactors; got ${rows.byIdsMax}`
      );
    }
  });

  return steps;
}

export async function runThreadBodies(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
