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
      Number(snap?.labels || 0) +
      Number(snap?.titles || 0) +
      Number(snap?.milestones || 0) +
      Number(snap?.referenced || 0);
    const bestScore =
      Number(best?.eventNodes || 0) +
      Number(best?.labels || 0) +
      Number(best?.titles || 0) +
      Number(best?.milestones || 0) +
      Number(best?.referenced || 0);
    if (score >= bestScore) best = snap;
    if (
      Number(snap?.eventNodes || 0) > 0 ||
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
  waitMs(80);

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
  waitMs(120);

  let restoredN;
  if (target === 'comments') {
    const sc = scrollConversationForCommentProbe();
    log(`  re-scroll for restore ${JSON.stringify(sc)}`);
    restoredN = Number(sc?.comments || 0);
    // One more settle if first paint was empty (slow thread remount).
    if (restoredN <= afterN) {
      waitMs(200);
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
  // Comment probes step the virtual list; remount windows can undercount vs the
  // first full-range probe by a few cards (before=12 restored=10 is healthy).
  const minRestore =
    target === 'comments'
      ? Math.max(afterN + 1, Math.ceil(beforeN * 0.75))
      : beforeN;
  assert(
    restoredN >= minRestore,
    `expected ${target} restore: before=${beforeN} after=${afterN} restored=${restoredN} min=${minRestore}`
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
        // Side-fetch system events land after first paint; virtual list mounts
        // only a window — wait + scroll until at least one category appears.
        const before = waitForSystemTimelineEvents(12_000);
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
        // Ensure comments tip is on (All is toggle: bare clickTip('all') can turn all off)
        ensureAllTipsOn('All on for comments seed');

        // Fast path: demo PR often already has review/issue comment cards — skip
        // gh seed + full reopen (~30–60s) when we can mount comments in-session.
        let probe = scrollConversationForCommentProbe();
        log(`  comment probe (pre-seed) ${JSON.stringify(probe)}`);
        let before = countTimelineEventsByCategory();
        let liveComments = Math.max(
          Number(before.comments || 0),
          Number(probe?.comments || 0)
        );
        if (liveComments > 0) {
          before = { ...before, comments: liveComments };
          log(`  skip seed — existing comments=${liveComments}`);
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
            Number(probe?.comments || 0)
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
            Number(scan?.maxComments || 0),
            Number(probe2?.comments || 0)
          );
          if (n > 0) {
            before = { ...before, comments: n };
          }
        }
        log(`  comments before (final) ${JSON.stringify(before)}`);
        assert(
          before.comments > 0,
          `comments tip test needs mounted cards: ${JSON.stringify({ before, probe })}`
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
        // Wait for system events (incl. renamed) then hunt title chips while scrolling.
        waitForSystemTimelineEvents(12_000);
        const deadline = Date.now() + 10_000;
        let chips2 = titleChipProbe();
        while (
          Date.now() < deadline &&
          (!Array.isArray(chips2) || chips2.length === 0)
        ) {
          evalInPage(`
            (() => {
              const sc = document.querySelector('.prp-conversation-virtual');
              if (!sc) return false;
              const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
              for (let i = 0; i <= 12; i++) {
                sc.scrollTop = Math.round((max * i) / 12);
                sc.dispatchEvent(new Event('scroll', { bubbles: true }));
                if (document.querySelector('.prp-timeline-event__param--title')) return true;
              }
              return false;
            })()
          `);
          waitMs(200);
          chips2 = titleChipProbe();
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
        // Start from all-on so labels click reliably deselects (not select-from-off).
        ensureAllTipsOn('All on before TT.5');
        clickTip('labels');
        waitTipSelected('labels', false, 'deselect labels before All');
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
