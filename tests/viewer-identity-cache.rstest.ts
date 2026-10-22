import { describe, expect, test } from '@rstest/core';
import { createViewerIdentityCache, applyViewerIdentity } from '../src/background/sw-viewer-identity';

function storage() {
  let saved: any = {};
  return {
    get: (_keys: string[], cb: (value: any) => void) => cb(structuredClone(saved)),
    set: (next: any, cb: () => void) => { saved = structuredClone(next); cb(); },
    snapshot: () => saved,
  };
}

describe('plugin-wide viewer identity', () => {
  test('cached login applies to previously unseen PRs and repositories on their first render', async () => {
    const area = storage();
    let requests = 0;
    const load = async () => { requests++; return { id: 1, login: 'Alice' }; };
    const first = createViewerIdentityCache(area);
    expect(await first.get('github.com', 'alice-pat', load)).toEqual({ id: 1, login: 'Alice' });
    const afterRestart = createViewerIdentityCache(area);
    const login = await afterRestart.get('github.com', 'alice-pat', load);
    const prs = [{ number: 999, author: 'alice' }, { number: 7, author: 'bob' }];
    expect(applyViewerIdentity(prs, login)).toEqual([
      { number: 999, author: 'alice', viewerDidAuthor: true },
      { number: 7, author: 'bob', viewerDidAuthor: false },
    ]);
    expect(prs[0]).not.toHaveProperty('viewerDidAuthor');
    expect(requests).toBe(1);
    expect(JSON.stringify(area.snapshot())).not.toContain('alice-pat');
  });

  test('stable author IDs remain correct after usernames change', () => {
    const viewer = { id: 1, login: 'old-alice' };
    expect(applyViewerIdentity([
      { number: 1, author: 'new-alice', authorId: 1 },
      { number: 2, author: 'old-alice', authorId: 2 },
    ], viewer)).toEqual([
      { number: 1, author: 'new-alice', authorId: 1, viewerDidAuthor: true },
      { number: 2, author: 'old-alice', authorId: 2, viewerDidAuthor: false },
    ]);
  });

  test('reading cached identity never waits for a cold network lookup', async () => {
    const cache = createViewerIdentityCache(storage());
    let release!: (value: { id: number; login: string }) => void;
    const pending = cache.get('github.com', 'pat', () => new Promise(resolve => { release = resolve; }));
    expect(await cache.peek('github.com', 'pat')).toBeNull();
    // Allow digest/read setup to reach the held fetch without waiting on it.
    await new Promise(resolve => setTimeout(resolve, 0));
    release({ id: 1, login: 'alice' });
    await pending;
    expect(await cache.peek('github.com', 'pat')).toEqual({ id: 1, login: 'alice' });
  });

  test('deduplicates concurrent activation/list requests for one identity', async () => {
    const cache = createViewerIdentityCache(storage());
    let requests = 0;
    const load = async () => { requests++; return { id: 1, login: 'alice' }; };
    expect(await Promise.all(Array.from({ length: 5 }, () => cache.get('github.com', 'pat', load))))
      .toEqual(Array(5).fill({ id: 1, login: 'alice' }));
    expect(requests).toBe(1);
  });

  test('host and token switches use separate identities', async () => {
    const cache = createViewerIdentityCache(storage());
    await Promise.all([
      cache.get('github.com', 'patA', async () => ({ id: 1, login: 'alice' })),
      cache.get('github.com', 'patB', async () => ({ id: 2, login: 'bob' })),
      cache.get('enterprise.example', 'patA', async () => ({ id: 3, login: 'carol' })),
    ]);
    const noFetch = async () => { throw new Error('should be cached'); };
    expect(await cache.get('github.com', 'patA', noFetch)).toEqual({ id: 1, login: 'alice' });
    expect(await cache.get('github.com', 'patB', noFetch)).toEqual({ id: 2, login: 'bob' });
    expect(await cache.get('enterprise.example', 'patA', noFetch)).toEqual({ id: 3, login: 'carol' });
  });

  test('failed identity lookups remain retryable without hiding the REST rows', async () => {
    const cache = createViewerIdentityCache(storage());
    const rows = [{ number: 1, author: 'alice' }];
    const unknown = await cache.get('github.com', 'pat', async () => { throw new Error('offline'); });
    expect(applyViewerIdentity(rows, unknown)).toBe(rows);
    expect(await cache.get('github.com', 'pat', async () => ({ id: 1, login: 'alice' }))).toEqual({ id: 1, login: 'alice' });
    expect(await cache.get('github.com', null, async () => ({ id: 9, login: 'invalid' }))).toBeNull();
  });
});
