/**
 * same-headSha files/commits/diff reuse decisions (shipped detail-idb helpers).
 */
import { describe, expect, test } from '@rstest/core';
import {
  mayReuseFilesCommitsDiff,
  normalizeHeadSha,
  sameHeadSha,
  filesListNeedsFullFetch,
} from '../src/modal/lib/detail-idb';

function cacheWithBodies(sha: string) {
  return {
    headSha: sha,
    changedFiles: 1,
    files: [
      {
        filename: 'a.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        changes: 1,
        patch: '@@ -1 +1 @@\n-a\n+b\n',
      },
    ],
    commits: [{ sha: 'c1', commit: { message: 'x' } }],
  };
}

describe('sameHeadSha / mayReuseFilesCommitsDiff', () => {
  test('normalize + sameHeadSha', () => {
    expect(normalizeHeadSha(' ABC ')).toBe('abc');
    expect(sameHeadSha('AbC', 'abc')).toBe(true);
    expect(sameHeadSha('', 'abc')).toBe(false);
    expect(sameHeadSha('aaa', 'bbb')).toBe(false);
  });

  test('same head + usable bodies → reuse files and commits', () => {
    const cache = cacheWithBodies('deadbeef01');
    const live = { headSha: 'DEADBEEF01', changedFiles: 1 };
    const d = mayReuseFilesCommitsDiff(cache, live);
    expect(d.sameHead).toBe(true);
    expect(d.reuseFiles).toBe(true);
    expect(d.reuseCommits).toBe(true);
    expect(d.reason).toMatch(/reuse/);
  });

  test('different headSha → fetch required (no reuse)', () => {
    const cache = cacheWithBodies('aaaaaaaa');
    const live = { headSha: 'bbbbbbbb', changedFiles: 1 };
    const d = mayReuseFilesCommitsDiff(cache, live);
    expect(d.sameHead).toBe(false);
    expect(d.reuseFiles).toBe(false);
    expect(d.reuseCommits).toBe(false);
    expect(d.reason).toBe('head-mismatch');
  });

  test('slim _patchOmitted files → no file reuse', () => {
    const cache = {
      headSha: 'cccc',
      changedFiles: 1,
      files: [
        {
          filename: 'a.ts',
          status: 'modified',
          _patchOmitted: true,
          additions: 1,
          deletions: 0,
          changes: 1,
        },
      ],
      commits: [{ sha: 'c1' }],
    };
    const d = mayReuseFilesCommitsDiff(cache, { headSha: 'cccc' });
    expect(d.sameHead).toBe(true);
    expect(d.reuseFiles).toBe(false);
    expect(d.reuseCommits).toBe(true);
    expect(filesListNeedsFullFetch(cache.files, 1)).toBe(true);
  });

  test('no cache → no reuse', () => {
    const d = mayReuseFilesCommitsDiff(null, { headSha: 'x' });
    expect(d.reuseFiles).toBe(false);
    expect(d.reason).toBe('no-cache');
  });

  test('provisional reuse when live head empty but cache has sha + bodies', () => {
    const cache = cacheWithBodies('eeee');
    const d = mayReuseFilesCommitsDiff(cache, { headSha: null });
    expect(d.sameHead).toBe(true);
    expect(d.reuseFiles).toBe(true);
  });
});
