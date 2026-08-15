/**
 * Repo tags cache: newest-first merge, skip rewalk of known pages.
 */
import { describe, expect, test, beforeEach } from '@rstest/core';
import {
  clearRepoTagsCache,
  filterTagsByCommitShas,
  getRepoTagsCache,
  isRepoTagsCacheFresh,
  mergeNewestFirstTagPage,
  setRepoTagsCache,
  __repoTagsCacheSizeForTests,
} from '../src/modal/lib/tags-cache';

beforeEach(() => {
  clearRepoTagsCache();
});

describe('mergeNewestFirstTagPage', () => {
  test('cold page1 short list is complete — no more pages', () => {
    const page = [
      { name: 'v2', sha: 'aaa' },
      { name: 'v1', sha: 'bbb' },
    ];
    const { entry, needMorePages } = mergeNewestFirstTagPage(null, page, {
      pageSize: 100,
      pageIndex: 1,
    });
    expect(needMorePages).toBe(false);
    expect(entry.complete).toBe(true);
    expect(entry.tags.map((t) => t.name)).toEqual(['v2', 'v1']);
  });

  test('full page1 signals needMorePages when no prior cache', () => {
    const page = Array.from({ length: 100 }, (_, i) => ({
      name: `t${i}`,
      sha: `sha${i}`,
    }));
    const { needMorePages, entry } = mergeNewestFirstTagPage(null, page, {
      pageSize: 100,
      pageIndex: 1,
    });
    expect(needMorePages).toBe(true);
    expect(entry.pagesLoaded).toBe(1);
    expect(entry.tags.length).toBe(100);
  });

  test('page1 that overlaps head of cache does not rewalk deeper pages', () => {
    const prev = {
      tags: [
        { name: 'v3', sha: 'c' },
        { name: 'v2', sha: 'b' },
        { name: 'v1', sha: 'a' },
      ],
      pagesLoaded: 3,
      complete: true,
      fetchedAt: 1,
    };
    // Fresh page1: one newer tag + same head as before
    const page1 = [
      { name: 'v4', sha: 'd' },
      { name: 'v3', sha: 'c' },
      { name: 'v2', sha: 'b' },
    ];
    const { entry, needMorePages } = mergeNewestFirstTagPage(prev, page1, {
      pageSize: 100,
      pageIndex: 1,
      now: 99,
    });
    expect(needMorePages).toBe(false);
    expect(entry.tags.map((t) => t.name)).toEqual(['v4', 'v3', 'v2', 'v1']);
    expect(entry.fetchedAt).toBe(99);
  });

  test('identical page1 head skips network rewalk', () => {
    const prev = {
      tags: [
        { name: 'v2', sha: 'b' },
        { name: 'v1', sha: 'a' },
      ],
      pagesLoaded: 1,
      complete: true,
      fetchedAt: 10,
    };
    const { needMorePages, entry } = mergeNewestFirstTagPage(
      prev,
      [
        { name: 'v2', sha: 'b' },
        { name: 'v1', sha: 'a' },
      ],
      { pageIndex: 1, now: 20 }
    );
    expect(needMorePages).toBe(false);
    expect(entry.tags.length).toBe(2);
    expect(entry.fetchedAt).toBe(20);
  });
});

describe('filterTagsByCommitShas', () => {
  test('keeps only tags whose sha is in the PR set', () => {
    const tags = [
      { name: 'v1', sha: 'AAA' },
      { name: 'v2', sha: 'bbb' },
      { name: 'v3', sha: 'ccc' },
    ];
    const hit = filterTagsByCommitShas(tags, ['aaa', 'ccc']);
    expect(hit.map((t) => t.name)).toEqual(['v1', 'v3']);
  });

  test('empty sha set yields empty list', () => {
    expect(filterTagsByCommitShas([{ name: 'x', sha: '1' }], [])).toEqual([]);
  });
});

describe('get/set repo cache', () => {
  test('stores and retrieves by owner/repo', () => {
    setRepoTagsCache('Acme', 'Widget', {
      tags: [{ name: 'v1', sha: '1' }],
      pagesLoaded: 1,
      complete: true,
      fetchedAt: Date.now(),
    });
    const e = getRepoTagsCache('acme', 'widget');
    expect(e?.tags[0].name).toBe('v1');
    expect(isRepoTagsCacheFresh(e)).toBe(true);
    expect(__repoTagsCacheSizeForTests()).toBe(1);
  });

  test('stale entry is not fresh past TTL', () => {
    const e = {
      tags: [],
      pagesLoaded: 0,
      complete: true,
      fetchedAt: Date.now() - 60 * 60 * 1000,
    };
    expect(isRepoTagsCacheFresh(e, Date.now(), 30 * 60 * 1000)).toBe(false);
  });
});
