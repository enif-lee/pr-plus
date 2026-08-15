/**
 * Open-list lifecycle + probe stale — shipped pure helpers.
 */
import { describe, expect, test } from '@rstest/core';
import {
  acceptOpenPullsNetworkResult,
  applyLifecycleToOpenPulls,
  filterOpenPullsByTombstones,
  isLifecycleDetailPatch,
  nextOpenPullTombstones,
  patchPrInOpenList,
  removePrFromOpenList,
  shouldRefetchOpenPulls,
} from '../src/modal/lib/open-pulls-lifecycle';
import {
  headProbeIndicatesStale,
  prProbeIndicatesStale,
} from '../src/modal/lib/auto-refresh';

const LIST = [
  { number: 1, title: 'One', draft: false, state: 'open' },
  { number: 2, title: 'Two', draft: true, state: 'open' },
  { number: 3, title: 'Three', draft: false, state: 'open' },
];

describe('patchPrInOpenList / removePrFromOpenList', () => {
  test('patches draft on matching number only', () => {
    const next = patchPrInOpenList(LIST, 2, { draft: false });
    expect(next.find((p) => p.number === 2)?.draft).toBe(false);
    expect(next.find((p) => p.number === 1)?.draft).toBe(false);
    expect(next).not.toBe(LIST);
    expect(LIST.find((p) => p.number === 2)?.draft).toBe(true);
  });

  test('remove drops merged number', () => {
    const next = removePrFromOpenList(LIST, 3);
    expect(next.map((p) => p.number)).toEqual([1, 2]);
  });
});

describe('applyLifecycleToOpenPulls', () => {
  test('post-mutation merged supersedes prior open row (removes)', () => {
    const { prs, removed } = applyLifecycleToOpenPulls(LIST, 3, {
      merged: true,
      state: 'closed',
    });
    expect(removed).toBe(true);
    expect(prs.map((p) => p.number)).toEqual([1, 2]);
    expect(prs.some((p) => p.number === 3)).toBe(false);
  });

  test('closed without merged also removes', () => {
    const { prs, removed } = applyLifecycleToOpenPulls(LIST, 1, {
      state: 'closed',
    });
    expect(removed).toBe(true);
    expect(prs.map((p) => p.number)).toEqual([2, 3]);
  });

  test('draft↔ready patches open list in place', () => {
    const { prs, removed, patched } = applyLifecycleToOpenPulls(LIST, 2, {
      draft: false,
    });
    expect(removed).toBe(false);
    expect(patched).toBe(true);
    expect(prs.find((p) => p.number === 2)?.draft).toBe(false);
    expect(prs.length).toBe(3);
  });
});

describe('shouldRefetchOpenPulls', () => {
  test('force always true', () => {
    expect(
      shouldRefetchOpenPulls({
        force: true,
        fetchedAt: Date.now(),
        maxAgeMs: 60_000,
      })
    ).toBe(true);
  });

  test('missing fetchedAt is stale', () => {
    expect(shouldRefetchOpenPulls({ force: false })).toBe(true);
  });

  test('fresh within maxAge does not refetch', () => {
    const now = 1_000_000;
    expect(
      shouldRefetchOpenPulls({
        force: false,
        fetchedAt: now - 5_000,
        maxAgeMs: 30_000,
        now,
      })
    ).toBe(false);
  });

  test('expired prefers revalidate', () => {
    const now = 1_000_000;
    expect(
      shouldRefetchOpenPulls({
        force: false,
        fetchedAt: now - 60_000,
        maxAgeMs: 30_000,
        now,
      })
    ).toBe(true);
  });
});

describe('isLifecycleDetailPatch', () => {
  test('detects draft/merged/state', () => {
    expect(isLifecycleDetailPatch({ draft: true })).toBe(true);
    expect(isLifecycleDetailPatch({ merged: true })).toBe(true);
    expect(isLifecycleDetailPatch({ state: 'closed' })).toBe(true);
    expect(isLifecycleDetailPatch({ title: 'x' })).toBe(false);
  });
});

describe('force-fetch gen + tombstone (host open-list policy)', () => {
  test('stale gen cannot commit network list', () => {
    const network = [
      { number: 1, title: 'A' },
      { number: 9, title: 'Just merged but still open on lagging API' },
    ];
    const stale = acceptOpenPullsNetworkResult({
      fetchGen: 1,
      currentGen: 2,
      networkPrs: network,
      tombstones: [9],
    });
    expect(stale.ok).toBe(false);
    expect(stale.prs).toEqual([]);
  });

  test('aborted fetch cannot commit', () => {
    const r = acceptOpenPullsNetworkResult({
      fetchGen: 3,
      currentGen: 3,
      aborted: true,
      networkPrs: [{ number: 1 }],
      tombstones: [],
    });
    expect(r.ok).toBe(false);
  });

  test('current gen filters tombstoned numbers — no resurrection after merge', () => {
    let tombs = nextOpenPullTombstones([], 9, {
      merged: true,
      state: 'closed',
    });
    expect([...tombs]).toEqual([9]);

    // Local list already pruned
    const local = applyLifecycleToOpenPulls(
      [
        { number: 1, title: 'A' },
        { number: 9, title: 'Gone' },
      ],
      9,
      { merged: true, state: 'closed' }
    );
    expect(local.prs.map((p) => p.number)).toEqual([1]);

    // Lagging GitHub still returns #9 as open
    const commit = acceptOpenPullsNetworkResult({
      fetchGen: 5,
      currentGen: 5,
      networkPrs: [
        { number: 1, title: 'A' },
        { number: 9, title: 'Still open lag' },
        { number: 12, title: 'New' },
      ],
      tombstones: tombs,
    });
    expect(commit.ok).toBe(true);
    expect(commit.prs.map((p) => p.number)).toEqual([1, 12]);
    expect(commit.prs.some((p) => p.number === 9)).toBe(false);

    // filter helper alone
    expect(
      filterOpenPullsByTombstones(
        [{ number: 9 }, { number: 1 }],
        tombs
      ).map((p) => p.number)
    ).toEqual([1]);
  });

  test('reopen clears tombstone so force fetch can re-add', () => {
    let tombs = nextOpenPullTombstones([], 4, { state: 'closed' });
    expect(tombs.has(4)).toBe(true);
    tombs = nextOpenPullTombstones(tombs, 4, { state: 'open', merged: false });
    expect(tombs.has(4)).toBe(false);
    const commit = acceptOpenPullsNetworkResult({
      fetchGen: 1,
      currentGen: 1,
      networkPrs: [{ number: 4, title: 'Reopened' }],
      tombstones: tombs,
    });
    expect(commit.ok).toBe(true);
    expect(commit.prs.map((p) => p.number)).toEqual([4]);
  });
});

describe('prProbeIndicatesStale', () => {
  test('head sha change still stale', () => {
    expect(
      prProbeIndicatesStale(
        { headSha: 'aaa', draft: false, state: 'open' },
        { headSha: 'bbb', draft: false, state: 'open' }
      )
    ).toBe(true);
    expect(headProbeIndicatesStale('aaa', 'bbb')).toBe(true);
  });

  test('draft flip without sha change is stale', () => {
    expect(
      prProbeIndicatesStale(
        { headSha: 'aaa', draft: true, state: 'open' },
        { headSha: 'aaa', draft: false, state: 'open' }
      )
    ).toBe(true);
  });

  test('state closed without sha change is stale', () => {
    expect(
      prProbeIndicatesStale(
        { headSha: 'aaa', draft: false, state: 'open' },
        { headSha: 'aaa', draft: false, state: 'closed' }
      )
    ).toBe(true);
  });

  test('identical lifecycle is not stale', () => {
    expect(
      prProbeIndicatesStale(
        { headSha: 'aaa', draft: false, state: 'open' },
        { headSha: 'aaa', draft: false, state: 'open' }
      )
    ).toBe(false);
  });
});
