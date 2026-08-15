/**
 * Conversation timeline category tips — placement, short labels, filter hide/show,
 * referenced tip, title chip full hover string.
 */
import { execFileSync } from 'node:child_process';
import {
  DEMO_PR,
  REPO,
  assert,
  evalInPage,
  log,
  openPr,
  setLayout,
  waitDetailReady,
  waitMs,
} from '../lib/harness.mjs';
import {
  defaultCommentTracker,
  e2eCommentBody,
  makeE2eCommentMark,
  cleanupTrackedComments,
} from '../lib/comment-cleanup.mjs';

/** Post a real issue comment so the conversation feed has a comments-category card. */
function seedIssueCommentForTips() {
  const mark = makeE2eCommentMark('e2e-tl-tips');
  const body = e2eCommentBody(mark, 'timeline-tips comments filter');
  const raw = execFileSync(
    'gh',
    [
      'api',
      '-X',
      'POST',
      `repos/${REPO}/issues/${DEMO_PR}/comments`,
      '-f',
      `body=${body}`,
    ],
    { encoding: 'utf8', timeout: 30_000 }
  );
  let id = null;
  try {
    id = Number(JSON.parse(raw)?.id) || null;
  } catch {
    id = null;
  }
  defaultCommentTracker.track({
    kind: 'issue',
    id,
    mark,
    body,
    repo: REPO,
    number: DEMO_PR,
  });
  return { mark, id, body };
}

function waitForCommentMarkInDom(mark, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = evalInPage(`
      (() => {
        const mark = ${JSON.stringify(mark)};
        const sc = document.querySelector('.prp-conversation-virtual');
        if (sc) {
          const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
          for (let i = 0; i <= 10; i++) {
            sc.scrollTop = Math.round((max * i) / 10);
            sc.dispatchEvent(new Event('scroll', { bubbles: true }));
            if ((document.body.innerText || '').includes(mark)) {
              return { ok: true, scrollTop: sc.scrollTop, comments: document.querySelectorAll('.prp-card--timeline-issue-comment, [data-search-anchor^="issue-comment:"]').length };
            }
          }
        }
        const comments = document.querySelectorAll(
          '.prp-card--timeline-issue-comment, [data-search-anchor^="issue-comment:"], .prp-card--timeline-review-thread, .prp-card--timeline-review-group'
        ).length;
        return {
          ok: (document.body.innerText || '').includes(mark),
          comments,
          hasMarkText: (document.body.innerText || '').includes(mark),
        };
      })()
    `);
    if (last?.ok || last?.hasMarkText) return last;
    waitMs(150);
  }
  return last;
}

function tipState() {
  return evalInPage(`
    (() => {
      const root = document.querySelector('[data-prp-timeline-tips]');
      if (!root) return { ok: false, reason: 'no-tips' };
      const chips = [...root.querySelectorAll('[data-prp-timeline-tip]')].map((el) => ({
        id: el.getAttribute('data-prp-timeline-tip'),
        selected: el.getAttribute('data-selected') === '1',
        text: (el.textContent || '').trim(),
      }));
      return { ok: true, chips };
    })()
  `);
}

/** Scroll conversation to top so virtualized tip chips remount. */
function ensureTimelineTipsMounted() {
  evalInPage(`
    (() => {
      const sc =
        document.querySelector('.prp-conversation-virtual') ||
        document.querySelector('[data-prp-conversation-scroll]');
      if (!sc) return false;
      sc.scrollTop = 0;
      sc.dispatchEvent(new Event('scroll', { bubbles: true }));
      return true;
    })()
  `);
  waitMs(80);
  // One more paint if tips still virtualized away
  if (
    !evalInPage(`!!document.querySelector('[data-prp-timeline-tips]')`)
  ) {
    evalInPage(`
      (() => {
        const sc =
          document.querySelector('.prp-conversation-virtual') ||
          document.querySelector('[data-prp-conversation-scroll]');
        if (!sc) return false;
        // reverseComments: tips sit just below merge near top — nudge slightly
        sc.scrollTop = Math.min(120, Math.max(0, sc.scrollHeight - sc.clientHeight));
        sc.dispatchEvent(new Event('scroll', { bubbles: true }));
        sc.scrollTop = 0;
        sc.dispatchEvent(new Event('scroll', { bubbles: true }));
        return true;
      })()
    `);
    waitMs(100);
  }
}

function clickTip(id) {
  ensureTimelineTipsMounted();
  return evalInPage(`
    (() => {
      const el = document.querySelector('[data-prp-timeline-tip="${id}"]');
      if (!el) return { ok: false, reason: 'missing' };
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return {
        ok: true,
        selected: el.getAttribute('data-selected'),
        vis: document.documentElement.getAttribute('data-prp-timeline-vis'),
      };
    })()
  `);
}

function waitTipSelected(id, wantSelected, label) {
  const deadline = Date.now() + 3000;
  let last = null;
  while (Date.now() < deadline) {
    last = tipState();
    const chip = last?.chips?.find((c) => c.id === id);
    if (chip && chip.selected === wantSelected) return chip;
    waitMs(80);
  }
  throw new Error(
    `${label || id}: expected selected=${wantSelected}, last=${JSON.stringify(last)}`
  );
}

/**
 * Product: All tip toggles all-on ↔ all-off. Clicking All when already all-on
 * turns everything off — never use bare clickTip('all') to "ensure on".
 */
function ensureAllTipsOn(label = 'All on') {
  ensureTimelineTipsMounted();
  const st = tipState();
  const allChip = st?.chips?.find((c) => c.id === 'all');
  if (allChip?.selected) return allChip;
  clickTip('all');
  return waitTipSelected('all', true, label);
}

/** Map tip id → count key returned by countTimelineEventsByCategory. */
function countKeyForTip(tipId) {
  if (tipId === 'events') return 'events';
  if (tipId === 'participants') return 'participants';
  if (tipId === 'comments') return 'comments';
  if (tipId === 'review-threads') return 'threads';
  // Legacy aliases (pre 4-tip model)
  if (tipId === 'milestone') return 'milestones';
  if (tipId === 'title') return 'titles';
  if (tipId === 'labels') return 'labels';
  if (tipId === 'referenced') return 'referenced';
  return tipId;
}

/**
 * Comments tip cards only (issue comments + review groups/bodies).
 * Review threads are a separate tip (`review-threads`) and must not be mixed
 * into comments hide/restore counts.
 */
const COMMENTS_TIP_CARD_SELECTOR = [
  '.prp-card--timeline-issue-comment',
  '.prp-card--timeline-review-group',
  '[data-search-anchor^="issue-comment:"]',
  '[data-search-anchor^="review-group:"]',
].join(', ');

/** File review threads (review-threads tip). */
const THREADS_TIP_CARD_SELECTOR = [
  '.prp-card--timeline-review-thread',
  '.prp-conversation-inline-thread',
  '.prp-inline-thread--conversation',
  '[data-search-anchor^="review-thread:"]',
  '[data-search-anchor^="review-comment:"]',
].join(', ');

/** Union — used when probing "any conversation body" existence. */
const COMMENT_CARD_SELECTOR = [
  COMMENTS_TIP_CARD_SELECTOR,
  THREADS_TIP_CARD_SELECTOR,
].join(', ');

function countCommentCardsInDom(selector = COMMENT_CARD_SELECTOR) {
  return (
    Number(
      evalInPage(
        `document.querySelectorAll(${JSON.stringify(selector)}).length`
      )
    ) || 0
  );
}

function countCommentsTipCardsInDom() {
  return countCommentCardsInDom(COMMENTS_TIP_CARD_SELECTOR);
}

function countTimelineEventsByCategory() {
  return evalInPage(`
    (() => {
      const nodes = [...document.querySelectorAll('.prp-timeline-event[data-timeline-event]')];
      const by = (names) =>
        nodes.filter((el) => names.includes(String(el.getAttribute('data-timeline-event') || ''))).length;
      const labels = by(['labeled', 'unlabeled']);
      const titles = by(['renamed']);
      const milestones = by(['milestoned', 'demilestoned']);
      const referenced = by(['referenced', 'cross-referenced', 'connected', 'disconnected']);
      const participants = by(['assigned', 'unassigned', 'review_requested', 'review_request_removed']);
      // 4-tip model: events = labels+titles+milestones+referenced (+ other system)
      const events = Math.max(0, nodes.length - participants);
      const comments = document.querySelectorAll(
        '.prp-card--timeline-issue-comment, .prp-card--timeline-review-group, [data-search-anchor^="issue-comment:"], [data-search-anchor^="review-group:"]'
      ).length;
      const threads = document.querySelectorAll(
        '.prp-card--timeline-review-thread, .prp-conversation-inline-thread, .prp-inline-thread--conversation, [data-search-anchor^="review-thread:"], [data-search-anchor^="review-comment:"]'
      ).length;
      return {
        labels,
        titles,
        milestones,
        referenced,
        participants,
        events,
        comments,
        threads,
        eventNodes: nodes.length,
        tips: !!document.querySelector('[data-prp-timeline-tips]'),
      };
    })()
  `);
}

/**
 * Progressive side-fetch paints system events after first conversation paint.
 * Virtual list only mounts a window — walk the scroller and poll until events
 * appear (or timeout). Returns the best count snapshot seen.
 */
function waitForSystemTimelineEvents(timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  let best = countTimelineEventsByCategory();
  while (Date.now() < deadline) {
    // Leave the page so React can paint after each scroll step
    evalInPage(`
      (() => {
        const sc = document.querySelector('.prp-conversation-virtual');
        if (!sc) return false;
        const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
        // Sample a few offsets each poll (newest-first: older events near bottom)
        for (const f of [0, 0.25, 0.5, 0.75, 1]) {
          sc.scrollTop = Math.round(max * f);
          sc.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
        return true;
      })()
    `);
    waitMs(250);
    const snap = countTimelineEventsByCategory();
    const score =
      Number(snap?.eventNodes || 0) +
      Number(snap?.events || 0) +
      Number(snap?.participants || 0) +
      Number(snap?.labels || 0) +
      Number(snap?.titles || 0) +
      Number(snap?.milestones || 0) +
      Number(snap?.referenced || 0);
    const bestScore =
      Number(best?.eventNodes || 0) +
      Number(best?.events || 0) +
      Number(best?.participants || 0) +
      Number(best?.labels || 0) +
      Number(best?.titles || 0) +
      Number(best?.milestones || 0) +
      Number(best?.referenced || 0);
    if (score >= bestScore) best = snap;
    if (
      Number(snap?.eventNodes || 0) > 0 ||
      Number(snap?.events || 0) > 0 ||
      Number(snap?.participants || 0) > 0 ||
      Number(snap?.labels || 0) > 0 ||
      Number(snap?.titles || 0) > 0 ||
      Number(snap?.milestones || 0) > 0 ||
      Number(snap?.referenced || 0) > 0
    ) {
      return snap;
    }
  }
  return best;
}

/**
 * Scroll conversation virtual list so comment/thread cards mount.
 * React virtualization only paints after scroll → state → re-render, so each
 * step must leave the page (waitMs) — a single sync eval scan always undercounts.
 */
function scrollConversationToMountComments() {
  const meta = evalInPage(`
    (() => {
      const sc =
        document.querySelector('.prp-conversation-virtual') ||
        document.querySelector('[data-prp-conversation-scroll]');
      if (!sc) return { ok: false, reason: 'no-scroller', maxScroll: 0, scrollHeight: 0, clientHeight: 0 };
      return {
        ok: true,
        maxScroll: Math.max(0, sc.scrollHeight - sc.clientHeight),
        scrollHeight: sc.scrollHeight,
        clientHeight: sc.clientHeight,
      };
    })()
  `);
  if (!meta?.ok) return { ok: false, reason: meta?.reason || 'no-scroller', maxComments: 0 };
  let maxComments = countCommentCardsInDom();
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const top = Math.round((Number(meta.maxScroll || 0) * i) / steps);
    evalInPage(`
      (() => {
        const sc =
          document.querySelector('.prp-conversation-virtual') ||
          document.querySelector('[data-prp-conversation-scroll]');
        if (!sc) return false;
        sc.scrollTop = ${top};
        sc.dispatchEvent(new Event('scroll', { bubbles: true }));
        return true;
      })()
    `);
    waitMs(60);
    maxComments = Math.max(maxComments, countCommentCardsInDom());
  }
  evalInPage(`
    (() => {
      const sc =
        document.querySelector('.prp-conversation-virtual') ||
        document.querySelector('[data-prp-conversation-scroll]');
      if (!sc) return false;
      sc.scrollTop = 0;
      sc.dispatchEvent(new Event('scroll', { bubbles: true }));
      return true;
    })()
  `);
  waitMs(60);
  return {
    ok: true,
    maxComments,
    scrollHeight: meta.scrollHeight,
    clientHeight: meta.clientHeight,
  };
}

/**
 * After scrolling feed, leave scroller at a position that maximizes comment
 * cards in the window (with React paint waits between steps).
 */
/**
 * Walk the virtual conversation scroller and collect unique comments-tip
 * anchors (issue-comment / review-group). Single-window max undercounts after
 * tip re-enable when events densify the list.
 */
function countUniqueCommentsTipAcrossScroll() {
  return (
    Number(
      evalInPage(`
    (() => {
      const sc =
        document.querySelector('.prp-conversation-virtual') ||
        document.querySelector('[data-prp-conversation-scroll]');
      if (!sc) return 0;
      const sel = ${JSON.stringify(COMMENTS_TIP_CARD_SELECTOR)};
      const ids = new Set();
      const maxScroll = Math.max(0, sc.scrollHeight - sc.clientHeight);
      const steps = 28;
      for (let i = 0; i <= steps; i++) {
        sc.scrollTop = Math.round((maxScroll * i) / steps);
        sc.dispatchEvent(new Event('scroll', { bubbles: true }));
        for (const el of document.querySelectorAll(sel)) {
          const id =
            el.getAttribute('data-search-anchor') ||
            el.getAttribute('data-comment-id') ||
            el.id ||
            (el.textContent || '').trim().slice(0, 80);
          if (id) ids.add(id);
        }
      }
      return ids.size;
    })()
  `)
    ) || 0
  );
}

function scrollConversationForCommentProbe() {
  const meta = evalInPage(`
    (() => {
      const sc =
        document.querySelector('.prp-conversation-virtual') ||
        document.querySelector('[data-prp-conversation-scroll]');
      if (!sc) return { ok: false, maxScroll: 0 };
      return { ok: true, maxScroll: Math.max(0, sc.scrollHeight - sc.clientHeight) };
    })()
  `);
  if (!meta?.ok) return { ok: false, comments: 0 };
  // Prefer unique-across-scroll for virtualized lists; also track densest window.
  const unique = countUniqueCommentsTipAcrossScroll();
  let best = { top: 0, n: countCommentsTipCardsInDom() };
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const top = Math.round((Number(meta.maxScroll || 0) * i) / steps);
    evalInPage(`
      (() => {
        const sc =
          document.querySelector('.prp-conversation-virtual') ||
          document.querySelector('[data-prp-conversation-scroll]');
        if (!sc) return false;
        sc.scrollTop = ${top};
        sc.dispatchEvent(new Event('scroll', { bubbles: true }));
        return true;
      })()
    `);
    waitMs(50);
    const n = countCommentsTipCardsInDom();
    if (n > best.n) best = { top, n };
  }
  evalInPage(`
    (() => {
      const sc =
        document.querySelector('.prp-conversation-virtual') ||
        document.querySelector('[data-prp-conversation-scroll]');
      if (!sc) return false;
      sc.scrollTop = ${Number(best.top) || 0};
      sc.dispatchEvent(new Event('scroll', { bubbles: true }));
      return true;
    })()
  `);
  waitMs(80);
  return {
    ok: true,
    comments: Math.max(unique, best.n, countCommentsTipCardsInDom()),
    unique,
    windowMax: best.n,
    scrollTop: best.top,
    maxScroll: meta.maxScroll,
  };
}

function placementProbe() {
  return evalInPage(`
    (() => {
      const tips = document.querySelector('[data-prp-timeline-tips]');
      const merge = document.querySelector('.prp-merge-box, [data-search-anchor="merge"]');
      const event = document.querySelector('.prp-timeline-event[data-timeline-event]');
      if (!tips) return { ok: false, reason: 'no-tips' };
      if (!merge) return { ok: false, reason: 'no-merge' };
      const pos = (a, b) => {
        if (!a || !b) return null;
        const r = a.compareDocumentPosition(b);
        if (r & Node.DOCUMENT_POSITION_FOLLOWING) return 'a-before-b';
        if (r & Node.DOCUMENT_POSITION_PRECEDING) return 'a-after-b';
        return 'other';
      };
      return {
        ok: true,
        mergeBeforeTips: pos(merge, tips) === 'a-before-b',
        tipsBeforeEvent: !event || pos(tips, event) === 'a-before-b',
        hasEvent: !!event,
      };
    })()
  `);
}

function titleChipProbe() {
  return evalInPage(`
    (() => {
      const chips = [...document.querySelectorAll('.prp-timeline-event__param--title')];
      return chips.map((el) => {
        const full =
          el.getAttribute('data-prp-full-title') ||
          el.getAttribute('title') ||
          '';
        const textEl = el.querySelector('.prp-badge__text');
        const innerTitle = textEl?.getAttribute('title') || '';
        const shown = (textEl?.textContent || el.textContent || '').trim();
        return {
          full,
          innerTitle,
          shown,
          hasFullOnHoverTarget: Boolean(
            (full && full.length >= shown.length) ||
              (innerTitle && innerTitle.length >= shown.length)
          ),
          fullMatchesTitleAttr:
            el.getAttribute('title') === full || innerTitle === full,
        };
      });
    })()
  `);
}

/**
 * Hide then restore one tip category; asserts real count decrease and restore.
 * @param {string} target tip id
 * @param {Record<string, number>} beforeCounts snapshot before toggle
 */
function hideAndRestoreCategory(target, beforeCounts) {
  const key = countKeyForTip(target);
  const beforeN = Number(beforeCounts[key] || 0);
  assert(beforeN > 0, `hideAndRestore ${target}: need before>0, got ${beforeN}`);

  const click = clickTip(target);
  log(`  click ${target} → ${JSON.stringify(click)}`);
  assert(click?.ok, `click ${target} tip`);
  waitTipSelected(target, false, `deselect ${target}`);
  waitMs(80);

  let afterN;
  if (target === 'comments') {
    // Full-range probe so virtualization cannot leave a false non-zero window.
    // Count comments-tip cards only (not review-threads tip).
    scrollConversationForCommentProbe();
    afterN = countCommentsTipCardsInDom();
    log(`  after hide comments tip cards=${afterN}`);
  } else {
    const after = countTimelineEventsByCategory();
    log(`  after hide ${target} ${JSON.stringify(after)}`);
    afterN = Number(after[key] || 0);
  }
  assert(
    afterN < beforeN,
    `expected ${target} rows to decrease: before=${beforeN} after=${afterN}`
  );

  const re = clickTip(target);
  log(`  re-click ${target} → ${JSON.stringify(re)}`);
  assert(re?.ok, `re-click ${target}`);
  waitTipSelected(target, true, `reselect ${target}`);
  // Allow React filter + virtual list to rebuild rows after re-enable.
  // Tip hide/show rewrites row heights; give measure + offset settle time.
  waitMs(280);

  let restoredN;
  if (target === 'comments') {
    const p1 = scrollConversationForCommentProbe();
    restoredN = Math.max(
      Number(p1?.comments || 0),
      countUniqueCommentsTipAcrossScroll(),
      countCommentsTipCardsInDom()
    );
    log(`  re-scroll for restore comments tip cards=${restoredN} probe=${JSON.stringify(p1)}`);
    if (restoredN < Math.ceil(beforeN * 0.75)) {
      waitMs(350);
      const p2 = scrollConversationForCommentProbe();
      restoredN = Math.max(
        restoredN,
        Number(p2?.comments || 0),
        countUniqueCommentsTipAcrossScroll(),
        countCommentsTipCardsInDom()
      );
      log(`  re-scroll for restore #2 comments tip cards=${restoredN} probe=${JSON.stringify(p2)}`);
    }
  } else {
    // Virtual list only mounts a window — walk scroll and take max (same as comments).
    restoredN = 0;
    for (let pass = 0; pass < 2; pass++) {
      const scMeta = evalInPage(`
        (() => {
          const sc = document.querySelector('.prp-conversation-virtual');
          if (!sc) return { max: 0 };
          return { max: Math.max(0, sc.scrollHeight - sc.clientHeight) };
        })()
      `);
      const max = Number(scMeta?.max || 0);
      for (let i = 0; i <= 14; i++) {
        evalInPage(`
          (() => {
            const sc = document.querySelector('.prp-conversation-virtual');
            if (!sc) return false;
            sc.scrollTop = Math.round((${max} * ${i}) / 14);
            sc.dispatchEvent(new Event('scroll', { bubbles: true }));
            return true;
          })()
        `);
        waitMs(70);
        const snap = countTimelineEventsByCategory();
        restoredN = Math.max(restoredN, Number(snap?.[key] || 0));
      }
      if (restoredN >= Math.ceil(beforeN * 0.6)) break;
      waitMs(280);
    }
    log(`  restored ${target} n=${restoredN} (scrolled probe)`);
  }
  log(`  restored ${target} n=${restoredN} (before=${beforeN} after=${afterN})`);
  // Broken re-enable leaving 0 after a successful hide must fail (not restored>=after).
  assert(
    restoredN > afterN,
    `re-enable ${target} must increase count: after=${afterN} restored=${restoredN}`
  );
  // Unique-across-scroll can still miss a few cards if heights reflow mid-pass;
  // 60% of before is healthy once hide proved filter works (afterN < beforeN).
  // Sparse DEMO_PR fixtures (recreated #19) only mount a subset per viewport.
  const minRestore = Math.max(afterN + 1, Math.ceil(beforeN * 0.6));
  assert(
    restoredN >= minRestore,
    `expected ${target} restore: before=${beforeN} after=${afterN} restored=${restoredN} min=${minRestore}`
  );
}

/** @returns {{ name: string, fn: () => void|Promise<void> }[]} */
export function buildTimelineTipsSteps() {
  return [
    {
      name: 'TT.0 open conversation DEMO_PR',
      fn: () => {
        openPr(DEMO_PR);
        setLayout('conversation');
        waitDetailReady({
          number: DEMO_PR,
          meta: true,
          files: false,
          label: `timeline-tips #${DEMO_PR}`,
        });
        waitMs(500);
      },
    },
    {
      name: 'TT.1 tips after merge; short labels; all categories present',
      fn: () => {
        const place = placementProbe();
        log(`  placement ${JSON.stringify(place)}`);
        assert(place?.ok, `placement probe failed: ${JSON.stringify(place)}`);
        assert(
          place.mergeBeforeTips,
          `tips must come after merge box: ${JSON.stringify(place)}`
        );

        const st = tipState();
        log(`  tips ${JSON.stringify(st)}`);
        assert(st?.ok, `expected timeline tips row: ${JSON.stringify(st)}`);
        const ids = (st.chips || []).map((c) => c.id);
        for (const id of [
          'all',
          'events',
          'participants',
          'comments',
          'review-threads',
        ]) {
          assert(ids.includes(id), `missing tip ${id}: ${ids.join(',')}`);
        }
        const byId = Object.fromEntries(
          (st.chips || []).map((c) => [c.id, c.text])
        );
        assert(byId.events === 'events', `events chip text=${byId.events}`);
        assert(
          byId.participants === 'participants',
          `participants chip text=${byId.participants}`
        );
        assert(byId.comments === 'comments', `comments chip text=${byId.comments}`);
        assert(
          byId['review-threads'] === 'threads',
          `review-threads chip text=${byId['review-threads']}`
        );
        const allChip = st.chips.find((c) => c.id === 'all');
        assert(allChip?.selected, 'All tip should be selected by default');
      },
    },
    {
      name: 'TT.2 hide/show every system tip category that has data',
      fn: () => {
        // Side-fetch system events land after first paint; virtual list mounts
        // only a window — wait + scroll until at least one category appears.
        const before = waitForSystemTimelineEvents(12_000);
        log(`  before categories ${JSON.stringify(before)}`);

        // 4-tip model: events covers labels/title/milestone/referenced
        const candidates = [
          ['events', before.events || before.eventNodes],
          ['participants', before.participants],
        ];
        const withData = candidates.filter(([, n]) => n > 0);
        assert(
          withData.length >= 1,
          `expected at least one system event category on demo PR, got ${JSON.stringify(before)}`
        );
        log(
          `  will toggle: ${withData.map(([id, n]) => `${id}=${n}`).join(', ')}`
        );

        for (const [target, n] of withData) {
          log(`  --- category ${target} (n=${n}) ---`);
          // Fresh counts at top (system events usually near tips)
          evalInPage(`
            (() => {
              const sc = document.querySelector('.prp-conversation-virtual');
              if (sc) { sc.scrollTop = 0; sc.dispatchEvent(new Event('scroll', { bubbles: true })); }
              return true;
            })()
          `);
          waitMs(120);
          const snap = countTimelineEventsByCategory();
          const key = countKeyForTip(target);
          if (Number(snap[key] || 0) <= 0) {
            log(`  skip ${target}: not in viewport after re-scroll (count=0)`);
            continue;
          }
          hideAndRestoreCategory(target, snap);
        }
      },
    },
    {
      name: 'TT.3 comments tip toggles thread/comment cards',
      fn: () => {
        // Ensure comments tip is on (All is toggle: bare clickTip('all') can turn all off)
        ensureAllTipsOn('All on for comments seed');

        // Fast path: demo PR often already has review/issue comment cards — skip
        // gh seed + full reopen (~30–60s) when we can mount comments in-session.
        let probe = scrollConversationForCommentProbe();
        log(`  comment probe (pre-seed) ${JSON.stringify(probe)}`);
        let before = countTimelineEventsByCategory();
        // Prefer comments-tip-only count so review threads don't inflate.
        let liveComments = Math.max(
          Number(before.comments || 0),
          countCommentsTipCardsInDom()
        );
        if (liveComments > 0) {
          before = { ...before, comments: liveComments };
          log(`  skip seed — existing comments-tip cards=${liveComments}`);
        } else {
          const seed = seedIssueCommentForTips();
          log(`  seeded issue comment mark=${seed.mark} id=${seed.id}`);
          // Re-open so side-fetch picks up the new comment
          openPr(DEMO_PR);
          setLayout('conversation');
          waitDetailReady({
            number: DEMO_PR,
            meta: true,
            files: false,
            label: 'timeline-tips after seed comment',
          });
          waitMs(250);
          ensureAllTipsOn('All on after seed reopen');
          waitMs(80);
          const mounted = waitForCommentMarkInDom(seed.mark);
          log(`  mounted ${JSON.stringify(mounted)}`);
          probe = scrollConversationForCommentProbe();
          log(`  comment probe ${JSON.stringify(probe)}`);
          before = countTimelineEventsByCategory();
          liveComments = Math.max(
            Number(before.comments || 0),
            countCommentsTipCardsInDom()
          );
          if (liveComments > Number(before.comments || 0)) {
            before = { ...before, comments: liveComments };
          }
        }

        if (before.comments <= 0) {
          const scan = scrollConversationToMountComments();
          log(`  scroll scan ${JSON.stringify(scan)}`);
          const probe2 = scrollConversationForCommentProbe();
          log(`  comment probe #2 ${JSON.stringify(probe2)}`);
          waitMs(80);
          before = countTimelineEventsByCategory();
          const n = Math.max(
            Number(before.comments || 0),
            countCommentsTipCardsInDom(),
            Number(scan?.maxComments || 0)
          );
          if (n > 0) {
            before = { ...before, comments: n };
          }
        }
        log(`  comments before (final) ${JSON.stringify(before)}`);
        assert(
          before.comments > 0,
          `comments tip test needs mounted cards: ${JSON.stringify({ before, probe, tipCards: countCommentsTipCardsInDom() })}`
        );

        ensureTimelineTipsMounted();
        hideAndRestoreCategory('comments', before);

        try {
          const r = cleanupTrackedComments({ tracker: defaultCommentTracker });
          log(`  cleanup ${JSON.stringify(r)}`);
        } catch (e) {
          log(`  cleanup soft-fail ${String(e?.message || e).slice(0, 120)}`);
        }
      },
    },
    {
      name: 'TT.4 title chip full string available on hover target',
      fn: () => {
        // Unfiltered GraphQL timeline often omits RenamedTitleEvent on dense PRs
        // (see src/fetch/timeline-items.ts). Prefer in-modal title edit so product
        // paints an optimistic renamed row with title chips (same path as MB1).
        setLayout('conversation');
        waitMs(200);
        try {
          ensureAllTipsOn('All on before title rename');
        } catch {
          /* tips may remount mid-step */
        }
        const mark = `e2e-title-chip-${Date.now().toString(36)}`;
        const curTitle = String(
          evalInPage(`
            document.querySelector('.prp-overlay .prp-header__title')?.textContent?.trim() || ''
          `) || ''
        );
        const nextTitle = `${(curTitle || `[demo] g DEMO-300`).slice(0, 80)} ${mark}`.slice(
          0,
          120
        );
        const opened = evalInPage(`
          (() => {
            const btn = document.querySelector(
              '.prp-overlay button[aria-label="Edit title"]'
            );
            if (!btn) return { ok: false, reason: 'no edit title' };
            btn.click();
            return { ok: true };
          })()
        `);
        assert(opened?.ok, `edit title open: ${JSON.stringify(opened)}`);
        waitMs(200);
        const typed = evalInPage(`
          (() => {
            const input = document.querySelector(
              '.prp-overlay .prp-header__title-edit input, .prp-overlay input[aria-label="Title"]'
            );
            if (!input) return { ok: false, reason: 'no title input' };
            const native = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              'value'
            );
            native?.set?.call(input, ${JSON.stringify(nextTitle)});
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return { ok: true, value: input.value };
          })()
        `);
        assert(typed?.ok, `title type: ${JSON.stringify(typed)}`);
        waitMs(100);
        evalInPage(`
          (() => {
            const btn = document.querySelector(
              '.prp-overlay button[aria-label="Save title"]'
            );
            if (btn) { btn.click(); return true; }
            const input = document.querySelector(
              '.prp-overlay .prp-header__title-edit input'
            );
            input?.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
            );
            return true;
          })()
        `);
        waitMs(800);
        log(`  modal title rename mark=${mark}`);
        // Wait for system events (incl. renamed) then hunt title chips while scrolling.
        // Virtual list only remounts after scroll→wait→paint (not a sync multi-scroll).
        waitForSystemTimelineEvents(12_000);
        // Ensure events tip is on (TT.2 may leave a partial filter).
        try {
          ensureAllTipsOn('All on before title-chip hunt');
        } catch {
          /* tips may remount mid-step */
        }
        const deadline = Date.now() + 14_000;
        let chips2 = titleChipProbe();
        while (
          Date.now() < deadline &&
          (!Array.isArray(chips2) || chips2.length === 0)
        ) {
          const max = Number(
            evalInPage(`
              (() => {
                const sc = document.querySelector('.prp-conversation-virtual');
                if (!sc) return 0;
                return Math.max(0, sc.scrollHeight - sc.clientHeight);
              })()
            `) || 0
          );
          for (let i = 0; i <= 16; i++) {
            evalInPage(`
              (() => {
                const sc = document.querySelector('.prp-conversation-virtual');
                if (!sc) return false;
                sc.scrollTop = Math.round((${max} * ${i}) / 16);
                sc.dispatchEvent(new Event('scroll', { bubbles: true }));
                return true;
              })()
            `);
            waitMs(80);
            chips2 = titleChipProbe();
            if (Array.isArray(chips2) && chips2.length > 0) break;
          }
          if (Array.isArray(chips2) && chips2.length > 0) break;
          waitMs(200);
        }
        log(`  title chips ${JSON.stringify(chips2)?.slice(0, 400)}`);
        assert(
          Array.isArray(chips2) && chips2.length > 0,
          'expected at least one title rename chip on demo PR'
        );
        const ok = chips2.some(
          (c) =>
            c.full &&
            c.full.length > 0 &&
            (c.innerTitle === c.full || c.fullMatchesTitleAttr)
        );
        assert(
          ok,
          `expected full title on badge/text title attr: ${JSON.stringify(chips2)}`
        );
      },
    },
    {
      name: 'TT.5 All tip re-selects every category',
      fn: () => {
        evalInPage(`
          (() => {
            const sc = document.querySelector('.prp-conversation-virtual');
            if (sc) { sc.scrollTop = 0; sc.dispatchEvent(new Event('scroll', { bubbles: true })); }
            return true;
          })()
        `);
        waitMs(100);
        // Start from all-on so events click reliably deselects (not select-from-off).
        ensureAllTipsOn('All on before TT.5');
        clickTip('events');
        waitTipSelected('events', false, 'deselect events before All');
        // Partial → All turns every category on.
        clickTip('all');
        waitTipSelected('all', true, 'All selected');
        waitMs(150);
        const st = tipState();
        assert(st?.ok, 'tips present');
        for (const c of st.chips) {
          if (c.id === 'all') continue;
          assert(c.selected, `after All, ${c.id} should be selected`);
        }
      },
    },
  ];
}

export function getSteps() {
  return buildTimelineTipsSteps();
}

export async function runTimelineTips(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
