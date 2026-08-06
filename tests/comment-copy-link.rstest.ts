/**
 * Comment body + share-link pure helpers (uri-route).
 * Drives shipped buildPositionFromComment / buildCommentShareUrl / parse round-trip.
 */
import { describe, expect, test } from '@rstest/core';
import {
  buildPositionFromComment,
  parsePosition,
  commentBodyForCopy,
  buildCommentShareUrl,
  isShareableCommentId,
  resolveConversationAnchorForCommentId,
  mergePathTargetWithUriRoute,
  findCommentIndexByPosition,
  parseLocationRoute,
  URI_PARAM_POSITION,
  URI_PARAM_PAGE,
} from '../src/modal/lib/uri-route';
import { copyTextToClipboard } from '../src/modal/lib/copy-to-clipboard';
import { resolveRootReviewCommentId } from '../src/modal/lib/review-threads';

describe('commentBodyForCopy', () => {
  test('returns plain body string', () => {
    expect(commentBodyForCopy('hello **world**')).toBe('hello **world**');
    expect(commentBodyForCopy(null)).toBe('');
    expect(commentBodyForCopy(undefined)).toBe('');
  });
});

describe('buildPositionFromComment + parsePosition round-trip', () => {
  test('numeric comment id → c:{id} → same id', () => {
    const pos = buildPositionFromComment({ id: 4242 });
    expect(pos).toBe('c:4242');
    const parsed = parsePosition(pos);
    expect(parsed).toEqual({ kind: 'comment', id: '4242' });
  });

  test('commentId field preferred', () => {
    const pos = buildPositionFromComment({ commentId: 99, id: 1 });
    expect(pos).toBe('c:99');
    expect(parsePosition(pos)?.id).toBe('99');
  });

  test('tmp / optimistic ids are not shareable', () => {
    expect(buildPositionFromComment({ id: 'tmp-1' })).toBe(null);
    expect(buildPositionFromComment({ id: 'optimistic-abc' })).toBe(null);
    expect(isShareableCommentId('tmp-x')).toBe(false);
    expect(isShareableCommentId(12345)).toBe(true);
  });

  test('bare id via buildPositionFromComment(string object id)', () => {
    const pos = buildPositionFromComment(777);
    expect(pos).toBe('c:777');
    expect(parsePosition(pos)?.id).toBe('777');
  });
});

describe('buildCommentShareUrl', () => {
  test('stamps prp_page + prp_position on PR htmlUrl', () => {
    const url = buildCommentShareUrl({
      prHtmlUrl: 'https://github.com/enif-lee/pr-plus/pull/7',
      page: 'conversation',
      comment: { id: 4242 },
    });
    expect(url).toBeTruthy();
    const u = new URL(String(url));
    expect(u.pathname).toMatch(/\/pull\/7$/);
    expect(u.searchParams.get(URI_PARAM_POSITION)).toBe('c:4242');
    expect(u.searchParams.get(URI_PARAM_PAGE)).toBe('conversation');
    const again = parsePosition(u.searchParams.get(URI_PARAM_POSITION));
    expect(again?.id).toBe('4242');
  });

  test('diff page stamp', () => {
    const url = buildCommentShareUrl({
      prHtmlUrl: 'https://github.com/o/r/pull/3',
      page: 'diff',
      position: 'c:12',
    });
    expect(url).toBeTruthy();
    const u = new URL(String(url));
    expect(u.searchParams.get(URI_PARAM_PAGE)).toBe('diff');
    expect(u.searchParams.get(URI_PARAM_POSITION)).toBe('c:12');
  });

  test('null without base or shareable id', () => {
    expect(
      buildCommentShareUrl({ prHtmlUrl: null, comment: { id: 1 } })
    ).toBe(null);
    expect(
      buildCommentShareUrl({
        prHtmlUrl: 'https://github.com/o/r/pull/1',
        comment: { id: 'tmp-1' },
      })
    ).toBe(null);
  });
});

describe('findCommentIndexByPosition + conversation anchor', () => {
  test('finds mapped comment by position', () => {
    const mapped = [
      { commentId: 10 },
      { id: 20 },
      { commentId: 4242 },
    ];
    expect(findCommentIndexByPosition(mapped, 'c:4242')).toBe(2);
    expect(findCommentIndexByPosition(mapped, 'c:999')).toBe(-1);
  });

  test('resolveConversationAnchorForCommentId prefers issue comments', () => {
    const detail = {
      comments: [{ id: 5, body: 'hi' }],
      reviewThreads: [{ root: { id: 9 }, replies: [{ id: 11 }] }],
    };
    expect(resolveConversationAnchorForCommentId(detail, 5)).toBe(
      'issue-comment:5'
    );
    expect(resolveConversationAnchorForCommentId(detail, 11)).toBe(
      'review-comment:11'
    );
  });

  test('resolveConversationAnchorForCommentId returns null until comment exists', () => {
    expect(
      resolveConversationAnchorForCommentId({ comments: [] }, 4242)
    ).toBe(null);
    expect(
      resolveConversationAnchorForCommentId(
        { comments: [{ id: 1 }], reviewThreads: [] },
        4242
      )
    ).toBe(null);
  });
});

/**
 * Host openModal wiring: PR-page location.search prp_position must become
 * the position field passed into open (same merge pure host uses).
 */
describe('host open path: location prp_position → openModal args', () => {
  test('mergePathTargetWithUriRoute stamps c:{id} from search', () => {
    const pathTarget = {
      owner: 'enif-lee',
      repo: 'pr-plus',
      number: 7,
      page: 'conversation' as const,
    };
    const share = buildCommentShareUrl({
      prHtmlUrl: 'https://github.com/enif-lee/pr-plus/pull/7',
      page: 'diff',
      comment: { id: 4242 },
    });
    expect(share).toBeTruthy();
    const u = new URL(String(share));
    const merged = mergePathTargetWithUriRoute(pathTarget, {
      search: u.search,
      hash: u.hash,
    });
    expect(merged).not.toBe(null);
    expect(merged!.owner).toBe('enif-lee');
    expect(merged!.number).toBe(7);
    expect(merged!.page).toBe('diff');
    expect(merged!.position).toBe('c:4242');
    expect(parsePosition(merged!.position)?.id).toBe('4242');
  });

  test('parseLocationRoute alone recovers position (openModal input contract)', () => {
    const route = parseLocationRoute({
      search: '?prp_page=conversation&prp_position=c:99',
      hash: '',
    });
    expect(route.page).toBe('conversation');
    expect(route.position).toBe('c:99');
    // Simulated openModal args from tryEmbedFromLocation / openEmbedFromNativePr
    const openArgs = {
      owner: 'o',
      repo: 'r',
      number: 1,
      page: route.page,
      position: route.position,
      presentation: 'embed',
    };
    expect(openArgs.position).toBe('c:99');
    expect(openArgs.page).toBe('conversation');
  });

  test('path page kept when URI omits prp_page', () => {
    const merged = mergePathTargetWithUriRoute(
      {
        owner: 'o',
        repo: 'r',
        number: 3,
        page: 'conversation',
      },
      { search: '?prp_position=c:7', hash: '' }
    );
    expect(merged!.page).toBe('conversation');
    expect(merged!.position).toBe('c:7');
  });

  /**
   * Diff restore path: mappedComments is roots-only. Reply share links use
   * c:{replyId}; resolveRootReviewCommentId then findCommentIndexByPosition
   * must land on the root row index (same path as PrModalApp Diff restore).
   */
  test('reply c:{id} → root → Diff mappedComments index', () => {
    const allComments = [
      { id: 100, body: 'root comment', path: 'a.ts' },
      { id: 101, body: 'first reply', in_reply_to_id: 100, path: 'a.ts' },
      { id: 102, body: 'nested reply', inReplyToId: 101, path: 'a.ts' },
      { id: 200, body: 'other root', path: 'b.ts' },
    ];
    // Diff navigator roots (mapCommentsToRowIndices input shape)
    const mappedRoots = [
      { id: 100, commentId: 100, rowIndex: 10 },
      { id: 200, commentId: 200, rowIndex: 40 },
    ];

    // InlineThread copy-link for a reply
    const sharePos = buildPositionFromComment({ id: 102 });
    expect(sharePos).toBe('c:102');
    expect(parsePosition(sharePos)?.id).toBe('102');

    // Without root resolve: no match (roots only)
    expect(findCommentIndexByPosition(mappedRoots, sharePos)).toBe(-1);

    // Shipped Diff restore: reply → root id → index
    const rootId = resolveRootReviewCommentId(allComments, 102);
    expect(rootId).toBe(100);
    const rootPos = `c:${rootId}`;
    const idx = findCommentIndexByPosition(mappedRoots, rootPos);
    expect(idx).toBe(0);
    expect(mappedRoots[idx].id).toBe(100);

    // Direct reply to root
    const rootFromReply = resolveRootReviewCommentId(allComments, 101);
    expect(rootFromReply).toBe(100);
    expect(findCommentIndexByPosition(mappedRoots, `c:${rootFromReply}`)).toBe(
      0
    );

    // Root id still resolves to itself
    expect(resolveRootReviewCommentId(allComments, 100)).toBe(100);
    expect(findCommentIndexByPosition(mappedRoots, 'c:100')).toBe(0);
  });

  test('host source wires position into openModal (static)', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..');
    const embed = fs.readFileSync(
      path.join(root, 'src/host/modules/restore-embed-list-focus.ts'),
      'utf8'
    );
    const native = fs.readFileSync(
      path.join(root, 'src/host/modules/host-core-timeline-b.ts'),
      'utf8'
    );
    const coreA = fs.readFileSync(
      path.join(root, 'src/host/modules/host-core-timeline-a.ts'),
      'utf8'
    );
    // tryEmbedFromLocation openModal must pass position from target
    expect(embed).toMatch(/position:\s*target\.position/);
    // openEmbedFromNativePr must pass position
    expect(native).toMatch(/position:\s*t\.position/);
    // merge helper used for location deep-links
    expect(coreA).toMatch(/mergePathTargetWithUriRoute|withUriRouteFromLocation/);
    expect(coreA).toMatch(/routePosition/);
  });
});

describe('copyTextToClipboard path (injected clipboard)', () => {
  test('copies comment body text through shipped helper', async () => {
    const written: string[] = [];
    const body = commentBodyForCopy('reply body line');
    const ok = await copyTextToClipboard(body, {
      clipboard: {
        writeText: async (t: string) => {
          written.push(t);
        },
      },
      doc: null,
    });
    expect(ok).toBe(true);
    expect(written).toEqual(['reply body line']);
  });

  test('copies share url text through shipped helper', async () => {
    const written: string[] = [];
    const url = buildCommentShareUrl({
      prHtmlUrl: 'https://github.com/o/r/pull/2',
      page: 'diff',
      comment: { id: 88 },
    });
    expect(url).toMatch(/prp_position=c(%3A|:)88/);
    const ok = await copyTextToClipboard(String(url), {
      clipboard: {
        writeText: async (t: string) => {
          written.push(t);
        },
      },
      doc: null,
    });
    expect(ok).toBe(true);
    expect(written[0]).toBe(url);
    expect(
      parsePosition(new URL(written[0]).searchParams.get('prp_position'))?.id
    ).toBe('88');
  });
});
