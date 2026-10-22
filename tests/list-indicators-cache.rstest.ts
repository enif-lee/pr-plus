import { describe, expect, test } from '@rstest/core';
import { createListIndicatorsCache, listIndicatorsScope, mergeCachedListIndicators,
  LIST_INDICATORS_MAX_AGE_MS } from '../src/background/sw-list-indicators-cache';

function storage() {
  let saved: any = {};
  return {
    get: (_keys: string[], cb: (value: any) => void) => cb(structuredClone(saved)),
    set: (next: any, cb: () => void) => { saved = structuredClone(next); cb(); },
    snapshot: () => saved,
  };
}
const pr = { number: 7, title: 'REST title', baseRef: 'main', headRef: 'feature', headSha: 'head1', baseSha: 'base1' };
const badge = { number: 7, additions: 1500, deletions: 0, changedFiles: 2,
  listChecksState: 'SUCCESS', listChecksPassed: 3, listChecksTotal: 3 };

describe('persistent pulls list badge cache', () => {
  test('survives cache instance restart and merges only badge fields before first render', async () => {
    const area = storage();
    const scope = await listIndicatorsScope('github.com', 'o', 'r', 'test-pat');
    const writer = createListIndicatorsCache(area, () => 10);
    await writer.save(scope, [pr], [{ ...badge, title: 'wrong', headRef: 'wrong', viewerDidAuthor: true }]);
    const reader = createListIndicatorsCache(area, () => 20);
    const merged = mergeCachedListIndicators([pr], await reader.read(scope));
    expect(merged[0]).toEqual({ ...pr, ...badge, viewerDidAuthor: true });
    expect(pr).not.toHaveProperty('additions');
    expect(JSON.stringify(area.snapshot())).not.toContain('test-pat');
  });

  test('host, repository, and auth account scopes are separate, with case-normalized repo names', async () => {
    const scope = await listIndicatorsScope('github.com', 'O', 'R', 'test-pat');
    expect(await listIndicatorsScope('GITHUB.COM', 'o', 'r', 'test-pat')).toBe(scope);
    const cache = createListIndicatorsCache(storage(), () => 1);
    await cache.save(scope, [pr], [badge]);
    for (const other of [
      await listIndicatorsScope('enterprise.example', 'o', 'r', 'test-pat'),
      await listIndicatorsScope('github.com', 'o', 'other', 'test-pat'),
      await listIndicatorsScope('github.com', 'o', 'r', 'different-pat'),
      await listIndicatorsScope('github.com', 'o', 'r', null),
    ]) expect(await cache.read(other)).toEqual({});
  });

  test('cached own-author flags stay account-specific, including false values', async () => {
    const cache = createListIndicatorsCache(storage());
    const mine = await listIndicatorsScope('github.com', 'o', 'r', 'author-pat');
    const other = await listIndicatorsScope('github.com', 'o', 'r', 'reviewer-pat');
    await cache.save(mine, [pr], [{ ...badge, viewerDidAuthor: true }]);
    await cache.save(other, [pr], [{ ...badge, viewerDidAuthor: false }]);
    expect(mergeCachedListIndicators([pr], await cache.read(mine))[0].viewerDidAuthor).toBe(true);
    expect(mergeCachedListIndicators([pr], await cache.read(other))[0].viewerDidAuthor).toBe(false);
  });

  test('author identity outlives mutable badges and commit changes without being updated', async () => {
    let time = 100;
    const cache = createListIndicatorsCache(storage(), () => time);
    await cache.save('scope', [pr], [{ ...badge, viewerDidAuthor: true }]);
    time += LIST_INDICATORS_MAX_AGE_MS + 1;
    const nextCommit = { ...pr, headSha: 'new-head', baseSha: 'new-base' };
    const restored = mergeCachedListIndicators([nextCommit], await cache.read('scope'))[0];
    expect(restored).toEqual({ ...nextCommit, viewerDidAuthor: true });
    await cache.save('scope', [nextCommit], [{ ...badge, viewerDidAuthor: false }]);
    expect(mergeCachedListIndicators([nextCommit], await cache.read('scope'))[0].viewerDidAuthor).toBe(true);
  });

  test('a cached author flag in a failed follow-up does not reset Checks or extend their TTL', async () => {
    let time = 100;
    const cache = createListIndicatorsCache(storage(), () => time);
    await cache.save('scope', [pr], [{ ...badge, viewerDidAuthor: false }]);
    time += LIST_INDICATORS_MAX_AGE_MS - 1;
    await cache.save('scope', [pr], [{ number: 7, viewerDidAuthor: false, magicLinks: [] }]);
    expect(mergeCachedListIndicators([pr], await cache.read('scope'))[0]).toMatchObject(badge);
    time++;
    expect(mergeCachedListIndicators([pr], await cache.read('scope'))[0]).toEqual({ ...pr, viewerDidAuthor: false });
  });

  test('new head or base commits and absent commit identity invalidate cached badges', async () => {
    const cache = createListIndicatorsCache(storage(), () => 10);
    await cache.save('scope', [pr], [badge]);
    const entries = await cache.read('scope');
    for (const changed of [{ ...pr, headSha: 'head2' }, { ...pr, baseSha: 'base2' }, { ...pr, headSha: '' }]) {
      expect(mergeCachedListIndicators([changed], entries)[0]).toBe(changed);
    }
    expect(mergeCachedListIndicators([{ ...pr, number: 8 }], entries)[0]).not.toHaveProperty('additions');
  });

  test('ten-minute expiry is not extended by an optional metadata failure', async () => {
    let time = 100;
    const cache = createListIndicatorsCache(storage(), () => time);
    await cache.save('scope', [pr], [badge]);
    time += LIST_INDICATORS_MAX_AGE_MS - 1;
    await cache.save('scope', [pr], [{ number: 7, magicLinks: [] }]);
    expect((await cache.read('scope'))[7].fields.additions).toBe(1500);
    time++;
    expect(await cache.read('scope')).toEqual({});
  });

  test('latest successful values replace old state and counts, including no-checks state', async () => {
    const cache = createListIndicatorsCache(storage());
    await cache.save('scope', [pr], [badge]);
    await cache.save('scope', [pr], [{ number: 7, additions: 0, deletions: 0, listChecksState: null }]);
    const restored = mergeCachedListIndicators([pr], await cache.read('scope'))[0];
    expect(restored).toMatchObject({ additions: 0, deletions: 0, listChecksState: null });
    expect(restored).not.toHaveProperty('listChecksPassed');
  });

  test('an older request completing later cannot regress a newer Checks result', async () => {
    const cache = createListIndicatorsCache(storage(), () => 300);
    await cache.save('scope', [pr], [badge], 200);
    await cache.save('scope', [pr], [{ ...badge, listChecksState: 'PENDING', listChecksPassed: 0 }], 100);
    expect(mergeCachedListIndicators([pr], await cache.read('scope'))[0]).toMatchObject(badge);
  });

  test('clearing the cache prevents older in-flight metadata from restoring deleted entries', async () => {
    let time = 100;
    const cache = createListIndicatorsCache(storage(), () => time);
    await cache.save('scope', [pr], [badge], 100);
    time = 200;
    await cache.clear();
    time = 300;
    await cache.save('scope', [pr], [badge], 100);
    expect(await cache.read('scope')).toEqual({});
    await cache.save('scope', [pr], [badge], 300);
    expect(mergeCachedListIndicators([pr], await cache.read('scope'))[0]).toMatchObject(badge);
  });

  test('serializes concurrent cache writes across repos and bounds persistent entries', async () => {
    let time = 0;
    const area = storage();
    const cache = createListIndicatorsCache(area, () => ++time);
    await Promise.all(Array.from({ length: 6 }, (_, repo) => {
      const prs = Array.from({ length: 100 }, (_, n) => ({ ...pr, number: n + 1 }));
      return cache.save(`repo${repo}`, prs, prs.map(p => ({ ...badge, number: p.number })));
    }));
    expect(Object.keys(Object.values(area.snapshot())[0] as any)).toHaveLength(500);
    expect(await cache.read('repo0')).toEqual({});
    expect(Object.keys(await cache.read('repo5'))).toHaveLength(100);
    await cache.clear();
    expect(await cache.read('repo5')).toEqual({});
  });

  test('unavailable extension storage leaves essential REST data untouched', async () => {
    const cache = createListIndicatorsCache(null);
    await cache.save('scope', [pr], [badge]);
    expect(mergeCachedListIndicators([pr], await cache.read('scope'))).toEqual([pr]);
    const broken = createListIndicatorsCache({ get() { throw new Error('offline'); }, set() { throw new Error('offline'); } });
    await broken.save('scope', [pr], [badge]);
    expect(await broken.read('scope')).toEqual({});
  });
});
