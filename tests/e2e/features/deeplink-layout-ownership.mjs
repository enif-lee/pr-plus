/**
 * Conversation position deep-link must not veto user Diff layout.
 *
 * Regression: prp_page=conversation&prp_position=c:… kept re-forcing
 * Conversation while progressive detail patches / verify ticks ran, so
 * Conversation → Diff toggle appeared broken.
 *
 * Flow: open conversation+position deep-link → setLayout(diff) → sample
 * layout over a multi-second settle window (must stay diff).
 */
import {
  DEMO_PR,
  PULLS_URL,
  assert,
  clickPrPlusToggleIfNeeded,
  closeOverlay,
  evalInPage,
  layout,
  log,
  open,
  openPr,
  setLayout,
  waitContentInject,
  waitDetailReady,
  waitMs,
  waitPrShellReady,
} from '../lib/harness.mjs';

/**
 * @returns {import('../lib/e2e-register.ts').E2eStep[]}
 */
export function getSteps() {
  /** @type {{ name: string, fn: () => unknown | Promise<unknown> }[]} */
  const steps = [];
  const run = (name, fn) => {
    steps.push({ name, fn });
  };

  /** @type {{ commentId: string | null }} */
  const bag = { commentId: null };

  const probeLayout = () =>
    evalInPage(`
      (() => {
        const ov = document.querySelector('.prp-overlay');
        const root =
          document.querySelector('[data-layout]') ||
          ov ||
          document.querySelector('.prp-modal');
        return {
          overlay: !!ov,
          layout:
            ov?.getAttribute('data-layout') ||
            root?.getAttribute('data-layout') ||
            null,
          convActive: !!document.querySelector(
            '.prp-body-panel--conversation.prp-body-panel--active'
          ),
          diffActive: !!document.querySelector(
            '.prp-body-panel--diff.prp-body-panel--active'
          ),
          href: String(location.href || '').slice(0, 180),
        };
      })()
    `);

  run('DLO.1 open DEMO_PR and capture issue-comment id', () => {
    openPr(DEMO_PR);
    waitDetailReady({ meta: true, files: false, label: 'DLO.1' });
    setLayout('conversation');
    waitMs(400);
    // Prefer a real issue comment on the open PR timeline; fall back to any
    // data-search-anchor comment id present in the conversation scroller.
    const found = evalInPage(`
      (() => {
        const sc =
          document.querySelector(
            '.prp-body-panel--conversation .prp-conversation-virtual'
          ) ||
          document.querySelector('.prp-conversation-virtual') ||
          document.querySelector('[data-prp-conversation-scroll]');
        const roots = sc ? [sc] : [document];
        for (const root of roots) {
          const issue = root.querySelector(
            '[data-search-anchor^="issue-comment:"]'
          );
          if (issue) {
            const a = issue.getAttribute('data-search-anchor') || '';
            const m = a.match(/^issue-comment:(.+)$/i);
            if (m?.[1]) return { id: m[1], kind: 'issue' };
          }
        }
        for (const root of roots) {
          const rev = root.querySelector(
            '[data-search-anchor^="review-comment:"]'
          );
          if (rev) {
            const a = rev.getAttribute('data-search-anchor') || '';
            const m = a.match(/^review-comment:(.+)$/i);
            if (m?.[1]) return { id: m[1], kind: 'review' };
          }
        }
        // Walk virtual list for off-window rows
        if (sc) {
          const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
          for (const f of [0, 0.35, 0.7, 1]) {
            sc.scrollTop = Math.round(max * f);
            sc.dispatchEvent(new Event('scroll', { bubbles: true }));
            const issue = sc.querySelector(
              '[data-search-anchor^="issue-comment:"]'
            );
            if (issue) {
              const a = issue.getAttribute('data-search-anchor') || '';
              const m = a.match(/^issue-comment:(.+)$/i);
              if (m?.[1]) return { id: m[1], kind: 'issue-scrolled' };
            }
          }
        }
        return null;
      })()
    `);
    log(`  comment probe: ${JSON.stringify(found)}`);
    assert(found?.id, `no conversation comment id on #${DEMO_PR}`);
    bag.commentId = String(found.id);
  });

  run('DLO.2 open conversation+position deep-link URL', () => {
    assert(bag.commentId, 'missing comment id from DLO.1');
    const id = bag.commentId;
    closeOverlay();
    waitMs(300);
    const deep = `${PULLS_URL}?prp_page=conversation&prp_number=${DEMO_PR}&prp_position=c%3A${encodeURIComponent(id)}`;
    log(`  deep-link: ${deep}`);
    open(deep);
    waitContentInject({ label: 'DLO.2 inject', timeoutMs: 15_000 });
    waitMs(400);
    // Soft-nav / query open sometimes needs a nudge for host openModal
    clickPrPlusToggleIfNeeded();
    waitPrShellReady(DEMO_PR, 'DLO.2 shell');
    waitDetailReady({ meta: true, files: false, label: 'DLO.2 meta' });
    // Allow deep-link verify to arm (in-flight) before user leaves
    waitMs(600);
    const p = probeLayout();
    log(`  after deep-link open: ${JSON.stringify(p)}`);
    assert(p?.overlay, 'modal not open after conversation deep-link');
    // Prefer conversation; if already applied and user-session was Diff, still OK
    // as long as position is in URL and we can switch to Diff next.
    if (p.layout !== 'conversation' && p.layout !== 'diff') {
      assert(false, `unexpected layout after deep-link: ${JSON.stringify(p)}`);
    }
  });

  run('DLO.3 switch to Diff while deep-link pending/applied', () => {
    setLayout('diff');
    const p = probeLayout();
    log(`  after setLayout(diff): ${JSON.stringify(p)}`);
    assert(p?.layout === 'diff', `expected diff layout, got ${JSON.stringify(p)}`);
    assert(p?.diffActive === true, `diff panel not active: ${JSON.stringify(p)}`);
  });

  run('DLO.4 layout stays diff across multi-second settle (no yank back)', () => {
    /** @type {string[]} */
    const samples = [];
    const rounds = 8;
    for (let i = 0; i < rounds; i++) {
      waitMs(400);
      const p = probeLayout();
      samples.push(
        `${p?.layout || 'null'}:${p?.diffActive ? 'd' : '-'}:${p?.convActive ? 'c' : '-'}`
      );
      assert(
        p?.layout === 'diff',
        `layout yanked off Diff at sample ${i + 1}/${rounds}: ${JSON.stringify({
          p,
          samples,
        })}`
      );
      assert(
        p?.diffActive === true,
        `diff panel inactive at sample ${i + 1}: ${JSON.stringify(p)}`
      );
    }
    log(`  settle samples (${rounds}×400ms): ${samples.join(' | ')}`);
    // Also ensure harness layout() agrees
    assert(layout() === 'diff', `harness layout() drifted: ${layout()}`);
  });

  run('DLO.5 conversation still reachable after abandon', () => {
    setLayout('conversation');
    const p = probeLayout();
    log(`  back to conversation: ${JSON.stringify(p)}`);
    assert(
      p?.layout === 'conversation',
      `expected conversation after toggle: ${JSON.stringify(p)}`
    );
    // And Diff again once more (ownership fully abandoned — no second fight)
    setLayout('diff');
    waitMs(500);
    const p2 = probeLayout();
    assert(p2?.layout === 'diff', `second Diff toggle failed: ${JSON.stringify(p2)}`);
    waitMs(800);
    assert(
      probeLayout()?.layout === 'diff',
      'second Diff settle failed — layout reclaimed'
    );
  });

  return steps;
}

export async function runDeeplinkLayoutOwnership(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
