/**
 * Review threads window contract:
 * - first open / cold shell is incomplete when hasMore
 * - load-more advances one page (meta merge)
 * - Diff full-load drains via threads-all (product wiring + pure meta)
 */
import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isReviewThreadsLoadIncomplete,
  singleCursorReviewThreadsMeta,
  conversationLoadMoreState,
} from '../src/modal/lib/conversation-timeline.ts';

const root = resolve(__dirname, '..');

describe('first window incomplete + load-more (shipped pure)', () => {
  test('newest first page with hasPreviousPage is incomplete', () => {
    const meta = singleCursorReviewThreadsMeta({
      threads: Array.from({ length: 100 }, (_, i) => ({
        threadNodeId: `PRRT_${i}`,
      })),
      totalCount: 250,
      hasPreviousPage: true,
      hasNextPage: false,
      startCursor: 'cursor-start',
      endCursor: 'cursor-end',
      direction: 'newest',
      source: 'graphql',
    });
    expect(meta.hasMore || meta.hasOlder).toBe(true);
    expect(isReviewThreadsLoadIncomplete(meta)).toBe(true);
    // First window must not claim complete corpus (still has older)
    expect(meta.hasMore).toBe(true);
    expect(meta.loadedThreadCount).toBe(100);
    expect(meta.totalCount).toBe(250);
  });

  test('complete window: hasMore false', () => {
    const meta = singleCursorReviewThreadsMeta({
      threads: [{ threadNodeId: 'PRRT_1' }],
      totalCount: 1,
      hasPreviousPage: false,
      hasNextPage: false,
      direction: 'newest',
      source: 'graphql',
    });
    expect(isReviewThreadsLoadIncomplete(meta)).toBe(false);
    expect(meta.hasMore).toBe(false);
  });

  test('conversationLoadMoreState flags threads incomplete for load-more UI', () => {
    const st = conversationLoadMoreState(
      {
        hasMore: true,
        hasOlder: true,
        loadedThreadCount: 100,
        totalCount: 250,
        hiddenCount: 150,
      },
      { hasMore: false, complete: true }
    );
    expect(st.threadsIncomplete).toBe(true);
    expect(st.anyIncomplete).toBe(true);
    expect(st.hiddenCount).toBeGreaterThan(0);
  });
});

describe('product wiring: open first-window only; Diff drains threads-all', () => {
  test('open-modal cold open does not drain for conversation (diff-only full load)', () => {
    const open = readFileSync(
      resolve(root, 'src/host/modules/open-modal-run.ts'),
      'utf8'
    );
    // First window only on cold open
    expect(open).toMatch(/single-direction newest shell only/);
    expect(open).toMatch(/skipped dual-seed/);
    // Full drain gated on Diff entry page only
    expect(open).toMatch(/resolvedPage === ['"]diff['"]/);
    expect(open).toMatch(/onLoadMoreReviewThreads\(['"]threads-all['"]\)/);
    // Legacy fastReview pref removed — no !fastReview auto-drain
    expect(open).not.toMatch(/\bfastReview\b/);
  });

  test('PrModalApp Diff enter drains remaining threads (threads-all)', () => {
    const app = readFileSync(
      resolve(root, 'src/modal/app/PrModalShell.tsx'),
      'utf8'
    );
    expect(app).toMatch(/Diff enter/);
    expect(app).toMatch(/onLoadMoreReviewThreads\(['"]threads-all['"]\)/);
    expect(app).toMatch(/layoutMode !== LAYOUT_DIFF/);
  });

  test('props-build full-threads mode drains threads-all', () => {
    const src = readFileSync(
      resolve(root, 'src/host/modules/props-build.ts'),
      'utf8'
    );
    expect(src).toMatch(/mode === ['"]full-threads['"]/);
    expect(src).toMatch(/onLoadMoreReviewThreads\(['"]threads-all['"]\)/);
  });

  test('warm reopen path still uses adaptive / revalidate (not force-full every open)', () => {
    const open = readFileSync(
      resolve(root, 'src/host/modules/open-modal-run.ts'),
      'utf8'
    );
    expect(open).toMatch(/fetchNewestReviewThreadsAdaptive/);
    expect(open).toMatch(/useRevalidatePath/);
    expect(open).toMatch(/useWarmThreads/);
    // Cold adaptive must not forceFull
    expect(open).toMatch(/forceFull:\s*false/);
  });
});
