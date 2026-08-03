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

function waitForCommentMarkInDom(mark, timeoutMs = 15000) {
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
    waitMs(400);
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

/** Map tip id → count key returned by countTimelineEventsByCategory. */
function countKeyForTip(tipId) {
  if (tipId === 'milestone') return 'milestones';
  if (tipId === 'title') return 'titles';
  if (tipId === 'labels') return 'labels';
  if (tipId === 'referenced') return 'referenced';
  if (tipId === 'comments') return 'comments';
  return tipId;
}

/**
 * Product mounts review threads as `.prp-conversation-inline-thread` with
 * `data-search-anchor="review-comment:…"` (not only review-thread:).
 * Keep class + anchor forms so hide/restore counts stay honest.
 */
const COMMENT_CARD_SELECTOR = [
  '.prp-card--timeline-review-thread',
  '.prp-card--timeline-issue-comment',
  '.prp-card--timeline-review-group',
  '.prp-conversation-inline-thread',
  '.prp-inline-thread--conversation',
  '[data-search-anchor^="issue-comment:"]',
  '[data-search-anchor^="review-thread:"]',
  '[data-search-anchor^="review-group:"]',
  '[data-search-anchor^="review-comment:"]',
].join(', ');

function countCommentCardsInDom() {
  return (
    Number(
      evalInPage(
        `document.querySelectorAll(${JSON.stringify(COMMENT_CARD_SELECTOR)}).length`
      )
    ) || 0
  );
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
      const comments = document.querySelectorAll(${JSON.stringify(COMMENT_CARD_SELECTOR)}).length;
      return {
        labels,
        titles,
        milestones,
        referenced,
        comments,
        eventNodes: nodes.length,
        tips: !!document.querySelector('[data-prp-timeline-tips]'),
      };
    })()
  `);
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
  let best = { top: 0, n: countCommentCardsInDom() };
  const steps = 16;
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
    const n = countCommentCardsInDom();
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
    comments: countCommentCardsInDom(),
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
  waitMs(200);

  let afterN;
  if (target === 'comments') {
    // Full-range probe so virtualization cannot leave a false non-zero window.
    const hiddenProbe = scrollConversationForCommentProbe();
    log(`  after hide comments probe ${JSON.stringify(hiddenProbe)}`);
    afterN = Number(hiddenProbe?.comments || 0);
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
  waitMs(300);

  let restoredN;
  if (target === 'comments') {
    const sc = scrollConversationForCommentProbe();
    log(`  re-scroll for restore ${JSON.stringify(sc)}`);
    restoredN = Number(sc?.comments || 0);
    // One more settle if first paint was empty (slow thread remount).
    if (restoredN <= afterN) {
      waitMs(400);
      const sc2 = scrollConversationForCommentProbe();
      log(`  re-scroll for restore #2 ${JSON.stringify(sc2)}`);
      restoredN = Math.max(restoredN, Number(sc2?.comments || 0));
    }
  } else {
    const restored = countTimelineEventsByCategory();
    log(`  restored ${target} ${JSON.stringify(restored)}`);
    restoredN = Number(restored[key] || 0);
  }
  log(`  restored ${target} n=${restoredN} (before=${beforeN} after=${afterN})`);
  // Broken re-enable leaving 0 after a successful hide must fail (not restored>=after).
  assert(
    restoredN > afterN,
    `re-enable ${target} must increase count: after=${afterN} restored=${restoredN}`
  );
  assert(
    restoredN >= beforeN,
    `expected ${target} full restore: before=${beforeN} after=${afterN} restored=${restoredN}`
  );
}

/** @returns {{ name: string, fn: () => void|Promise<void> }[]} */
export function buildTimelineTipsSteps() {
  return [
    {
      name: 'TT.0 open conversation PR #7',
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
          'labels',
          'title',
          'milestone',
          'referenced',
          'comments',
        ]) {
          assert(ids.includes(id), `missing tip ${id}: ${ids.join(',')}`);
        }
        const byId = Object.fromEntries(
          (st.chips || []).map((c) => [c.id, c.text])
        );
        assert(byId.labels === 'label', `label chip text=${byId.labels}`);
        assert(byId.title === 'title', `title chip text=${byId.title}`);
        assert(
          byId.milestone === 'milestone',
          `milestone chip text=${byId.milestone}`
        );
        assert(
          byId.referenced === 'referenced',
          `referenced chip text=${byId.referenced}`
        );
        assert(byId.comments === 'comments', `comments chip text=${byId.comments}`);
        const allChip = st.chips.find((c) => c.id === 'all');
        assert(allChip?.selected, 'All tip should be selected by default');
      },
    },
    {
      name: 'TT.2 hide/show every system tip category that has data',
      fn: () => {
        // Ensure tips stay visible (scroll top)
        evalInPage(`
          (() => {
            const sc = document.querySelector('.prp-conversation-virtual');
            if (sc) { sc.scrollTop = 0; sc.dispatchEvent(new Event('scroll', { bubbles: true })); }
            return true;
          })()
        `);
        waitMs(200);

        const before = countTimelineEventsByCategory();
        log(`  before categories ${JSON.stringify(before)}`);

        // Exercise EVERY tip id that currently has visible rows (not just first hit)
        const candidates = [
          ['title', before.titles],
          ['milestone', before.milestones],
          ['labels', before.labels],
          ['referenced', before.referenced],
        ];
        const withData = candidates.filter(([, n]) => n > 0);
        assert(
          withData.length >= 1,
          `expected at least one system event category on demo PR, got ${JSON.stringify(before)}`
        );
        // Prefer covering title when present (plan AC6)
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
        // Ensure comments tip is on
        clickTip('all');
        waitTipSelected('all', true, 'All on for comments seed');

        // Seed a real issue comment so conversation feed has a comments-category card
        // (demo PR may only show system events in the virtual window without one).
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
        waitMs(600);
        clickTip('all');
        waitMs(150);

        // Wait for either the seed mark or any comment/thread cards (SWR may lag on body text)
        const mounted = waitForCommentMarkInDom(seed.mark);
        log(`  mounted ${JSON.stringify(mounted)}`);

        // Prefer best scroll for comment card mount count (React paint waits).
        const probe = scrollConversationForCommentProbe();
        log(`  comment probe ${JSON.stringify(probe)}`);
        waitMs(120);

        let before = countTimelineEventsByCategory();
        // Authoritative live comment count from stepped scroll (not stale inflate).
        const liveComments = Math.max(
          Number(before.comments || 0),
          Number(probe?.comments || 0)
        );
        if (liveComments > Number(before.comments || 0)) {
          before = { ...before, comments: liveComments };
        }
        log(`  comments before ${JSON.stringify(before)}`);

        if (before.comments <= 0) {
          const scan = scrollConversationToMountComments();
          log(`  scroll scan ${JSON.stringify(scan)}`);
          const probe2 = scrollConversationForCommentProbe();
          log(`  comment probe #2 ${JSON.stringify(probe2)}`);
          waitMs(120);
          before = countTimelineEventsByCategory();
          const n = Math.max(
            Number(before.comments || 0),
            Number(scan?.maxComments || 0),
            Number(probe2?.comments || 0)
          );
          // Only accept scan/probe counts that are live in DOM after settle —
          // never invent beforeN when viewport is empty (hides hide/restore).
          if (n > 0) {
            before = { ...before, comments: n };
          }
        }
        log(`  comments before (final) ${JSON.stringify(before)}`);
        assert(
          before.comments > 0,
          `comments tip test needs mounted cards (seed mark optional if SWR lag): ${JSON.stringify(
            { before, mounted, probe }
          )}`
        );

        // Probe may leave scroller mid-feed where tip chips are virtualized out.
        ensureTimelineTipsMounted();
        hideAndRestoreCategory('comments', before);

        // Hygiene: delete seeded comment
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
        evalInPage(`
          (() => {
            const sc = document.querySelector('.prp-conversation-virtual');
            if (sc) { sc.scrollTop = 0; sc.dispatchEvent(new Event('scroll', { bubbles: true })); }
            return true;
          })()
        `);
        waitMs(150);
        const chips = titleChipProbe();
        log(`  title chips count=${Array.isArray(chips) ? chips.length : 0}`);
        if (!Array.isArray(chips) || chips.length === 0) {
          // Scroll a bit to find rename events
          evalInPage(`
            (() => {
              const sc = document.querySelector('.prp-conversation-virtual');
              if (!sc) return false;
              for (let i = 0; i < 8; i++) {
                sc.scrollTop = Math.round((sc.scrollHeight - sc.clientHeight) * i / 8);
                sc.dispatchEvent(new Event('scroll', { bubbles: true }));
                if (document.querySelector('.prp-timeline-event__param--title')) return true;
              }
              return false;
            })()
          `);
          waitMs(100);
        }
        const chips2 = titleChipProbe();
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
        clickTip('labels');
        waitTipSelected('labels', false, 'deselect labels before All');
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
