/**
 * Server Viewed helpers — builders + parsers (shipped pure path).
 */
import { describe, expect, test } from '@rstest/core';
import {
  applyViewedToggle,
  buildFetchViewerViewedFilesGraphql,
  buildMarkFileAsViewedGraphql,
  buildUnmarkFileAsViewedGraphql,
  isViewedMutationOk,
  parseViewedPathsFromGraphql,
  shouldApplyServerViewedPaths,
} from '../src/modal/lib/file-viewed';

describe('parseViewedPathsFromGraphql', () => {
  test('extracts VIEWED paths from repository.pullRequest.files', () => {
    const data = {
      repository: {
        pullRequest: {
          id: 'PR_kw',
          files: {
            nodes: [
              { path: 'src/a.ts', viewerViewedState: 'VIEWED' },
              { path: 'src/b.ts', viewerViewedState: 'UNVIEWED' },
              { path: 'src/c.ts', viewerViewedState: 'VIEWED' },
            ],
          },
        },
      },
    };
    expect(parseViewedPathsFromGraphql(data)).toEqual(['src/a.ts', 'src/c.ts']);
  });

  test('empty when no data', () => {
    expect(parseViewedPathsFromGraphql(null)).toEqual([]);
    expect(parseViewedPathsFromGraphql({})).toEqual([]);
  });
});

describe('applyViewedToggle', () => {
  test('mark adds path', () => {
    const next = applyViewedToggle(['a.ts'], 'b.ts', true);
    expect([...next].sort()).toEqual(['a.ts', 'b.ts']);
  });
  test('unmark removes path', () => {
    const next = applyViewedToggle(['a.ts', 'b.ts'], 'a.ts', false);
    expect([...next]).toEqual(['b.ts']);
  });
});

describe('graphql builders', () => {
  test('mark / unmark payload shape', () => {
    const m = buildMarkFileAsViewedGraphql('PR_1', 'src/x.ts');
    expect(m.query).toMatch(/markFileAsViewed/);
    expect(m.variables.input).toEqual({
      pullRequestId: 'PR_1',
      path: 'src/x.ts',
    });
    const u = buildUnmarkFileAsViewedGraphql('PR_1', 'src/x.ts');
    expect(u.query).toMatch(/unmarkFileAsViewed/);
    expect(u.variables.input.path).toBe('src/x.ts');
  });

  test('fetch query includes viewerViewedState', () => {
    const q = buildFetchViewerViewedFilesGraphql('o', 'r', 12, null);
    expect(q.query).toMatch(/viewerViewedState/);
    expect(q.variables).toMatchObject({ owner: 'o', repo: 'r', number: 12 });
  });

  test('isViewedMutationOk', () => {
    expect(
      isViewedMutationOk({ markFileAsViewed: { pullRequest: { id: 'x' } } }, true)
    ).toBe(true);
    expect(isViewedMutationOk({ unmarkFileAsViewed: {} }, false)).toBe(false);
  });
});

describe('shouldApplyServerViewedPaths', () => {
  test('rejects no-token / unauthorized empty stubs', () => {
    expect(shouldApplyServerViewedPaths(null)).toBe(false);
    expect(
      shouldApplyServerViewedPaths({
        pullRequestId: null,
        viewedPaths: [],
        unauthorized: true,
      })
    ).toBe(false);
    expect(
      shouldApplyServerViewedPaths({ pullRequestId: null, viewedPaths: [] })
    ).toBe(false);
  });

  test('accepts authorized payload even when zero viewed files', () => {
    expect(
      shouldApplyServerViewedPaths({
        pullRequestId: 'PR_kw1',
        viewedPaths: [],
      })
    ).toBe(true);
    expect(
      shouldApplyServerViewedPaths({
        pullRequestId: 'PR_kw1',
        viewedPaths: ['a.ts'],
      })
    ).toBe(true);
  });
});
