/**
 * Wiring: adaptive newest-threads path is assembled into host + pure global exports.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('review threads warm probe wiring', () => {
  test('host embeds adaptive fetch helper and open/refresh call sites', () => {
    const host = fs.readFileSync(
      path.join(root, 'src/pr-modal-host.js'),
      'utf8'
    );
    expect(host).toContain('fetchNewestReviewThreadsAdaptive');
    expect(host).toContain('warm-probe-exit');
    expect(host).toContain('warm-escalated');
    // open + refresh both use adaptive path
    expect(host).toMatch(/openModal threads\.newest adaptive/);
    expect(host).toMatch(/onRefresh threads\.newest adaptive/);
  });

  test('manifest loads review-threads pure in content scripts', () => {
    const man = JSON.parse(
      fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')
    );
    const scripts = man.content_scripts?.[0]?.js || [];
    expect(scripts).toContain('src/modal/pure/review-threads.js');
    // Before host so PRModalReviewThreads is available
    const pureIdx = scripts.indexOf('src/modal/pure/review-threads.js');
    const hostIdx = scripts.indexOf('src/pr-modal-host.js');
    expect(pureIdx).toBeGreaterThanOrEqual(0);
    expect(hostIdx).toBeGreaterThan(pureIdx);
  });

  test('pure review-threads exposes warm probe API', () => {
    const pure = fs.readFileSync(
      path.join(root, 'src/modal/pure/review-threads.js'),
      'utf8'
    );
    for (const name of [
      'hasUsableReviewThreadsCache',
      'pickNewestThreadsPageSize',
      'newestThreadsPageMatchesCache',
      'shouldEscalateNewestThreadsProbe',
      'REVIEW_THREADS_WARM_PROBE_SIZE',
      'REVIEW_THREADS_API_MAX',
    ]) {
      expect(pure).toContain(name);
    }
  });
});

describe('adaptive decision simulation', () => {
  test('warm match → no escalate; mismatch → escalate', async () => {
    const RT = await import('../src/modal/lib/review-threads');
    const threads = Array.from({ length: 12 }, (_, i) => ({
      threadNodeId: `PRRT_${i}`,
      resolved: false,
      commentIds: [i + 1],
    }));
    const detail = {
      reviewThreads: threads,
      reviewComments: threads.map((t, i) => ({
        id: i + 1,
        threadNodeId: t.threadNodeId,
        body: 'x',
        resolved: false,
      })),
      reviewThreadsMeta: {
        totalCount: 12,
        newestThreadIds: threads.map((t) => t.threadNodeId),
        loadedThreadCount: 12,
      },
    };

    const pageSize = RT.pickNewestThreadsPageSize({ warmCache: true });
    expect(pageSize).toBe(RT.REVIEW_THREADS_WARM_PROBE_SIZE);

    const matchPage = {
      threads: threads.slice(0, pageSize),
      comments: threads.slice(0, pageSize).map((t, i) => ({
        id: i + 1,
        threadNodeId: t.threadNodeId,
        body: 'x',
      })),
      totalCount: 12,
    };
    expect(RT.shouldEscalateNewestThreadsProbe(matchPage, detail, pageSize)).toBe(
      false
    );

    const mismatchPage = {
      ...matchPage,
      totalCount: 13,
    };
    expect(
      RT.shouldEscalateNewestThreadsProbe(mismatchPage, detail, pageSize)
    ).toBe(true);
  });
});
