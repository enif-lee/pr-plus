/**
 * Pure-function gates for session defect paths covered by e2e.
 * These are unit-suite checks (not a substitute for agent-browser e2e).
 */
import { describe, expect, test } from '@rstest/core';
import {
  filesListNeedsFullFetch,
  filesListHasUsableDiffBodies,
} from '../src/modal/lib/detail-idb';
import {
  applyPeopleMetaAuthorityToCore,
  buildPeopleMetaAuthority,
} from '../src/modal/lib/detail-store';

describe('session defect pure gates (shipped)', () => {
  test('filesListNeedsFullFetch does not re-fetch GitHub-omitted patches', () => {
    expect(
      filesListNeedsFullFetch(
        [
          { filename: 'a.ts', patch: '@@\n+x', additions: 1 },
          { filename: 'big.ts', patch: '', additions: 5000, deletions: 5000 },
        ],
        2
      )
    ).toBe(false);
    expect(
      filesListNeedsFullFetch(
        [{ filename: 'a.ts', patch: '', _patchOmitted: true, additions: 1 }],
        1
      )
    ).toBe(true);
  });

  test('filesListHasUsableDiffBodies still false for text without patch', () => {
    expect(
      filesListHasUsableDiffBodies([
        { filename: 'a.ts', patch: '', additions: 10, deletions: 10 },
      ])
    ).toBe(false);
  });

  test('clear people-meta authority expires so network chips can return', () => {
    const auth = buildPeopleMetaAuthority(
      { owner: 'o', repo: 'r', number: 7 },
      { labels: [] },
      { gen: 1, at: 1_000 }
    );
    const late = applyPeopleMetaAuthorityToCore(
      { number: 7, labels: [{ name: 'bug' }] },
      auth,
      { owner: 'o', repo: 'r', number: 7 },
      { now: 1_000 + 20_000, clearTtlMs: 12_000 }
    );
    expect(late.flat.labels).toEqual([{ name: 'bug' }]);
  });
});
