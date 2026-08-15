/**
 * Diff body readiness — slim IDB / meta-only files must not count as complete.
 */
import { describe, expect, test } from '@rstest/core';
import {
  fileAllowsMissingPatch,
  filesListHasUsableDiffBodies,
  filesListNeedsFullFetch,
  isDetailCompleteForFullCache,
} from '../src/modal/lib/detail-idb';

describe('filesListHasUsableDiffBodies', () => {
  test('empty is not usable', () => {
    expect(filesListHasUsableDiffBodies([])).toBe(false);
    expect(filesListHasUsableDiffBodies(null)).toBe(false);
  });

  test('real patches are usable', () => {
    expect(
      filesListHasUsableDiffBodies([
        { filename: 'a.ts', patch: '@@ -1 +1 @@\n+x', additions: 1, deletions: 0 },
      ])
    ).toBe(true);
  });

  test('_patchOmitted is not usable', () => {
    expect(
      filesListHasUsableDiffBodies([
        {
          filename: 'a.ts',
          patch: '',
          _patchOmitted: true,
          additions: 10,
          deletions: 10,
        },
      ])
    ).toBe(false);
  });

  test('text change without patch is not usable', () => {
    expect(
      filesListHasUsableDiffBodies([
        { filename: 'a.ts', patch: '', additions: 10, deletions: 10 },
      ])
    ).toBe(false);
  });

  test('binary / renamed may omit patch', () => {
    expect(
      filesListHasUsableDiffBodies([
        { filename: 'x.png', patch: '', binary: true, additions: 0, deletions: 0 },
      ])
    ).toBe(true);
    expect(fileAllowsMissingPatch({ status: 'renamed', patch: '' })).toBe(true);
  });
});

describe('filesListNeedsFullFetch', () => {
  test('empty needs fetch', () => {
    expect(filesListNeedsFullFetch([])).toBe(true);
    expect(filesListNeedsFullFetch(null)).toBe(true);
  });

  test('slim _patchOmitted needs fetch', () => {
    expect(
      filesListNeedsFullFetch([
        { filename: 'a.ts', patch: '', _patchOmitted: true, additions: 1 },
      ])
    ).toBe(true);
  });

  test('incomplete count needs fetch', () => {
    expect(
      filesListNeedsFullFetch(
        [{ filename: 'a.ts', patch: '@@\n+x', additions: 1 }],
        10
      )
    ).toBe(true);
  });

  test('full REST page with GitHub-omitted large patch does NOT re-fetch', () => {
    // GitHub drops patch on oversized files without _patchOmitted.
    expect(
      filesListNeedsFullFetch(
        [
          { filename: 'a.ts', patch: '@@\n+x', additions: 1, deletions: 0 },
          { filename: 'big.ts', patch: '', additions: 5000, deletions: 5000 },
        ],
        2
      )
    ).toBe(false);
  });

  test('count complete with patches does not need fetch', () => {
    expect(
      filesListNeedsFullFetch(
        [{ filename: 'a.ts', patch: '@@\n+x', additions: 1 }],
        1
      )
    ).toBe(false);
  });
});

describe('isDetailCompleteForFullCache', () => {
  test('rejects slim files even with commits', () => {
    expect(
      isDetailCompleteForFullCache({
        files: [{ filename: 'a.ts', patch: '', _patchOmitted: true, additions: 1 }],
        commits: [{ sha: 'abc' }],
      })
    ).toBe(false);
  });

  test('accepts files with patches + commits', () => {
    expect(
      isDetailCompleteForFullCache({
        files: [{ filename: 'a.ts', patch: '@@\n+x', additions: 1 }],
        commits: [{ sha: 'abc' }],
      })
    ).toBe(true);
  });
});
