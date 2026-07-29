/**
 * Check outcome: pending (expected, static) vs in_progress (working, spin).
 */
import { describe, expect, test } from '@rstest/core';
// pure CJS
// eslint-disable-next-line @typescript-eslint/no-require-imports
const checks = require('../src/modal/pure/checks.js');
const {
  classifyCheckOutcome,
  buildMergeBoxCheckGroups,
  listCheckNamesByOutcome,
  formatCheckGroupTip,
  formatCheckSummary,
} = checks;

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
