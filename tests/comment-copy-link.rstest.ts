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
  parseGithubCommentHash,
  githubCommentHashFragment,
  isShareableCommentId,
  resolveConversationAnchorForCommentId,
  optimisticConversationAnchorForKind,
  mergePathTargetWithUriRoute,
  findCommentIndexByPosition,
  parseLocationRoute,
  URI_PARAM_POSITION,
  URI_PARAM_PAGE,
} from '../src/modal/lib/uri-route';
import {
  buildGithubPrHref,
  commentPositionToGithubHash,
  preserveGithubCommentHash,
} from '../src/modal/lib/github-pr-route';
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

describe('buildCommentShareUrl (GitHub official hash)', () => {
  test('issue comment → #issuecomment-{id}', () => {
    const url = buildCommentShareUrl({
      prHtmlUrl: 'https://github.com/enif-lee/pr-plus/pull/8',
      page: 'conversation',
      kind: 'issue',
      comment: { id: 5139498092 },
    });
    expect(url).toBe(
      'https://github.com/enif-lee/pr-plus/pull/8#issuecomment-5139498092'
    );
    const u = new URL(String(url));
    expect(u.search).toBe('');
    expect(u.hash).toBe('#issuecomment-5139498092');
    const gh = parseGithubCommentHash(u.hash);
    expect(gh?.id).toBe('5139498092');
    expect(gh?.kind).toBe('issue');
    expect(gh?.page).toBe('conversation');
    expect(parsePosition(u.hash)?.id).toBe('5139498092');
  });

  test('review / line comment → #discussion_r{id}', () => {
    const url = buildCommentShareUrl({
      prHtmlUrl: 'https://github.com/o/r/pull/3',
      page: 'diff',
      kind: 'review',
      position: 'c:12',
    });
    expect(url).toBe('https://github.com/o/r/pull/3#discussion_r12');
    expect(githubCommentHashFragment('review', 12)).toBe('discussion_r12');
  });

  test('page=diff defaults to discussion_r without kind', () => {
    const url = buildCommentShareUrl({
      prHtmlUrl: 'https://github.com/o/r/pull/3',
      page: 'diff',
      comment: { id: 99 },
    });
    expect(url).toBe('https://github.com/o/r/pull/3#discussion_r99');
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

  test('strips legacy prp_* query from base when sharing', () => {
    const url = buildCommentShareUrl({
      prHtmlUrl:
        'https://github.com/o/r/pull/1?prp_page=conversation&prp_position=c:1&other=1',
      kind: 'issue',
      comment: { id: 5 },
    });
    const u = new URL(String(url));
    expect(u.searchParams.get(URI_PARAM_PAGE)).toBe(null);
    expect(u.searchParams.get(URI_PARAM_POSITION)).toBe(null);
    expect(u.searchParams.get('other')).toBe('1');
    expect(u.hash).toBe('#issuecomment-5');
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

  test('resolveConversationAnchorForCommentId maps pullrequestreview id', () => {
    expect(
      resolveConversationAnchorForCommentId(
        { comments: [], reviews: [{ id: 777, state: 'APPROVED' }] },
        777
      )
    ).toBe('review:777');
  });

  test('optimisticConversationAnchorForKind matches GH hash kinds', () => {
    expect(optimisticConversationAnchorForKind(12, 'issue')).toBe(
      'issue-comment:12'
    );
    expect(optimisticConversationAnchorForKind(12, 'review')).toBe(
      'review-comment:12'
    );
    expect(
      optimisticConversationAnchorForKind(12, 'pull_request_review')
    ).toBe('review:12');
    expect(optimisticConversationAnchorForKind(null, 'issue')).toBe(null);
  });
});

describe('deep-link restore wiring (static)', () => {
  test('App deep-link uses jumpToReviewComment + soft exhaust (not false promote)', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..');
    const app = fs.readFileSync(
      path.join(root, 'src/modal/app/PrModalApp.impl.tsx'),
      'utf8'
    );
    const vcl = fs.readFileSync(
      path.join(root, 'src/modal/views/conversation/VirtualConversationList.tsx'),
      'utf8'
    );
    expect(app).toMatch(/jumpToReviewComment\(/);
    expect(app).toMatch(/markSoftExhausted/);
    expect(app).toMatch(/kickLoadMoreIfNeeded/);
    expect(app).toMatch(/optimisticConversationAnchorForKind/);
    // Must not promote pending without a mounted node
    expect(vcl).toMatch(/Never promote without a mounted node/);
    expect(vcl).toMatch(/nodeInView/);
  });
});

/**
 * Host openModal wiring: GitHub #issuecomment- / #discussion_r / legacy prp_*
 * must become the position field passed into open.
 */
describe('host open path: location comment hash → openModal args', () => {
  test('mergePathTargetWithUriRoute stamps c:{id} from #discussion_r', () => {
    const pathTarget = {
      owner: 'enif-lee',
      repo: 'pr-plus',
      number: 7,
      page: 'conversation' as const,
    };
    const share = buildCommentShareUrl({
      prHtmlUrl: 'https://github.com/enif-lee/pr-plus/pull/7',
      page: 'diff',
      kind: 'review',
      comment: { id: 4242 },
    });
    expect(share).toBe(
      'https://github.com/enif-lee/pr-plus/pull/7#discussion_r4242'
    );
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

  test('parseLocationRoute recovers #issuecomment-{id}', () => {
    const route = parseLocationRoute({
      search: '',
      hash: '#issuecomment-5139498092',
    });
    expect(route.page).toBe('conversation');
    expect(route.position).toBe('c:5139498092');
    const openArgs = {
      owner: 'o',
      repo: 'r',
      number: 8,
      page: route.page,
      position: route.position,
      presentation: 'embed',
    };
    expect(openArgs.position).toBe('c:5139498092');
    expect(openArgs.page).toBe('conversation');
  });

  test('write URI keeps #issuecomment- / #discussion_r (open must not strip)', () => {
    const {
      clearRouteFromHash,
      buildUrlWithRoute,
    } = require('../src/modal/lib/uri-route') as typeof import('../src/modal/lib/uri-route');
    const {
      buildGithubPrHref,
      preserveGithubCommentHash,
    } = require('../src/modal/lib/github-pr-route') as typeof import('../src/modal/lib/github-pr-route');

    expect(clearRouteFromHash('#issuecomment-5139498092')).toBe(
      '#issuecomment-5139498092'
    );
    expect(clearRouteFromHash('#discussion_r99')).toBe('#discussion_r99');
    expect(clearRouteFromHash('#pullrequestreview-7')).toBe(
      '#pullrequestreview-7'
    );
    // Legacy bare c: tokens still stripped
    expect(clearRouteFromHash('#c:12')).toBe('');

    const withRoute = buildUrlWithRoute(
      {
        pathname: '/enif-lee/pr-plus/pull/7',
        search: '',
        hash: '#issuecomment-111',
      },
      { page: 'conversation', number: 7, position: 'c:111' }
    );
    expect(withRoute).toContain('#issuecomment-111');

    expect(preserveGithubCommentHash('#discussion_r42')).toBe(
      '#discussion_r42'
    );
    const embedHref = buildGithubPrHref(
      {
        owner: 'enif-lee',
        repo: 'pr-plus',
        number: 7,
        page: 'conversation',
      },
      '',
      '#issuecomment-5139498092'
    );
    expect(embedHref).toBe(
      '/enif-lee/pr-plus/pull/7#issuecomment-5139498092'
    );
  });

  test('legacy prp_position still parses', () => {
    const route = parseLocationRoute({
      search: '?prp_page=conversation&prp_position=c:99',
      hash: '',
    });
    expect(route.page).toBe('conversation');
    expect(route.position).toBe('c:99');
  });

  test('path page kept when URI omits page (legacy prp_position only)', () => {
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

  test('goal URL #issuecomment-4743059284 → position c:4743059284 (shipped parse)', () => {
    const gh = parseGithubCommentHash(
      '#issuecomment-4743059284'
    );
    expect(gh).toEqual({
      kind: 'issue',
      id: '4743059284',
      position: 'c:4743059284',
      page: 'conversation',
    });
    expect(parsePosition('#issuecomment-4743059284')?.id).toBe('4743059284');
    const merged = mergePathTargetWithUriRoute(
      { owner: 'enif-lee', repo: 'pr-plus', number: 7 },
      { search: '', hash: '#issuecomment-4743059284' }
    );
    expect(merged?.position).toBe('c:4743059284');
    expect(merged?.page).toBe('conversation');
  });

  test('embed rewrite re-emits #issuecomment- from position (not strip)', () => {
    expect(commentPositionToGithubHash('c:4743059284', 'conversation')).toBe(
      '#issuecomment-4743059284'
    );
    expect(commentPositionToGithubHash('4743059284', 'diff')).toBe(
      '#discussion_r4743059284'
    );
    expect(preserveGithubCommentHash('#issuecomment-4743059284')).toBe(
      '#issuecomment-4743059284'
    );
    const href = buildGithubPrHref(
      {
        owner: 'enif-lee',
        repo: 'pr-plus',
        number: 7,
        page: 'conversation',
        position: 'c:4743059284',
      },
      '',
      '' // existing hash already gone — position must re-create it
    );
    expect(href).toBe(
      '/enif-lee/pr-plus/pull/7#issuecomment-4743059284'
    );
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
    expect(url).toBe('https://github.com/o/r/pull/2#discussion_r88');
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
    expect(parsePosition(new URL(written[0]).hash)?.id).toBe('88');
  });
});
