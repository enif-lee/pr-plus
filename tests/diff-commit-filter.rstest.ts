/**
 * Diff commit filter + range multi-select toggle.
 */
import { describe, expect, test } from '@rstest/core';
import {
  diffCommitFilterToSelection,
  selectionToDiffCommitFilter,
  toggleCommitRangeSelection,
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
