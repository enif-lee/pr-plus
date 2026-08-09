/**
 * Machine-readable agent-browser probe for shell + selective/lazy comments.
 * Writes RAW lines only to SCRATCH/thread-comments-lazy-browser.log
 *
 *   PRP_SCRATCH=... node tests/e2e/features/thread-comments-lazy-probe.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  DEMO_PR,
  clearGraphqlCostLog,
  dumpGraphqlCostLog,
  openPr,
  openPulls,
  setLayout,
  waitDetailReady,
  waitDiffFilesReady,
  modalProbe,
  REPO,
} from '../lib/harness.mjs';
import { evalInPage, waitMs, open, closeAll } from '../lib/ab.mjs';
import { ensureSharedSession } from '../lib/session.mjs';

const SCRATCH =
  process.env.PRP_SCRATCH ||
  '/var/folders/px/qw6l220x5glb_gxf44lws9p80000gn/T/grok-goal-e1817701c290/implementer';

const lines = [];
function log(msg) {
  const line = String(msg);
  console.log(line);
  lines.push(line);
}

function writeEvidence() {
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(
    path.join(SCRATCH, 'thread-comments-lazy-browser.log'),
    lines.join('\n') + '\n',
    'utf8'
  );
}

function ghJson(query) {
  const out = execSync(
    `gh api graphql -f query=${JSON.stringify(query)}`,
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
  );
  return JSON.parse(out);
}

const RESOLVE_ID = 'PRRT_kwDOTe7KcM6Xj6hO'; // PR#19 e2e-seed-thread-1

function resolveThread(id, resolved) {
  const mut = resolved
    ? `mutation { resolveReviewThread(input:{threadId:"${id}"}) { thread { isResolved id } } }`
    : `mutation { unresolveReviewThread(input:{threadId:"${id}"}) { thread { isResolved id } } }`;
  try {
    const r = ghJson(mut);
    log(
      `gh ${resolved ? 'resolve' : 'unresolve'} ${id}: ` +
        JSON.stringify(r?.data || r?.errors || r).slice(0, 200)
    );
    return true;
  } catch (e) {
    log(`gh resolve fail: ${e?.message || e}`);
    return false;
  }
}

function snapDiff() {
  return evalInPage(`
    (() => {
      const threads = [...document.querySelectorAll('.prp-inline-thread')];
      const collapsed = document.querySelectorAll('.prp-inline-thread--collapsed').length;
      const md = [...document.querySelectorAll('.prp-inline-thread .prp-md')].map(
        (e) => (e.textContent || '').trim().slice(0, 40)
      );
      const realBodies = md.filter(
        (b) => b && !/^_?No content_?$/i.test(b) && b !== 'No content'
      );
      const emptyNoContent = md.filter(
        (b) => /^_?No content_?$/i.test(b) || b === 'No content'
      );
      const toggles = document.querySelectorAll(
        '.prp-inline-thread .prp-thread-toggle'
      ).length;
      return {
        threads: threads.length,
        collapsed,
        toggles,
        mdCount: md.length,
        mdSample: md.slice(0, 5),
        realBodyCount: realBodies.length,
        emptyNoContentCount: emptyNoContent.length,
      };
    })()
  `);
}

function main() {
  log(`[probe] start repo=${REPO} pr=#${DEMO_PR}`);
  log(`[probe] scratch=${SCRATCH}`);

  // 1) Make one thread resolved so shell defers its comments
  const didResolve = resolveThread(RESOLVE_ID, true);

  try {
    closeAll();
    waitMs(400);
    ensureSharedSession('lazy-probe-v2');
    open('https://github.com/');
    waitMs(500);
    // Force SW reload after rebuild
    try {
      evalInPage(
        `document.dispatchEvent(new CustomEvent('prp-reload-extension', { bubbles: true })); true`
      );
      log('[probe] prp-reload-extension dispatched');
      waitMs(3000);
    } catch (e) {
      log(`[probe] reload soft-fail ${e?.message || e}`);
    }

    openPulls();
    clearGraphqlCostLog();
    openPr(DEMO_PR);
    waitDetailReady({ number: DEMO_PR, timeoutMs: 60000 });
    waitMs(1500);
    setLayout('diff');
    waitDiffFilesReady(`probe #${DEMO_PR}`);
    waitMs(800);

    const beforeRefresh = snapDiff();
    log(`[probe] before_refresh ${JSON.stringify(beforeRefresh)}`);

    // Full-threads refresh → GraphQL shell + eager byIds (unresolved only)
    clearGraphqlCostLog();
    const clicked = evalInPage(`
      (() => {
        const b = [...document.querySelectorAll('button')].find((el) =>
          /refresh/i.test(
            (el.getAttribute('aria-label') || '') + (el.title || '')
          )
        );
        if (b) { b.click(); return true; }
        return false;
      })()
    `);
    log(`[probe] refresh_clicked=${clicked}`);
    waitMs(4500);
    waitDetailReady({ number: DEMO_PR, files: true, timeoutMs: 45000 });

    const afterRefresh = snapDiff();
    log(`[probe] after_refresh ${JSON.stringify(afterRefresh)}`);

    const cost1 = dumpGraphqlCostLog({ label: 'after-full-threads' });
    const sum1 = cost1?.summary || {};
    log(`[probe] cost1_raw ${JSON.stringify(sum1)}`);
    const ops1 = (sum1.byOp || []).map((x) => x.op);
    log(`[probe] cost1_ops ${JSON.stringify(ops1)}`);
    log(
      `[probe] has_shell=${ops1.some((o) => /shell/i.test(String(o)))} ` +
        `has_byIds=${ops1.some((o) => /byIds/i.test(String(o)))}`
    );

    // Expand collapsed (resolved) thread
    clearGraphqlCostLog();
    const expand = evalInPage(`
      (() => {
        const btn = document.querySelector(
          '.prp-inline-thread--collapsed .prp-thread-toggle'
        );
        if (!btn) {
          // fallback: any collapsed card header
          const b2 = document.querySelector(
            '.prp-card--timeline-review-thread--collapsed .prp-conversation-thread-header__toggle'
          );
          if (!b2) return { expanded: false, reason: 'no-collapsed-toggle' };
          b2.click();
          return { expanded: true, via: 'conversation' };
        }
        btn.click();
        return { expanded: true, via: 'diff' };
      })()
    `);
    log(`[probe] expand ${JSON.stringify(expand)}`);
    waitMs(3000);
    const afterExpand = snapDiff();
    log(`[probe] after_expand ${JSON.stringify(afterExpand)}`);

    const cost2 = dumpGraphqlCostLog({ label: 'after-expand' });
    const sum2 = cost2?.summary || {};
    log(`[probe] cost2_raw ${JSON.stringify(sum2)}`);
    const ops2 = (sum2.byOp || []).map((x) => x.op);
    log(`[probe] cost2_ops ${JSON.stringify(ops2)}`);
    log(
      `[probe] expand_byIds=${ops2.some((o) => /byIds/i.test(String(o)))}`
    );

    // Re-expand: collapse then expand again — should not re-fetch if loaded
    clearGraphqlCostLog();
    evalInPage(`
      (() => {
        const btn = document.querySelector('.prp-inline-thread .prp-thread-toggle');
        if (btn) { btn.click(); }
        return true;
      })()
    `);
    waitMs(400);
    evalInPage(`
      (() => {
        const btn = document.querySelector(
          '.prp-inline-thread--collapsed .prp-thread-toggle, .prp-inline-thread .prp-thread-toggle'
        );
        if (btn) btn.click();
        return true;
      })()
    `);
    waitMs(1500);
    const cost3 = dumpGraphqlCostLog({ label: 're-expand' });
    const sum3 = cost3?.summary || {};
    log(`[probe] cost3_raw ${JSON.stringify(sum3)}`);
    const ops3 = (sum3.byOp || []).map((x) => x.op);
    log(`[probe] cost3_ops ${JSON.stringify(ops3)}`);
    log(
      `[probe] reexpand_byIds=${ops3.some((o) => /byIds/i.test(String(o)))}`
    );

    // Gates
    const shellOk = ops1.some((o) => /shell/i.test(String(o)));
    const byIdsOk = ops1.some((o) => /byIds/i.test(String(o)));
    const openBodiesOk =
      Number(afterRefresh.realBodyCount || 0) > 0 ||
      (Number(afterRefresh.mdCount || 0) > 0 &&
        Number(afterRefresh.emptyNoContentCount || 0) <
          Number(afterRefresh.mdCount || 0));
    const noMassEmpty =
      Number(afterRefresh.emptyNoContentCount || 0) === 0 ||
      Number(afterRefresh.realBodyCount || 0) >
        Number(afterRefresh.emptyNoContentCount || 0);
    log(
      `[probe] GATE shell=${shellOk} eagerByIds=${byIdsOk} openBodies=${openBodiesOk} ` +
        `realBody=${afterRefresh.realBodyCount} emptyNoContent=${afterRefresh.emptyNoContentCount} ` +
        `expand=${Boolean(expand?.expanded)} expandByIds=${ops2.some((o) => /byIds/i.test(String(o)))}`
    );

    if (!shellOk || !byIdsOk) {
      log('[probe] FAIL: missing shell or byIds on full-threads refresh');
      process.exitCode = 1;
    } else if (!openBodiesOk) {
      log('[probe] FAIL: no real comment bodies after refresh (all No content?)');
      process.exitCode = 1;
    } else if (!noMassEmpty) {
      log(
        '[probe] FAIL: empty No content shells dominate after refresh ' +
          `(empty=${afterRefresh.emptyNoContentCount} real=${afterRefresh.realBodyCount})`
      );
      process.exitCode = 1;
    } else {
      log('[probe] PASS core shell+byIds+bodies (no mass empty placeholders)');
    }
  } finally {
    if (didResolve) resolveThread(RESOLVE_ID, false);
    writeEvidence();
    log(`[probe] wrote ${path.join(SCRATCH, 'thread-comments-lazy-browser.log')}`);
  }
}

try {
  main();
} catch (e) {
  log(`[probe] ERROR ${e?.stack || e}`);
  try {
    resolveThread(RESOLVE_ID, false);
  } catch {
    /* ignore */
  }
  writeEvidence();
  process.exitCode = 1;
}
