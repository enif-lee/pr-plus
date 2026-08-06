/**
 * Conversation timeline pagination e2e:
 * Load more / Load all fold for timelineItems (+ review threads).
 * Target: dense demo PR #7 (timelineItems.totalCount >> 100).
 */
import {
  DEMO_PR,
  assert,
  closeOverlay,
  evalInPage,
  log,
  openPr,
  openPulls,
  setLayout,
  waitDetailReady,
  waitMs,
} from '../lib/harness.mjs';

/** Native pulls-list speech-bubble count for PR #n (null if missing). */
function probeListCommentCount(n) {
  return evalInPage(`
    (() => {
      const n = ${Number(n)};
      const rows = [
        ...document.querySelectorAll('.js-issue-row, [id^="issue_"]'),
      ];
      let row = null;
      for (const r of rows) {
        if (r.id === 'issue_' + n) {
          row = r;
          break;
        }
        const hit = [...r.querySelectorAll('a[href*="/pull/"]')].some((a) => {
          const h = a.getAttribute('href') || '';
          return h.includes('/pull/' + n);
        });
        if (hit) {
          row = r;
          break;
        }
      }
      if (!row) return { found: false, commentCount: null };
      let el =
        row.querySelector('a[aria-label*="comment" i]') ||
        row.querySelector('a:has(.octicon-comment)');
      if (!el) {
        return { found: true, commentCount: null, reason: 'no-control' };
      }
      const aria = el.getAttribute('aria-label') || '';
      const m = aria.match(/(\\d+)\\s*comment/i);
      let count = m ? Number(m[1]) : null;
      if (count == null) {
        const spans = el.querySelectorAll('span');
        for (const s of spans) {
          if (s.querySelector('svg, .octicon')) continue;
          const t = (s.textContent || '').trim();
          if (/^\\d+$/.test(t)) {
            count = Number(t);
            break;
          }
        }
      }
      return { found: true, commentCount: count, aria: aria.slice(0, 40) };
    })()
  `);
}

/** Snapshot gap chrome + timeline diag on the page. */
function paginationProbe() {
  return evalInPage(`
    (() => {
      const host =
        document.getElementById('prp-page-embed') ||
        document.getElementById('prp-modal-host');
      const gap = document.querySelector('.prp-timeline-gap');
      const loadMore = gap
        ? [...gap.querySelectorAll('button')].find((b) =>
            /Load more/i.test(b.textContent || '')
          )
        : null;
      const loadAll = gap
        ? [...gap.querySelectorAll('button')].find((b) =>
            /Load all/i.test(b.textContent || '')
          )
        : null;
      let diag = null;
      try {
        diag = JSON.parse(sessionStorage.getItem('prp:diag:timeline-gql') || 'null');
      } catch {}
      const cards = document.querySelectorAll(
        '.prp-overlay .prp-card, .prp-conversation-virtual .prp-card'
      ).length;
      const issueComments = document.querySelectorAll(
        '.prp-card--timeline-issue-comment, [data-search-anchor^="issue-comment:"]'
      ).length;
      const events = document.querySelectorAll(
        '.prp-timeline-event[data-timeline-event]'
      ).length;
      const threads = document.querySelectorAll(
        '.prp-card--timeline-review-thread, .prp-card--timeline-review-group, [data-search-anchor^="review-thread:"]'
      ).length;
      return {
        hasGap: !!gap,
        gapPlacement: gap?.getAttribute('data-gap-placement') || null,
        gapText: (gap?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
        hasLoadMore: !!loadMore,
        hasLoadAll: !!loadAll,
        loadMoreDisabled: loadMore ? Boolean(loadMore.disabled) : null,
        cards,
        issueComments,
        events,
        threads,
        commentsFetch: host?.getAttribute('data-prp-comments-fetch') || null,
        timelineSource: host?.getAttribute('data-prp-timeline-source') || null,
        diag: diag
          ? {
              phase: diag.phase,
              comments: diag.comments,
              events: diag.events,
              hasMore: diag.hasMore,
              pageHasMore: diag.pageHasMore,
              totalCount: diag.totalCount,
              loadedCount: diag.loadedCount,
              hasPreviousPage: diag.hasPreviousPage,
              startCursor: diag.startCursor,
              sinceWatermark: diag.sinceWatermark,
              source: diag.source,
              gqlComments: diag.gqlComments,
              restComments: diag.restComments,
              err: diag.err || diag.error || null,
            }
          : null,
      };
    })()
  `);
}

/**
 * Scroll conversation virtual list to surface the gap (end or middle).
 * Returns true if gap is in DOM after scrolls.
 */
function scrollToFindGap(maxSteps = 24) {
  for (let i = 0; i < maxSteps; i++) {
    const found = evalInPage(`
      (() => {
        if (document.querySelector('.prp-timeline-gap')) return true;
        const sc =
          document.querySelector('.prp-conversation-virtual') ||
          document.querySelector('.prp-overlay [data-virtual-scroll]') ||
          document.querySelector('.prp-conversation__main');
        if (!sc) return false;
        const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
        const next = Math.min(max, sc.scrollTop + Math.max(240, sc.clientHeight * 0.85));
        if (next <= sc.scrollTop + 2 && sc.scrollTop >= max - 4) return false;
        sc.scrollTop = next;
        sc.dispatchEvent(new Event('scroll', { bubbles: true }));
        return !!document.querySelector('.prp-timeline-gap');
      })()
    `);
    if (found) return true;
    waitMs(120);
  }
  return Boolean(evalInPage(`!!document.querySelector('.prp-timeline-gap')`));
}

/** Click Load more… on the gap banner. */
function clickLoadMore() {
  return evalInPage(`
    (() => {
      const gap = document.querySelector('.prp-timeline-gap');
      if (!gap) return { ok: false, reason: 'no-gap' };
      const btn = [...gap.querySelectorAll('button')].find((b) =>
        /Load more/i.test(b.textContent || '')
      );
      if (!btn) return { ok: false, reason: 'no-button' };
      if (btn.disabled) return { ok: false, reason: 'disabled' };
      btn.click();
      return { ok: true };
    })()
  `);
}

/**
 * Wait until pagination probe shows progress vs baseline.
 * Progress = more cards/comments/events OR diag hasMore flipped OR gap gone
 * OR comments-fetch attr increased.
 */
/** Parse "N hidden items" from gap banner text (virtual list may not remount cards). */
function hiddenCountFromGapText(gapText) {
  const m = String(gapText || '').match(/(\d+)\s*hidden/i);
  return m ? Number(m[1]) : null;
}

function waitPaginationProgress(before, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  const beforeHidden = hiddenCountFromGapText(before?.gapText);
  while (Date.now() < deadline) {
    waitMs(350);
    last = paginationProbe();
    const beforeCards = Number(before.cards) || 0;
    const afterCards = Number(last.cards) || 0;
    const beforeIc = Number(before.issueComments) || 0;
    const afterIc = Number(last.issueComments) || 0;
    const beforeEv = Number(before.events) || 0;
    const afterEv = Number(last.events) || 0;
    const beforeFetch = Number(before.commentsFetch) || 0;
    const afterFetch = Number(last.commentsFetch) || 0;
    const beforeDiagC = Number(before.diag?.comments) || 0;
    const afterDiagC = Number(last.diag?.comments) || 0;
    const beforeDiagE = Number(before.diag?.events) || 0;
    const afterDiagE = Number(last.diag?.events) || 0;
    const afterHidden = hiddenCountFromGapText(last?.gapText);
    const beforeLoaded = Number(before.diag?.loadedCount) || 0;
    const afterLoaded = Number(last.diag?.loadedCount) || 0;

    if (
      afterCards > beforeCards ||
      afterIc > beforeIc ||
      afterEv > beforeEv ||
      afterFetch > beforeFetch ||
      afterDiagC > beforeDiagC ||
      afterDiagE > beforeDiagE ||
      afterLoaded > beforeLoaded ||
      (beforeHidden != null &&
        afterHidden != null &&
        afterHidden < beforeHidden)
    ) {
      return { ok: true, kind: 'grew', last };
    }
    // Completeness: had hasMore diag, now false / gap vanished after load
    if (
      before.diag?.hasMore === true &&
      last.diag &&
      last.diag.hasMore === false
    ) {
      return { ok: true, kind: 'complete', last };
    }
    if (before.hasGap && !last.hasGap) {
      return { ok: true, kind: 'gap-closed', last };
    }
    // Load stage finished: button re-enabled after busy
    if (
      last.hasLoadMore &&
      last.loadMoreDisabled === false &&
      before.loadMoreDisabled !== false
    ) {
      // only count if something else also moved — keep waiting
    }
  }
  return { ok: false, kind: 'timeout', last };
}

/** @returns {{ name: string, fn: () => void|Promise<void> }[]} */
export function buildTimelineLoadMoreSteps() {
  /** @type {{ name: string, fn: () => void|Promise<void> }[]} */
  const steps = [];
  /** @type {any} */
  let beforeLoad = null;
  /** @type {{ found?: boolean, commentCount?: number|null }|null} */
  let listCommentBefore = null;

  steps.push({
    name: `TLM.0 open PR #${DEMO_PR} conversation`,
    fn: () => {
      // Clear stale diag *before* open so side-fetch can rewrite it
      evalInPage(`
        (() => {
          try {
            sessionStorage.removeItem('prp:diag:timeline-gql');
            sessionStorage.removeItem('prp:diag:timeline-bridge-res');
            sessionStorage.removeItem('prp:diag:sw-ping');
          } catch {}
          return true;
        })()
      `);
      // Baseline list speech-bubble before open/load-more can corrupt it
      openPulls();
      waitMs(500);
      listCommentBefore = probeListCommentCount(DEMO_PR);
      log(
        `  list comment baseline #${DEMO_PR}=${JSON.stringify(listCommentBefore)}`
      );
      openPr(DEMO_PR);
      setLayout('conversation');
      waitDetailReady({
        number: DEMO_PR,
        meta: true,
        files: false,
        label: `timeline-load-more #${DEMO_PR}`,
      });
      // Side-fetch timelineItems + REST comments + threads settle after meta
      waitMs(2500);
      // Content-script probe (page world has no chrome.runtime)
      evalInPage(`
        document.dispatchEvent(
          new CustomEvent('prp-probe-timeline-page', {
            bubbles: true,
            detail: { owner: 'enif-lee', repo: 'pr-plus', number: ${DEMO_PR} },
          })
        );
        true
      `);
      let bridgeProbe = null;
      for (let i = 0; i < 50; i++) {
        waitMs(300);
        bridgeProbe = evalInPage(`
          (() => {
            try {
              return JSON.parse(
                sessionStorage.getItem('prp:diag:timeline-bridge-probe') || 'null'
              );
            } catch { return null; }
          })()
        `);
        if (bridgeProbe) break;
      }
      log(`  bridge-probe ${JSON.stringify(bridgeProbe)}`);
    },
  });

  steps.push({
    name: 'TLM.1 wait for timeline paint + find Load more fold',
    fn: () => {
      // GraphQL timeline path should mark source + incomplete corpus on #7
      const deadline = Date.now() + 35_000;
      let p = paginationProbe();
      while (Date.now() < deadline) {
        const diagReady =
          p.diag?.phase === 'result' ||
          p.diag?.phase === 'error' ||
          p.diag?.phase === 'no-fn' ||
          p.timelineSource === 'graphql' ||
          p.timelineSource === 'graphql-since' ||
          p.timelineSource === 'rest';
        if ((p.cards || 0) >= 1 && diagReady) break;
        waitMs(400);
        p = paginationProbe();
      }
      const bridgeRes = evalInPage(`
        (() => {
          try {
            return JSON.parse(
              sessionStorage.getItem('prp:diag:timeline-bridge-res') || 'null'
            );
          } catch {
            return null;
          }
        })()
      `);
      const bridgeProbe = evalInPage(`
        (() => {
          try {
            return JSON.parse(
              sessionStorage.getItem('prp:diag:timeline-bridge-probe') || 'null'
            );
          } catch { return null; }
        })()
      `);
      log(`  paint ${JSON.stringify(p)}`);
      log(`  bridge-res ${JSON.stringify(bridgeRes)}`);
      log(`  bridge-probe ${JSON.stringify(bridgeProbe)}`);
      assert((p.cards || 0) >= 1, `expected timeline cards: ${JSON.stringify(p)}`);
      // Prefer content-script bridge probe when present; otherwise host
      // prp:diag:timeline-gql (side-fetch) is the same GraphQL page proof.
      const gqlDiag =
        p.diag &&
        (p.diag.phase === 'result' || p.diag.source === 'graphql') &&
        (p.diag.hasMore === true ||
          p.diag.pageHasMore === true ||
          Number(p.diag.totalCount) > 100 ||
          Number(p.diag.events) >= 1 ||
          Number(p.diag.loadedCount) >= 1);
      const bridgeOk =
        bridgeProbe?.ok &&
        (bridgeProbe.hasMore === true ||
          Number(bridgeProbe.totalCount) > 100 ||
          Number(bridgeProbe.events) >= 1);
      assert(
        bridgeOk || gqlDiag,
        `timeline GraphQL page probe failed: ${JSON.stringify(bridgeProbe)} res=${JSON.stringify(bridgeRes)} diag=${JSON.stringify(p.diag)}`
      );

      // Poll scroll + re-probe — threads/timeline meta may land after first paint
      let found = false;
      const gapDeadline = Date.now() + 25_000;
      while (Date.now() < gapDeadline) {
        found = scrollToFindGap(12);
        p = paginationProbe();
        if (p.hasGap && p.hasLoadMore) break;
        // Nudge virtual list from top again
        evalInPage(`
          (() => {
            const sc =
              document.querySelector('.prp-conversation-virtual') ||
              document.querySelector('.prp-conversation__main');
            if (sc) {
              sc.scrollTop = 0;
              sc.dispatchEvent(new Event('scroll', { bubbles: true }));
            }
            return true;
          })()
        `);
        waitMs(500);
        found = scrollToFindGap(16);
        p = paginationProbe();
        if (p.hasGap && p.hasLoadMore) break;
      }
      log(`  gap-after-scroll found=${found} ${JSON.stringify(p)}`);

      // Dense #7: totalCount ~1300 ≫ first page — Load more fold must appear
      assert(
        p.hasGap && p.hasLoadMore,
        `expected Load more gap on dense PR #${DEMO_PR}: ${JSON.stringify(p)}`
      );
      assert(
        p.hasLoadAll,
        `expected Load all button: ${JSON.stringify(p)}`
      );
      assert(
        p.gapPlacement === 'end' || p.gapPlacement === 'middle',
        `unexpected gapPlacement=${p.gapPlacement}`
      );
      beforeLoad = p;
    },
  });

  steps.push({
    name: 'TLM.2 click Load more advances timeline corpus',
    fn: () => {
      assert(beforeLoad, 'TLM.1 did not capture baseline');
      // Ensure gap in view again
      scrollToFindGap(8);
      const click = clickLoadMore();
      log(`  click ${JSON.stringify(click)}`);
      assert(click?.ok, `Load more click failed: ${JSON.stringify(click)}`);

      const prog = waitPaginationProgress(beforeLoad, 30_000);
      log(
        `  progress kind=${prog.kind} after=${JSON.stringify(prog.last)}`
      );
      assert(
        prog.ok,
        `Load more did not advance timeline/threads: before=${JSON.stringify(
          beforeLoad
        )} after=${JSON.stringify(prog.last)}`
      );
    },
  });

  steps.push({
    name: 'TLM.3 Diff threads-all then Conversation gap still valid',
    fn: () => {
      // Diff auto-drains threads only; timelineMeta must survive for gap UI
      setLayout('diff');
      waitDetailReady({
        number: DEMO_PR,
        meta: true,
        files: false,
        label: 'timeline-load-more diff',
      });
      // Allow threads-all background drain
      waitMs(2500);
      setLayout('conversation');
      waitDetailReady({
        number: DEMO_PR,
        meta: true,
        files: false,
        label: 'timeline-load-more back to conversation',
      });
      waitMs(800);

      scrollToFindGap(20);
      const p = paginationProbe();
      log(`  post-diff conversation ${JSON.stringify(p)}`);
      // Either still paginating (gap) or fully complete (no gap) — both OK.
      // Must not crash / empty conversation.
      assert((p.cards || 0) >= 1, `conversation empty after Diff: ${JSON.stringify(p)}`);
      if (p.hasGap) {
        assert(
          p.hasLoadMore,
          `gap without Load more after Diff: ${JSON.stringify(p)}`
        );
        assert(
          p.gapPlacement === 'end' || p.gapPlacement === 'middle',
          `bad placement after Diff: ${p.gapPlacement}`
        );
        // When threads finished but timeline remains, middle is preferred
        if (p.gapPlacement === 'middle') {
          log('  middle gap after Diff threads-all (timeline still incomplete) ✓');
        }
      } else {
        log('  no gap after Diff — corpus complete for this window ✓');
      }
    },
  });

  steps.push({
    name: 'TLM.4 close after load-more → list comment count not wiped to 0',
    fn: () => {
      // Regression: load more set commentsMeta.hasMore=false with empty/partial
      // comments[] → estimateListCommentCount published 0 onto the list badge.
      closeOverlay();
      waitMs(700);
      if (!evalInPage(`location.pathname.includes('/pulls')`)) {
        openPulls();
        waitMs(500);
      }
      let after = probeListCommentCount(DEMO_PR);
      const t0 = Date.now();
      while (
        after?.found &&
        after.commentCount == null &&
        Date.now() - t0 < 4000
      ) {
        waitMs(300);
        after = probeListCommentCount(DEMO_PR);
      }
      log(
        `  list comment after load-more close: before=${JSON.stringify(
          listCommentBefore
        )} after=${JSON.stringify(after)}`
      );
      assert(after?.found, `PR #${DEMO_PR} list row missing after close`);
      // Must not be wiped to zero when the list previously showed a positive count
      if (
        listCommentBefore?.commentCount != null &&
        listCommentBefore.commentCount > 0
      ) {
        assert(
          after.commentCount != null && after.commentCount > 0,
          `list comment count wiped after load-more: before=${listCommentBefore.commentCount} after=${JSON.stringify(after)}`
        );
        assert(
          after.commentCount >= listCommentBefore.commentCount,
          `list comment count decreased after load-more: ${listCommentBefore.commentCount}→${after.commentCount}`
        );
      } else if (after.commentCount != null) {
        assert(
          after.commentCount > 0,
          `list comment count is 0 after load-more close: ${JSON.stringify(after)}`
        );
      }
    },
  });

  return steps;
}

export function getSteps() {
  return buildTimelineLoadMoreSteps();
}
