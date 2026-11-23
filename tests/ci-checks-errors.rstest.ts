/**
 * fetchPrChecks: a failed GitHub request must not masquerade as "no CI".
 * The host keeps its last good snapshot only when the fetch throws.
 */
import { describe, expect, test } from '@rstest/core';
import { fetchPrChecks } from '../src/fetch/detail-sides-files';

const ok = (body: any) => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number) => ({
  ok: false, status, statusText: 'upstream unavailable', json: async () => ({}),
});

function fetchReturning(status: any, runs: any) {
  const calls: string[] = [];
  const impl = async (url: string) => {
    calls.push(url);
    return url.includes('/status?') ? status : runs;
  };
  return { impl, calls };
}

describe('fetchPrChecks failure handling', () => {
  test('successful empty response is a real empty snapshot', async () => {
    const { impl } = fetchReturning(ok({ state: 'pending', total_count: 0, statuses: [] }), ok({ total_count: 0, check_runs: [] }));
    expect(await fetchPrChecks('o', 'r', 'abc', impl)).toEqual({
      state: 'unknown', totalCount: 0, statuses: [], checkRuns: [],
    });
  });

  test('503 on status throws instead of returning an empty snapshot', async () => {
    const { impl } = fetchReturning(fail(503), ok({ check_runs: [] }));
    await expect(fetchPrChecks('o', 'r', 'abc', impl)).rejects.toMatchObject({ status: 503 });
  });

  test('503 on check-runs throws (partial data is not authoritative)', async () => {
    const { impl, calls } = fetchReturning(
      ok({ state: 'success', total_count: 1, statuses: [{ context: 'ci', state: 'success' }] }),
      fail(503)
    );
    await expect(fetchPrChecks('o', 'r', 'abc', impl)).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(2);
  });

  test('403/404 are not silently treated as empty either', async () => {
    for (const status of [403, 404]) {
      const { impl } = fetchReturning(fail(status), fail(status));
      await expect(fetchPrChecks('o', 'r', 'abc', impl)).rejects.toMatchObject({ status });
    }
  });

  test('malformed success payload throws rather than inventing empty', async () => {
    const { impl } = fetchReturning(ok({}), ok({}));
    await expect(fetchPrChecks('o', 'r', 'abc', impl)).rejects.toThrow(/invalid CI checks/);
  });

  test('abort still propagates', async () => {
    const abort = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
    await expect(fetchPrChecks('o', 'r', 'abc', async () => { throw abort; })).rejects.toBe(abort);
  });

  test('invalid args return empty without a network call', async () => {
    let n = 0;
    expect(await fetchPrChecks('', 'r', 'abc', async () => { n += 1; return ok({}); })).toMatchObject({ totalCount: 0 });
    expect(n).toBe(0);
  });
});
