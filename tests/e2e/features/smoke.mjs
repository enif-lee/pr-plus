/**
 * P0 smoke — open PR, layout chrome, Esc close is in merged-chrome
 * @param {{ run: (name: string, fn: () => unknown | Promise<unknown>) => Promise<void>, TICK?: number }} ctx
 */
import {
  DEMO_PR,
  assert,
  layout,
  modalProbe,
  openPr,
  openPulls,
  setLayout,
  waitDiffFilesReady,
} from '../lib/harness.mjs';

/**
 * Register ordered steps without executing them.
 * @returns {import('../lib/e2e-register.ts').E2eStep[]}
 */
export function getSteps() {
  /** @type {{ name: string, fn: () => unknown | Promise<unknown> }[]} */
  const steps = [];
  const run = (name, fn) => {
    steps.push({ name, fn });
  };

  run('P0.1 open pulls list', () => {
    openPulls();
  });
  run(`P0.2 open PR #${DEMO_PR}`, () => {
    openPr(DEMO_PR);
    const p = modalProbe();
    assert(p.overlay, 'overlay missing');
    assert(p.cssRules > 100, `pr-modal.css not loaded (rules=${p.cssRules})`);
    assert(p.cssHref === 'pr-modal.css', 'pr-modal.css href missing');
    assert(p.header && p.header.h > 40, 'header missing/short');
    assert(p.title, 'title missing');
  });
  run('P0.3 conversation chrome', () => {
    setLayout('conversation');
    const p = modalProbe();
    assert(p.layout === 'conversation', `layout=${p.layout}`);
    assert(p.conv && p.conv.h > 200, 'conversation virtual host missing');
    assert(p.merge && p.merge.h > 40, 'merge box missing');
    assert(p.aside && p.aside.w > 100, 'aside rail missing');
    assert(p.cards >= 1, 'expected timeline cards');
    assert(p.merge.bg && p.merge.bg !== 'rgba(0, 0, 0, 0)', `merge bg unstyled: ${p.merge.bg}`);
  });
  run('P0.4 toggle Diff', () => {
    setLayout('diff');
    const p = modalProbe();
    assert(p.layout === 'diff', `layout=${p.layout}`);
    assert(p.filetree && p.filetree.w > 100, 'filetree missing');
    assert(p.filetree.visibility === 'visible', 'filetree should be visible on Diff');
    assert(p.vlist && p.vlist.h > 200, 'diff vlist missing');
    assert(p.toolbar && p.toolbar.h > 20, 'diff toolbar missing');
    // Cold open must eventually paint file rows / code (not empty shell).
    waitDiffFilesReady(`P0.4 PR #${DEMO_PR} Diff files ready`);
  });
  run('P0.5 toggle Conversation', () => {
    setLayout('conversation');
    assert(layout() === 'conversation');
  });


  return steps;
}

/** Legacy runner: execute steps via createRunner bag. */
export async function runSmoke(ctx) {
  const { run } = ctx;
  for (const step of getSteps()) {
    await run(step.name, step.fn);
  }
}
