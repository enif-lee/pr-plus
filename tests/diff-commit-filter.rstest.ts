/**
 * Diff commit filter + range multi-select toggle + option secondary meta.
 */
import { describe, expect, test } from '@rstest/core';
import {
  buildCommitFilterOptions,
  COMMIT_LABEL_MAX_LEN,
  diffCommitFilterToSelection,
  formatCommitOptionSecondary,
  selectionToDiffCommitFilter,
  toggleCommitRangeSelection,
  truncateCommitLabel,
} from '../src/modal/lib/diff-commit-filter.ts';

/** Oldest-first shas c0…c4 */
const commits = [
  { sha: 'c0', message: 'zero' },
  { sha: 'c1', message: 'one' },
  { sha: 'c2', message: 'two' },
  { sha: 'c3', message: 'three' },
  { sha: 'c4', message: 'four' },
];

describe('toggleCommitRangeSelection', () => {
  test('empty → single', () => {
    expect(toggleCommitRangeSelection([], 'c2', commits)).toEqual(['c2']);
  });

  test('single same click clears', () => {
    expect(toggleCommitRangeSelection(['c2'], 'c2', commits)).toEqual([]);
  });

  test('single + other fills inclusive range (order independent)', () => {
    expect(toggleCommitRangeSelection(['c1'], 'c3', commits)).toEqual([
      'c1',
      'c2',
      'c3',
    ]);
    expect(toggleCommitRangeSelection(['c3'], 'c1', commits)).toEqual([
      'c1',
      'c2',
      'c3',
    ]);
  });

  test('range endpoint click leaves opposite alone', () => {
    const range = ['c1', 'c2', 'c3'];
    expect(toggleCommitRangeSelection(range, 'c1', commits)).toEqual(['c3']);
    expect(toggleCommitRangeSelection(range, 'c3', commits)).toEqual(['c1']);
  });

  test('range interior click resets to that commit', () => {
    const range = ['c1', 'c2', 'c3'];
    expect(toggleCommitRangeSelection(range, 'c2', commits)).toEqual(['c2']);
  });

  test('range outside click resets to that commit', () => {
    const range = ['c1', 'c2', 'c3'];
    expect(toggleCommitRangeSelection(range, 'c4', commits)).toEqual(['c4']);
    expect(toggleCommitRangeSelection(range, 'c0', commits)).toEqual(['c0']);
  });
});

describe('selection ↔ filter round-trip', () => {
  test('full range selection maps to range filter endpoints', () => {
    const f = selectionToDiffCommitFilter(['c1', 'c2', 'c3'], commits);
    expect(f).toEqual({ mode: 'range', sha: 'c1', endSha: 'c3' });
    expect(diffCommitFilterToSelection(f, commits)).toEqual([
      'c1',
      'c2',
      'c3',
    ]);
  });

  test('single and empty', () => {
    expect(selectionToDiffCommitFilter(['c2'], commits)).toEqual({
      mode: 'single',
      sha: 'c2',
    });
    expect(selectionToDiffCommitFilter([], commits)).toEqual({ mode: 'all' });
    expect(
      diffCommitFilterToSelection({ mode: 'single', sha: 'c2' }, commits)
    ).toEqual(['c2']);
  });
});

describe('formatCommitOptionSecondary / buildCommitFilterOptions', () => {
  test('secondary includes author and date when both present', () => {
    const secondary = formatCommitOptionSecondary({
      sha: 'abc1234deadbeef',
      message: 'fix the thing',
      author: 'alice',
      date: '2026-03-15T14:30:00.000Z',
    });
    expect(secondary).toContain('alice');
    expect(secondary).toMatch(/2026/);
    expect(secondary).toMatch(/·/);
  });

  test('secondary omits missing author or date gracefully', () => {
    expect(
      formatCommitOptionSecondary({
        sha: 'abc',
        message: 'only author',
        author: 'bob',
      })
    ).toBe('bob');
    expect(
      formatCommitOptionSecondary({
        sha: 'abc',
        message: 'only date',
        date: '2026-01-02T12:00:00.000Z',
      })
    ).toMatch(/2026/);
    expect(
      formatCommitOptionSecondary({ sha: 'abc', message: 'neither' })
    ).toBe('');
    expect(formatCommitOptionSecondary(null)).toBe('');
  });

  test('buildCommitFilterOptions attaches secondary without replacing primary label', () => {
    const longMsg =
      'This is a deliberately long commit message that should still appear in the primary label';
    const opts = buildCommitFilterOptions([
      {
        sha: 'deadbeefcafebabe',
        message: longMsg,
        author: 'carol',
        date: '2025-12-01T09:15:00.000Z',
      },
      {
        sha: '11111112222222',
        message: 'no meta',
      },
    ]);
    expect(opts).toHaveLength(2);
    // newest-first
    const withMeta = opts.find((o) => o.sha.startsWith('deadbeef'));
    const bare = opts.find((o) => o.sha.startsWith('1111111'));
    expect(withMeta).toBeTruthy();
    expect(bare).toBeTruthy();
    expect(withMeta!.label).toMatch(/deadbee/i);
    expect(withMeta!.label).toMatch(/deliberately long/i);
    expect(withMeta!.fullLabel).toContain(longMsg.slice(0, 40));
    // Secondary is separate from primary truncation
    expect(withMeta!.secondary).toContain('carol');
    expect(withMeta!.secondary).toMatch(/2025/);
    expect(withMeta!.label).not.toContain('carol');
    expect(bare!.secondary).toBe('');
    // Truncation still applies to label, not secondary
    const huge = 'x'.repeat(COMMIT_LABEL_MAX_LEN + 20);
    expect(truncateCommitLabel(huge).endsWith('…')).toBe(true);
    expect(truncateCommitLabel(huge).length).toBeLessThanOrEqual(
      COMMIT_LABEL_MAX_LEN
    );
  });
});
