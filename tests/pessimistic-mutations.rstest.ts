/**
 * Criterion-1 mutations: API-first paint (pessimistic).
 * Drives real installPrModalMutations with a deps bag + mocked PRTreeFetch.
 */
import { describe, expect, test, beforeEach, afterEach } from '@rstest/core';
import { installPrModalMutations } from '../src/modal/commands/domain-mutations';
import {
  removeIssueCommentFromDetail,
  removeReviewCommentFromDetail,
  stripPendingReviewFromDetail,
} from '../src/modal/lib/composer-attach';
import { discardPendingReview } from '../src/modal/lib/pending-review';

type Detail = Record<string, any>;

function makeBag(initial: Detail) {
  let local: Detail | null = { ...initial };
  const hostPatches: Record<string, unknown>[] = [];
  const paints: Detail[] = [];
  const detailRef = { current: local as Detail | null };

  const applyDomainDetail = (updater: any) => {
    if (typeof updater === 'function') {
      local = updater(local);
    } else {
      local = updater;
    }
    detailRef.current = local;
    bag.detail = local;
    if (local) paints.push(JSON.parse(JSON.stringify(local)));
  };

  const bag: Record<string, any> = {
    detail: initial,
    detailRef,
    applyDomainDetail,
    setActionBusy: () => {},
    setActionMsg: () => {},
    setEditingBody: () => {},
    setEditingComment: () => {},
    // Host ack shape required (void ≠ applied).
    onPatchDetail: (patch: Record<string, unknown>) => {
      hostPatches.push({ ...patch });
      if (local && patch && typeof patch === 'object') {
        local = { ...local, ...patch };
        detailRef.current = local;
        bag.detail = local;
        paints.push(JSON.parse(JSON.stringify(local)));
      }
      return { status: 'applied' as const };
    },
    onRefresh: async () => {},
    requestConfirm: async () => true,
    requestClose: () => {},
    removeIssueCommentFromDetail,
    removeReviewCommentFromDetail,
    setPicker: () => {},
    closePicker: () => {},
    openPulls: [],
    setReplyDrafts: () => {},
    setPendingReview: () => {},

    pendingReviewNodeIdRef: { current: null as string | null },
    serverPendingReviewId: null,
    discardPendingReview,
    stripPendingReviewFromDetail,
    baseBranchRef: { current: null },
    pickerAnchorRef: { current: null },
    reviewerAddRef: { current: null },
    assigneeAddRef: { current: null },
    labelAddRef: { current: null },
    prIdentity: 'o/r#1',
    pullRequestGqlIdRef: { current: null },
    viewedPaths: new Set(),
    annotatedFiles: [],
    setCollapsedFiles: () => {},
    setViewedPaths: () => {},
  };

  // Keep bag.detail in sync for handlers that read d.detail mid-flight
  const origSet = applyDomainDetail;
  bag.applyDomainDetail = (updater: any) => {
    origSet(updater);
    bag.detail = local;
  };

  const mut = installPrModalMutations(bag);
  return {
    bag,
    mut,
    get local() {
      return local;
    },
    hostPatches,
    paints,
    snapshot: () => JSON.parse(JSON.stringify(local)),
  };
}

const baseDetail = (): Detail => ({
  owner: 'o',
  repo: 'r',
  number: 1,
  title: 'Original title',
  body: 'Original body',
  draft: false,
  state: 'open',
  merged: false,
  comments: [
    { id: 10, body: 'issue comment', user: { login: 'a' } },
    { id: 11, body: 'keep me', user: { login: 'b' } },
  ],
  reviewComments: [
    {
      id: 20,
      body: 'review c',
      threadNodeId: 'PRRT_A',
      resolved: false,
    },
    {
      id: 21,
      body: 'other',
      threadNodeId: 'PRRT_B',
      resolved: false,
    },
  ],
  reviewThreads: [
    { threadNodeId: 'PRRT_A', resolved: false, path: 'a.ts' },
    { threadNodeId: 'PRRT_B', resolved: false, path: 'b.ts' },
  ],
  timelineEvents: [],
  allowMergeCommit: true,
  allowSquashMerge: true,
  allowRebaseMerge: true,
});

describe('pessimistic mutations (installPrModalMutations)', () => {
  let prevApi: any;

  beforeEach(() => {
    prevApi = (globalThis as any).PRTreeFetch;
  });

  afterEach(() => {
    (globalThis as any).PRTreeFetch = prevApi;
  });

  test('onSaveBody: API failure leaves prior body (no pre-paint)', async () => {
    const h = makeBag(baseDetail());
    (globalThis as any).PRTreeFetch = {
      updatePullRequest: async () => {
        throw new Error('network fail');
      },
    };
    const before = h.snapshot();
    await h.mut.onSaveBody('New body that should not stick');
    expect(h.local?.body).toBe(before.body);
    expect(h.hostPatches.some((p) => p.body != null)).toBe(false);
  });

  test('onSaveBody: success paints body + narrow host patch after await', async () => {
    const h = makeBag(baseDetail());
    let resolved = false;
    (globalThis as any).PRTreeFetch = {
      updatePullRequest: async () => {
        // During await, local must still be original
        expect(h.local?.body).toBe('Original body');
        resolved = true;
        return {};
      },
    };
    await h.mut.onSaveBody('Saved body');
    expect(resolved).toBe(true);
    expect(h.local?.body).toBe('Saved body');
    expect(h.hostPatches.some((p) => p.body === 'Saved body')).toBe(true);
  });

  test('onEditTitle: failure preserves prior title', async () => {
    const h = makeBag(baseDetail());
    (globalThis as any).PRTreeFetch = {
      updatePullRequest: async () => {
        throw new Error('title fail');
      },
    };
    await h.mut.onEditTitle('Nope');
    expect(h.local?.title).toBe('Original title');
    expect(h.hostPatches.some((p) => p.title != null)).toBe(false);
  });

  test('onEditTitle: success patches title after API', async () => {
    const h = makeBag(baseDetail());
    (globalThis as any).PRTreeFetch = {
      updatePullRequest: async () => {
        expect(h.local?.title).toBe('Original title');
        return {};
      },
    };
    await h.mut.onEditTitle('Renamed');
    expect(h.local?.title).toBe('Renamed');
    expect(h.hostPatches.some((p) => p.title === 'Renamed')).toBe(true);
  });

  test('onSetDraftStage: failure preserves draft flag', async () => {
    const h = makeBag({ ...baseDetail(), draft: false });
    (globalThis as any).PRTreeFetch = {
      setPullRequestDraftStage: async () => {
        throw new Error('draft fail');
      },
    };
    await h.mut.onSetDraftStage('draft');
    expect(h.local?.draft).toBe(false);
    expect(h.hostPatches.some((p) => Object.prototype.hasOwnProperty.call(p, 'draft'))).toBe(
      false
    );
  });

  test('onSetDraftStage: success paints draft after API', async () => {
    const h = makeBag({ ...baseDetail(), draft: false });
    (globalThis as any).PRTreeFetch = {
      setPullRequestDraftStage: async () => {
        expect(h.local?.draft).toBe(false);
        return { draft: true };
      },
    };
    await h.mut.onSetDraftStage('draft');
    expect(h.local?.draft).toBe(true);
    expect(h.hostPatches.some((p) => p.draft === true)).toBe(true);
  });

  test('onResolveThread: failure does not stamp resolved', async () => {
    const h = makeBag(baseDetail());
    (globalThis as any).PRTreeFetch = {
      resolveReviewThread: async () => {
        throw new Error('resolve fail');
      },
    };
    await h.mut.onResolveThread('PRRT_A', true);
    const thread = h.local?.reviewThreads?.find((t: any) => t.threadNodeId === 'PRRT_A');
    expect(thread?.resolved).toBe(false);
    expect(
      h.local?.reviewComments
        ?.filter((c: any) => c.threadNodeId === 'PRRT_A')
        .every((c: any) => c.resolved === false)
    ).toBe(true);
  });

  test('onResolveThread: success stamps after API', async () => {
    const h = makeBag(baseDetail());
    (globalThis as any).PRTreeFetch = {
      resolveReviewThread: async () => {
        const t = h.local?.reviewThreads?.find((x: any) => x.threadNodeId === 'PRRT_A');
        expect(t?.resolved).toBe(false);
        return {};
      },
    };
    await h.mut.onResolveThread('PRRT_A', true);
    const thread = h.local?.reviewThreads?.find((t: any) => t.threadNodeId === 'PRRT_A');
    expect(thread?.resolved).toBe(true);
    expect(
      h.hostPatches.some(
        (p) =>
          Array.isArray(p.reviewThreads) &&
          (p.reviewThreads as any[]).some(
            (t) => t.threadNodeId === 'PRRT_A' && t.resolved === true
          )
      )
    ).toBe(true);
  });

  test('onDeleteIssueComment: failure keeps comment list', async () => {
    const h = makeBag(baseDetail());
    (globalThis as any).PRTreeFetch = {
      deleteIssueComment: async () => {
        throw new Error('delete fail');
      },
    };
    await h.mut.onDeleteIssueComment(10);
    expect(h.local?.comments?.map((c: any) => c.id)).toEqual([10, 11]);
  });

  test('onDeleteIssueComment: success strips after API from latest', async () => {
    const h = makeBag(baseDetail());
    (globalThis as any).PRTreeFetch = {
      deleteIssueComment: async () => {
        expect(h.local?.comments?.some((c: any) => c.id === 10)).toBe(true);
        return {};
      },
    };
    await h.mut.onDeleteIssueComment(10);
    expect(h.local?.comments?.map((c: any) => c.id)).toEqual([11]);
    expect(h.hostPatches.some((p) => Array.isArray(p.comments))).toBe(true);
  });

  test('onDeleteReviewComment: failure keeps review comments', async () => {
    const h = makeBag(baseDetail());
    (globalThis as any).PRTreeFetch = {
      deleteReviewComment: async () => {
        throw new Error('delete fail');
      },
    };
    await h.mut.onDeleteReviewComment(20);
    expect(h.local?.reviewComments?.map((c: any) => c.id)).toEqual([20, 21]);
  });

  test('onDeleteReviewComment: success strips after API', async () => {
    const h = makeBag(baseDetail());
    (globalThis as any).PRTreeFetch = {
      deleteReviewComment: async () => {
        expect(h.local?.reviewComments?.some((c: any) => c.id === 20)).toBe(true);
        return {};
      },
    };
    await h.mut.onDeleteReviewComment(20);
    expect(h.local?.reviewComments?.map((c: any) => c.id)).toEqual([21]);
  });

  test('onSaveEditComment: success patches body after API without full refresh', async () => {
    const h = makeBag(baseDetail());
    let refreshed = false;
    h.bag.onRefresh = async () => {
      refreshed = true;
    };
    (globalThis as any).PRTreeFetch = {
      editIssueComment: async () => {
        expect(h.local?.comments?.find((c: any) => c.id === 10)?.body).toBe(
          'issue comment'
        );
        return {};
      },
    };
    await h.mut.onSaveEditComment('issue', 10, 'edited issue');
    expect(h.local?.comments?.find((c: any) => c.id === 10)?.body).toBe('edited issue');
    expect(refreshed).toBe(false);
  });

  test('onMergePr: success applies lifecycle after API; failure leaves open', async () => {
    const h = makeBag(baseDetail());
    (globalThis as any).PRTreeFetch = {
      mergePullRequest: async () => {
        expect(h.local?.merged).toBeFalsy();
        expect(h.local?.state).toBe('open');
        return {};
      },
    };
    await h.mut.onMergePr('merge');
    expect(h.local?.merged).toBe(true);
    expect(h.local?.state).toBe('closed');

    const h2 = makeBag(baseDetail());
    (globalThis as any).PRTreeFetch = {
      mergePullRequest: async () => {
        throw new Error('merge fail');
      },
    };
    await h2.mut.onMergePr('merge');
    expect(h2.local?.merged).toBeFalsy();
    expect(h2.local?.state).toBe('open');
  });

  test('onClosePr: paints closed only after API', async () => {
    const h = makeBag(baseDetail());
    (globalThis as any).PRTreeFetch = {
      closePullRequest: async () => {
        expect(h.local?.state).toBe('open');
        return {};
      },
    };
    await h.mut.onClosePr();
    expect(h.local?.state).toBe('closed');
  });

  test('onReopenPr: paints open only after API', async () => {
    const h = makeBag({ ...baseDetail(), state: 'closed', merged: false });
    (globalThis as any).PRTreeFetch = {
      reopenPullRequest: async () => {
        expect(h.local?.state).toBe('closed');
        return {};
      },
    };
    await h.mut.onReopenPr();
    expect(h.local?.state).toBe('open');
  });

  test('onDiscardPendingReview: DELETEs server id, strips pending, clears latch + host', async () => {
    const pendingDetail = {
      ...baseDetail(),
      viewerPendingReview: { id: 77, nodeId: 'PRR_pending' },
      reviewComments: [
        {
          id: 501,
          body: 'start pending',
          path: 'a.ts',
          line: 2,
          pending: true,
          pendingReviewId: 77,
        },
        {
          id: 502,
          body: 'add pending',
          path: 'a.ts',
          line: 6,
          pending: true,
          pendingReviewId: 77,
        },
        {
          id: 20,
          body: 'review c',
          threadNodeId: 'PRRT_A',
          resolved: false,
        },
      ],
    };
    const h = makeBag(pendingDetail);
    h.bag.serverPendingReviewId = 77;
    h.bag.pendingReviewNodeIdRef.current = 'PRR_pending';
    let deletedId: number | null = null;
    let pendingReviewSet: any = null;
    h.bag.setPendingReview = (v: any) => {
      pendingReviewSet = v;
    };
    (globalThis as any).PRTreeFetch = {
      deletePendingPullReview: async (
        _o: string,
        _r: string,
        _n: number,
        reviewId: number
      ) => {
        deletedId = reviewId;
        // During await, local still has pending (API-first)
        expect(h.local?.viewerPendingReview?.id).toBe(77);
        return {};
      },
    };
    // DOM latch used by attach path
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute(
        'data-prp-pending-review-node',
        'PRR_pending'
      );
    }

    await h.mut.onDiscardPendingReview();

    expect(deletedId).toBe(77);
    expect(h.bag.pendingReviewNodeIdRef.current).toBeNull();
    expect(h.local?.viewerPendingReview).toBeNull();
    expect((h.local?.reviewComments || []).some((c: any) => c.pending)).toBe(
      false
    );
    expect((h.local?.reviewComments || []).map((c: any) => c.id)).toContain(20);
    expect((h.local?.reviewComments || []).map((c: any) => c.id)).not.toContain(
      501
    );
    expect(h.local?._dropPending).toBeFalsy();
    expect(pendingReviewSet).toEqual({ comments: [], body: '' });
    expect(
      h.hostPatches.some(
        (p) =>
          p.viewerPendingReview === null &&
          Array.isArray(p.reviewComments) &&
          !(p.reviewComments as any[]).some((c) => c?.pending)
      )
    ).toBe(true);
    if (typeof document !== 'undefined') {
      expect(
        document.documentElement.getAttribute('data-prp-pending-review-node')
      ).toBeNull();
    }
  });
});

describe('pessimistic source order contracts', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const { resolve } = require('node:path') as typeof import('node:path');
  const src = readFileSync(
    resolve(__dirname, '../src/modal/commands/domain-mutations.ts'),
    'utf8'
  );

  function extractFn(name: string): string {
    const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\b`);
    const m = re.exec(src);
    if (!m) throw new Error(`function ${name} not found`);
    let i = m.index + m[0].length;
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] !== '(') throw new Error(`no params for ${name}`);
    let depth = 0;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') {
        depth--;
        if (depth === 0 && ch === ')') {
          i++;
          break;
        }
      }
    }
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] === ':') {
      while (i < src.length && src[i] !== '{') i++;
    }
    if (src[i] !== '{') throw new Error(`no body for ${name}`);
    depth = 0;
    const start = i;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return src.slice(start, i + 1);
      }
    }
    throw new Error(`unclosed ${name}`);
  }

  /** True if first await of apiMethod appears before first applyDomainDetail/commitCommentListPatch. */
  function apiBeforePaint(body: string, apiNeedle: string, paintNeedle: RegExp): boolean {
    const apiIdx = body.indexOf(apiNeedle);
    const paintMatch = paintNeedle.exec(body);
    if (apiIdx < 0 || !paintMatch) return false;
    return apiIdx < paintMatch.index;
  }

  test('onSaveBody awaits update before applyDomainDetail body paint', () => {
    const body = extractFn('onSaveBody');
    expect(apiBeforePaint(body, 'await api.updatePullRequest', /applyDomainDetail/)).toBe(
      true
    );
  });

  test('onResolveThread awaits resolve before applyStamp paint', () => {
    const body = extractFn('onResolveThread');
    expect(body.indexOf('await api.resolveReviewThread')).toBeLessThan(
      body.indexOf('applyStamp(Boolean(resolved))')
    );
  });

  test('onDeleteIssueComment awaits delete before strip', () => {
    const body = extractFn('onDeleteIssueComment');
    expect(body.indexOf('await api.deleteIssueComment')).toBeLessThan(
      body.indexOf('commitCommentListPatch')
    );
  });

  test('onDeleteReviewComment awaits delete before strip', () => {
    const body = extractFn('onDeleteReviewComment');
    expect(body.indexOf('await api.deleteReviewComment')).toBeLessThan(
      body.indexOf('commitCommentListPatch')
    );
  });

  test('onEditTitle awaits update before title applyDomainDetail', () => {
    const body = extractFn('onEditTitle');
    expect(apiBeforePaint(body, 'await api.updatePullRequest', /applyDomainDetail/)).toBe(
      true
    );
  });

  test('onSetDraftStage awaits API before applyDraft', () => {
    const body = extractFn('onSetDraftStage');
    expect(body.indexOf('await api.setPullRequestDraftStage')).toBeLessThan(
      body.indexOf('applyDraft(confirmed)')
    );
  });
});
