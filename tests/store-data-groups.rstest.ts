/**
 * Data-group isolation: high-frequency updates notify only matching subscribers.
 * Drives the real Zustand store (shipped `useModalStore` + `data-groups`).
 */
import { describe, expect, test, beforeEach } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { useModalStore } from '../src/modal/store/modal-store';
import {
  ROOT_FORBIDDEN_HIGH_FREQ_FIELDS,
  useScrollMetricsGroup,
  useSelectionIslandGroup,
} from '../src/modal/store/data-groups';

function resetStore() {
  useModalStore.getState().resetForClose();
  useModalStore.setState({
    scrollTop: 0,
    viewportHeight: 520,
    selectionDraft: '',
    commentText: '',
    paletteQuery: '',
  });
}

/**
 * Count selector notifications (Zustand re-render gate): each distinct selected
 * value change invokes the listener. This is the real path React uses via
 * useSyncExternalStore — we measure selector fan-out without a DOM renderer.
 */
function countSelectorFires(
  selector: (s: ReturnType<typeof useModalStore.getState>) => unknown,
  run: () => void
): number {
  let fires = 0;
  let prev = selector(useModalStore.getState());
  const unsub = useModalStore.subscribe((state) => {
    const next = selector(state);
    // Same equality check Zustand React uses by default (Object.is)
    if (!Object.is(next, prev)) {
      fires += 1;
      prev = next;
    }
  });
  run();
  unsub();
  return fires;
}

describe('store data groups — selective notification', () => {
  beforeEach(() => {
    resetStore();
  });

  test('scrollTop updates notify scroll leaf selector, not layoutMode-only', () => {
    const scrollFires = countSelectorFires(
      (s) => ({ scrollTop: s.scrollTop, viewportHeight: s.viewportHeight }),
      () => {
        for (let i = 1; i <= 20; i++) {
          useModalStore.getState().setScrollTop(i * 10);
        }
      }
    );
    resetStore();
    const shellFires = countSelectorFires(
      (s) => s.layoutMode,
      () => {
        for (let i = 1; i <= 20; i++) {
          useModalStore.getState().setScrollTop(i * 10);
        }
      }
    );
    expect(scrollFires).toBe(20);
    expect(shellFires).toBe(0);
  });

  test('selectionDraft updates notify selection leaf, not scroll metrics', () => {
    const selFires = countSelectorFires(
      (s) => s.selectionDraft,
      () => {
        for (let i = 0; i < 15; i++) {
          useModalStore.getState().setSelectionDraft(`draft-${i}`);
        }
      }
    );
    resetStore();
    const scrollFires = countSelectorFires(
      (s) => s.scrollTop,
      () => {
        for (let i = 0; i < 15; i++) {
          useModalStore.getState().setSelectionDraft(`draft-${i}`);
        }
      }
    );
    expect(selFires).toBe(15);
    expect(scrollFires).toBe(0);
  });

});

describe('rerender bench (before vs after data-group isolation)', () => {
  test('root fan-out drops on high-frequency updates', () => {
    resetStore();

    // BEFORE: composition root selects scrollTop + selectionDraft + layoutMode
    const N = 50;
    const drive = () => {
      for (let i = 1; i <= N; i++) {
        useModalStore.getState().setScrollTop(i * 3);
        useModalStore.getState().setSelectionDraft(`x${i}`);
      }
    };

    const beforeRootFires = countSelectorFires(
      (s) => `${s.scrollTop}|${s.selectionDraft}|${s.layoutMode}`,
      drive
    );

    resetStore();

    // AFTER: root only layoutMode; leaves own high-freq fields
    const afterRootFires = countSelectorFires((s) => s.layoutMode, drive);

    resetStore();
    const afterScrollFires = countSelectorFires((s) => s.scrollTop, drive);

    resetStore();
    const afterSelFires = countSelectorFires((s) => s.selectionDraft, drive);

    expect(beforeRootFires).toBeGreaterThan(afterRootFires);
    expect(afterRootFires).toBe(0);
    expect(afterScrollFires).toBe(N);
    expect(afterSelFires).toBe(N);

    const payload = {
      scenario: '50× setScrollTop + 50× setSelectionDraft interleaved',
      metric:
        'Zustand selector fire counts (Object.is gate = React re-render trigger)',
      before: {
        rootSelectorFires: beforeRootFires,
        note: 'root selected scrollTop+selectionDraft+layoutMode composite',
      },
      after: {
        rootSelectorFires: afterRootFires,
        scrollLeafFires: afterScrollFires,
        selectionLeafFires: afterSelFires,
        note: 'root only layoutMode; leaves own high-freq groups',
      },
      win: {
        rootFireReduction: beforeRootFires - afterRootFires,
        rootFireReductionPct: Number(
          (
            ((beforeRootFires - afterRootFires) /
              Math.max(1, beforeRootFires)) *
            100
          ).toFixed(1)
        ),
      },
    };

    const scratch =
      process.env.GROK_SCRATCH ||
      process.env.TMPDIR ||
      require('node:os').tmpdir();
    fs.mkdirSync(scratch, { recursive: true });
    fs.writeFileSync(
      path.join(scratch, 'rerender-bench.json'),
      JSON.stringify(payload, null, 2)
    );
    fs.writeFileSync(
      path.join(scratch, 'rerender-bench.md'),
      [
        '# Re-render bench (data-group isolation)',
        '',
        `Scenario: ${payload.scenario}`,
        '',
        'Metric: Zustand selector notifications (same equality gate React uses).',
        '',
        '| Model | Root selector fires | Notes |',
        '|-------|--------------------:|-------|',
        `| Before | **${payload.before.rootSelectorFires}** | ${payload.before.note} |`,
        `| After | **${payload.after.rootSelectorFires}** | ${payload.after.note} |`,
        '',
        `- Scroll leaf fires: **${payload.after.scrollLeafFires}**`,
        `- Selection leaf fires: **${payload.after.selectionLeafFires}**`,
        `- Root reduction: **${payload.win.rootFireReduction}** (${payload.win.rootFireReductionPct}%)`,
        '',
        'Primary win: composition-root high-freq fan-out → **0** fires.',
        '',
      ].join('\n')
    );

    expect(payload.win.rootFireReduction).toBeGreaterThan(0);
    // ensure helpers are importable (tree-shake surface)
    expect(typeof useScrollMetricsGroup).toBe('function');
    expect(typeof useSelectionIslandGroup).toBe('function');
  });
});
