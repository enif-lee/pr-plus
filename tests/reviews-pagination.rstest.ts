/**
 * fetchPrReviews walks REST pages of 100 until Link next is exhausted.
 * Drives the shipped function (not a re-implementation).
 */
import { describe, expect, test } from '@rstest/core';
import { fetchPrReviews } from '../src/fetch/detail-sides-comments.ts';

function makeReview(id: number) {
  return {
    id,
    user: {
      login: `u${id}`,
      avatar_url: `https://example.com/${id}.png`,
      type: 'User',
    },
    state: 'COMMENTED',
    body: id === 1 ? 'first' : '',
    submitted_at: `2026-01-01T00:00:${String(id % 60).padStart(2, '0')}Z`,
  };
}

function jsonResponse(data: unknown, link: string | null = null) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => data,
    headers: {
      get(name: string) {
        if (String(name).toLowerCase() === 'link') return link || '';
        return null;
      },
    },
  };
}

describe('fetchPrReviews pagination (shipped)', () => {
  test('walks page1=100 + page2 short via Link rel=next', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => makeReview(i + 1));
    const page2 = Array.from({ length: 17 }, (_, i) => makeReview(101 + i));
    const urls: string[] = [];
    const fetchImpl = async (url: string) => {
      urls.push(String(url));
      if (urls.length === 1) {
        return jsonResponse(
          page1,
          `<https://api.github.com/repos/o/r/pulls/7/reviews?per_page=100&page=2>; rel="next", <https://api.github.com/repos/o/r/pulls/7/reviews?per_page=100&page=2>; rel="last"`
        );
      }
      return jsonResponse(page2, null);
    };

    const reviews = await fetchPrReviews('o', 'r', 7, fetchImpl, 'tok');
    expect(urls.length).toBeGreaterThanOrEqual(2);
    expect(reviews).toHaveLength(117);
    expect(reviews[0]).toMatchObject({
      id: 1,
      author: 'u1',
      state: 'COMMENTED',
      body: 'first',
    });
    expect(reviews[100].id).toBe(101);
    expect(reviews[116].id).toBe(117);
    expect(String(urls[0])).toMatch(/\/pulls\/7\/reviews\?per_page=100/);
  });

  test('single short page does not request a second page', async () => {
    const page1 = [makeReview(1), makeReview(2)];
    let n = 0;
    const fetchImpl = async () => {
      n += 1;
      return jsonResponse(page1, null);
    };
    const reviews = await fetchPrReviews('acme', 'app', 3, fetchImpl, 't');
    expect(n).toBe(1);
    expect(reviews).toHaveLength(2);
  });

  test('empty owner/repo/number returns [] without fetch', async () => {
    let n = 0;
    const fetchImpl = async () => {
      n += 1;
      return jsonResponse([]);
    };
    expect(await fetchPrReviews('', 'r', 1, fetchImpl, 't')).toEqual([]);
    expect(await fetchPrReviews('o', '', 1, fetchImpl, 't')).toEqual([]);
    expect(await fetchPrReviews('o', 'r', NaN, fetchImpl, 't')).toEqual([]);
    expect(n).toBe(0);
  });
});
