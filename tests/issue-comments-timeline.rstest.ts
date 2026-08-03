import { describe, expect, test } from '@rstest/core';
import { buildConversationTimeline } from '../src/modal/lib/conversation-timeline-build';
import { buildConversationVirtualRows } from '../src/modal/lib/conversation-virtual';
import {
  filterTimelineItemsByVisibility,
  DEFAULT_TIMELINE_VISIBILITY,
} from '../src/modal/lib/conversation-timeline-filter';
import {
  fromAppDetail,
  mergeProgressiveSidesIntoFlat,
  toAppDetail,
} from '../src/modal/lib/detail-store';

/** Real issue-comment ids from rtzr/callabo-server#2424 (enif-lee). */
const ENIF_ISSUE_COMMENTS = [
  {
    id: 4977062224,
    author: 'enif-lee',
    body: '## App Store 구독 결제 흐름\n\n```mermaid\nsequenceDiagram\n  A->>B: x\n```\n',
    createdAt: '2026-07-15T05:08:41Z',
  },
  {
    id: 4988329723,
    author: 'enif-lee',
    body: '운영 반영 필요 사항입니다.',
    createdAt: '2026-07-16T04:55:33Z',
  },
  {
    id: 5163992248,
    author: 'enif-lee',
    body: '### 운영 배포 작업',
    createdAt: '2026-08-03T08:23:00Z',
  },
];

describe('issue comments on long conversation PR', () => {
  test('enif-style issue comments appear in timeline and virtual rows', () => {
    const detail = {
      viewerLogin: 'enif-lee',
      comments: ENIF_ISSUE_COMMENTS,
      reviews: [],
      reviewComments: [],
      reviewThreads: [],
      timelineEvents: [],
    };
    const items = buildConversationTimeline(detail);
    const issue = items.filter((i) => i.kind === 'issue-comment');
    expect(issue.map((i) => i.id).sort()).toEqual(
      ENIF_ISSUE_COMMENTS.map((c) => c.id).sort()
    );
    const filtered = filterTimelineItemsByVisibility(
      items,
      DEFAULT_TIMELINE_VISIBILITY
    );
    expect(filtered.filter((i) => i.kind === 'issue-comment')).toHaveLength(3);

    const paged = {
      items: filtered,
      bottomItems: [],
      showThreadGap: false,
      hiddenCount: 0,
    };
    const rows = buildConversationVirtualRows(paged, {
      reverseComments: true,
      canLoadMore: true,
    });
    const issueRows = rows.filter(
      (r) => r.type === 'item' && r.item?.kind === 'issue-comment'
    );
    expect(issueRows).toHaveLength(3);
  });

  test('mergeProgressiveSidesIntoFlat keeps issue comments across IDB/sketch reset', () => {
    const live = {
      owner: 'rtzr',
      repo: 'callabo-server',
      number: 2424,
      title: 'live',
      comments: ENIF_ISSUE_COMMENTS,
      commentsMeta: { loadedCount: 3, hasMore: false },
      timelineEvents: [{ id: 'e1', event: 'labeled' }],
      reviews: [{ id: 1, author: 'bot', state: 'COMMENTED' }],
      _sideSettled: { comments: true, reviews: true },
    };
    // IDB/sketch snapshot without progressive sides (or emptier)
    const idb = {
      owner: 'rtzr',
      repo: 'callabo-server',
      number: 2424,
      title: 'from-idb',
      comments: [],
      reviews: [],
      _sketch: false,
      _cacheFull: true,
      _sideSettled: { comments: false, reviews: false },
    };
    const merged = mergeProgressiveSidesIntoFlat(live, idb);
    expect(merged.title).toBe('from-idb');
    expect(merged.comments).toHaveLength(3);
    expect(merged.comments.map((c: any) => c.id).sort()).toEqual(
      ENIF_ISSUE_COMMENTS.map((c) => c.id).sort()
    );
    expect(merged.reviews).toHaveLength(1);
    expect(merged._sideSettled.comments).toBe(true);

    // Round-trip through store projection (host resetDetailStoreFromFlat path)
    const store = fromAppDetail(merged);
    const flat = toAppDetail(store);
    expect(flat?.comments?.length).toBe(3);
    const items = buildConversationTimeline(flat);
    expect(items.filter((i) => i.kind === 'issue-comment')).toHaveLength(3);
  });

  test('mergeProgressiveSidesIntoFlat does not prefer shorter prev lists', () => {
    const live = { comments: [{ id: 1 }], reviews: [] };
    const next = {
      comments: [
        { id: 1 },
        { id: 2 },
        { id: 3 },
      ],
      reviews: [{ id: 9 }],
    };
    const merged = mergeProgressiveSidesIntoFlat(live, next);
    expect(merged.comments).toHaveLength(3);
    expect(merged.reviews).toHaveLength(1);
  });

  /**
   * Regression: issue-comment page enrichment called fetchReactableReactionGroups
   * without importing it → ReferenceError → soft-empty page → timeline omitted
   * every issue comment (callabo-server#2424).
   */
  test('fetch issue-comments path imports reaction enrichment', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    const sides = fs.readFileSync(
      path.join(root, 'src/fetch/detail-sides-comments.ts'),
      'utf8'
    );
    expect(sides).toMatch(
      /import\s*\{\s*fetchReactableReactionGroups\s*\}\s*from\s*['"]\.\/reactions['"]/
    );
    expect(sides).toMatch(/fetchReactableReactionGroups\s*\(/);
    const bundled = fs.readFileSync(
      path.join(root, 'src/fetch-pulls.js'),
      'utf8'
    );
    // Bundled classic script must define the function (not a free global).
    expect(bundled).toMatch(
      /async function fetchReactableReactionGroups\s*\(/
    );
    // Call site inside comments page enrichment must resolve to that binding.
    const defIdx = bundled.indexOf(
      'async function fetchReactableReactionGroups'
    );
    const callIdx = bundled.indexOf(
      'const byId = await fetchReactableReactionGroups'
    );
    expect(defIdx).toBeGreaterThanOrEqual(0);
    expect(callIdx).toBeGreaterThan(defIdx);
  });
});