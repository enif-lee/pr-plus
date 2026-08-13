/**
 * Check outcome: pending (expected, static) vs in_progress (working, spin).
 */
import { describe, expect, test } from '@rstest/core';
import {
  classifyCheckOutcome,
  buildMergeBoxCheckGroups,
  listCheckNamesByOutcome,
  formatCheckGroupTip,
  formatCheckSummary,
  formatDurationMs,
  checksNeedElapsedTick,
} from '../src/modal/lib/checks';

describe('classifyCheckOutcome', () => {
  test('commit status pending → expected (pending)', () => {
    expect(
      classifyCheckOutcome({ kind: 'status', state: 'pending' })
    ).toBe('pending');
  });

  test('check run in_progress → working', () => {
    expect(
      classifyCheckOutcome({ status: 'in_progress', conclusion: null })
    ).toBe('in_progress');
  });

  test('check run queued / waiting → working', () => {
    expect(classifyCheckOutcome({ status: 'queued' })).toBe('in_progress');
    expect(classifyCheckOutcome({ status: 'waiting' })).toBe('in_progress');
  });

  test('check run requested without conclusion → expected', () => {
    expect(classifyCheckOutcome({ status: 'requested' })).toBe('pending');
  });

  test('completed conclusions', () => {
    expect(
      classifyCheckOutcome({ status: 'completed', conclusion: 'success' })
    ).toBe('success');
    expect(
      classifyCheckOutcome({ status: 'completed', conclusion: 'failure' })
    ).toBe('failure');
    expect(
      classifyCheckOutcome({ status: 'completed', conclusion: 'skipped' })
    ).toBe('skipped');
  });
});

describe('buildMergeBoxCheckGroups splits working vs expected', () => {
  test('groups labels match GitHub', () => {
    const g = buildMergeBoxCheckGroups({
      state: 'pending',
      statuses: [{ context: 'ci/pending', state: 'pending' }],
      checkRuns: [
        {
          id: 1,
          name: 'build',
          status: 'in_progress',
          conclusion: null,
          appName: 'CI',
        },
        {
          id: 2,
          name: 'lint',
          status: 'completed',
          conclusion: 'success',
          appName: 'CI',
        },
      ],
    });
    const keys = g.groups.map((x: any) => x.key);
    expect(keys).toContain('in_progress');
    expect(keys).toContain('pending');
    expect(keys).toContain('success');
    const working = g.groups.find((x: any) => x.key === 'in_progress');
    expect(working.label).toMatch(/in progress/i);
    const expected = g.groups.find((x: any) => x.key === 'pending');
    expect(expected.label).toMatch(/expected/i);
  });
});

describe('listCheckNamesByOutcome + tips', () => {
  test('separates in_progress from pending', () => {
    const names = listCheckNamesByOutcome({
      statuses: [{ context: 'wait', state: 'pending' }],
      checkRuns: [
        { id: 1, name: 'run', status: 'in_progress', conclusion: null },
      ],
    });
    expect(names.pending).toEqual(['wait']);
    expect(names.in_progress).toEqual(['run']);
    expect(formatCheckGroupTip('in_progress', names.in_progress)).toMatch(
      /in progress/i
    );
    expect(formatCheckGroupTip('pending', names.pending)).toMatch(/expected/i);
  });
});

describe('formatCheckSummary', () => {
  test('in_progress copy', () => {
    expect(
      formatCheckSummary({
        outcome: 'in_progress',
        status: 'in_progress',
        startedAt: new Date(Date.now() - 5000).toISOString(),
      })
    ).toMatch(/In progress/i);
  });

  test('pending expected copy', () => {
    expect(formatCheckSummary({ outcome: 'pending' })).toMatch(/Expected/i);
  });
});

describe('in-progress elapsed advances with nowMs (shipped pure)', () => {
  const startedAt = '2026-08-06T10:00:00.000Z';
  const startMs = Date.parse(startedAt);

  test('formatDurationMs multi-second spans are not stuck at <1s', () => {
    expect(formatDurationMs(500)).toBe('<1s');
    expect(formatDurationMs(2500)).toBe('3s'); // rounded
    expect(formatDurationMs(5000)).toBe('5s');
    expect(formatDurationMs(65_000)).toMatch(/1m/);
  });

  test('formatCheckSummary grows when nowMs advances (start-relative)', () => {
    const item = {
      outcome: 'in_progress',
      status: 'in_progress',
      startedAt,
      // GitHub-ish freeze bug: updatedAt often equals startedAt for running jobs
      updatedAt: startedAt,
      completedAt: '',
    };
    const at2s = formatCheckSummary(item, startMs + 2000);
    const at5s = formatCheckSummary(item, startMs + 5000);
    const at12s = formatCheckSummary(item, startMs + 12_000);
    expect(at2s).toMatch(/In progress/i);
    expect(at2s).toMatch(/2s/);
    expect(at5s).toMatch(/5s/);
    expect(at12s).toMatch(/12s/);
    expect(at2s).not.toBe(at5s);
    expect(at5s).not.toBe(at12s);
    // Must not freeze at <1s when multi-second wall time has passed
    expect(at5s).not.toMatch(/<1s/);
  });

  test('buildMergeBoxCheckGroups passes nowMs into in-progress summary', () => {
    const checks = {
      state: 'pending',
      statuses: [],
      checkRuns: [
        {
          id: 42,
          name: 'build',
          status: 'in_progress',
          conclusion: null,
          started_at: startedAt,
          updated_at: startedAt,
          appName: 'CI',
        },
      ],
    };
    const early = buildMergeBoxCheckGroups(checks, { nowMs: startMs + 3000 });
    const later = buildMergeBoxCheckGroups(checks, { nowMs: startMs + 9000 });
    const sEarly = early.groups
      .flatMap((g: any) => g.items)
      .find((i: any) => i.outcome === 'in_progress')?.summary;
    const sLater = later.groups
      .flatMap((g: any) => g.items)
      .find((i: any) => i.outcome === 'in_progress')?.summary;
    expect(sEarly).toMatch(/3s/);
    expect(sLater).toMatch(/9s/);
    expect(sEarly).not.toBe(sLater);
  });

  test('finished success duration does not change with nowMs', () => {
    const completedAt = '2026-08-06T10:00:10.000Z';
    const item = {
      outcome: 'success',
      status: 'completed',
      conclusion: 'success',
      startedAt,
      completedAt,
      updatedAt: completedAt,
    };
    const a = formatCheckSummary(item, startMs + 60_000);
    const b = formatCheckSummary(item, startMs + 120_000);
    expect(a).toMatch(/Successful in 10s/);
    expect(a).toBe(b);
  });

  test('checksNeedElapsedTick only when live in-progress has start', () => {
    expect(
      checksNeedElapsedTick({
        checkRuns: [
          {
            id: 1,
            name: 'build',
            status: 'in_progress',
            started_at: startedAt,
          },
        ],
      })
    ).toBe(true);
    expect(
      checksNeedElapsedTick({
        checkRuns: [
          {
            id: 2,
            name: 'done',
            status: 'completed',
            conclusion: 'success',
            started_at: startedAt,
            completed_at: '2026-08-06T10:00:05.000Z',
          },
        ],
      })
    ).toBe(false);
    expect(
      checksNeedElapsedTick({
        checkRuns: [{ id: 3, name: 'queued', status: 'queued' }],
      })
    ).toBe(false);
  });
});
