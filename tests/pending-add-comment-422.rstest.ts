/**
 * Start review → second Add comment must attach via GraphQL to the existing
 * PENDING review — never REST POST …/pulls/…/comments (GitHub 422
 * "one pending review per pull request").
 *
 * Drives real `postReviewComment` / `ensureViewerPendingReview` with mock fetch.
 */
import { describe, expect, test } from '@rstest/core';
import { postReviewComment } from '../src/fetch/mutations-comments';
import {
  ensureViewerPendingReview,
  pickViewerPendingFromReviews,
} from '../src/fetch/pending-review';

type MockCall = {
  url: string;
  method: string;
  body: any;
};

function jsonRes(data: any, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 422 ? 'Unprocessable Entity' : 'OK',
    headers: { get: () => null },
    json: async () => data,
  };
}

function makeFetch(handlers: (url: string, init: any, calls: MockCall[]) => any) {
  const calls: MockCall[] = [];
  const fetchImpl = async (url: string, init: any = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    let body = null;
    if (init.body) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ url: String(url), method, body });
    return handlers(String(url), { ...init, method, body }, calls);
  };
  return { fetchImpl, calls };
}

const PENDING = {
  id: 9001,
  node_id: 'PRR_pending_node_abc',
  state: 'PENDING',
  user: { login: 'me' },
};

const GQL_THREAD_OK = {
  data: {
    addPullRequestReviewThread: {
      thread: {
        id: 'PRRT_thread1',
        comments: {
          nodes: [
            {
              id: 'PRRC_c1',
              databaseId: 501,
              body: 'hello',
              path: 'a.ts',
              createdAt: '2026-01-01T00:00:00Z',
              author: { login: 'me', avatarUrl: '' },
              pullRequestReview: { databaseId: 9001 },
            },
          ],
        },
      },
    },
  },
};

describe('pickViewerPendingFromReviews', () => {
  test('picks viewer PENDING with node_id', () => {
    const p = pickViewerPendingFromReviews(
      [
        { id: 1, state: 'APPROVED', node_id: 'x', user: { login: 'me' } },
        PENDING,
      ],
      'me'
    );
    expect(p).toEqual({ id: 9001, node_id: 'PRR_pending_node_abc' });
  });
});

describe('postReviewComment asPending — second Add comment avoids REST 422', () => {
  test('first asPending creates review then GraphQL attach; second only GraphQL', async () => {
    let hasPending = false;
    const { fetchImpl, calls } = makeFetch((url, init) => {
      // Viewer login
      if (url.includes('/user') && init.method === 'GET' && !url.includes('/repos')) {
        return jsonRes({ login: 'me' });
      }
      // List reviews
      if (url.includes('/pulls/7/reviews') && !url.includes('/reviews/') && init.method === 'GET') {
        return jsonRes(hasPending ? [PENDING] : []);
      }
      // GET one review (hydrate)
      if (url.includes('/pulls/7/reviews/9001') && init.method === 'GET') {
        return jsonRes(PENDING);
      }
      // Create empty PENDING
      if (url.includes('/pulls/7/reviews') && init.method === 'POST' && !url.includes('/events')) {
        if (hasPending) {
          return jsonRes(
            {
              message: 'Unprocessable Entity',
              errors: [
                {
                  message:
                    'User can only have one pending review per Pull Request',
                },
              ],
            },
            422
          );
        }
        hasPending = true;
        return jsonRes(PENDING);
      }
      // GraphQL
      if (url.includes('/graphql') && init.method === 'POST') {
        const q = String(init.body?.query || '');
        expect(q).toMatch(/addPullRequestReviewThread/);
        expect(init.body?.variables?.review).toBe(PENDING.node_id);
        return jsonRes(GQL_THREAD_OK);
      }
      // REST create line comment — must NOT be used when pending exists
      if (url.includes('/pulls/7/comments') && init.method === 'POST') {
        return jsonRes(
          {
            message: 'Unprocessable Entity',
            errors: [
              {
                message:
                  'User can only have one pending review per Pull Request',
              },
            ],
          },
          422
        );
      }
      return jsonRes({});
    });

    const token = 't';
    const fields = {
      body: 'first',
      path: 'a.ts',
      line: 10,
      side: 'RIGHT',
      commitId: 'abc1234',
      asPending: true,
    };

    const r1 = await postReviewComment(
      'o',
      'r',
      7,
      fields,
      fetchImpl,
      token
    );
    expect(r1.pending).toBe(true);
    expect(r1.pendingReviewId).toBe(9001);

    const r2 = await postReviewComment(
      'o',
      'r',
      7,
      { ...fields, body: 'second' },
      fetchImpl,
      token
    );
    expect(r2.pending).toBe(true);

    const restCommentPosts = calls.filter(
      (c) =>
        c.method === 'POST' &&
        /\/pulls\/7\/comments$/.test(c.url.replace(/\?.*$/, ''))
    );
    expect(restCommentPosts.length).toBe(0);

    const gqlAttach = calls.filter(
      (c) =>
        c.method === 'POST' &&
        c.url.includes('graphql') &&
        String(c.body?.query || '').includes('addPullRequestReviewThread')
    );
    expect(gqlAttach.length).toBe(2);
    // Create pending only once
    const createReview = calls.filter(
      (c) =>
        c.method === 'POST' &&
        /\/pulls\/7\/reviews$/.test(c.url.replace(/\?.*$/, '')) &&
        !c.url.includes('/events')
    );
    expect(createReview.length).toBe(1);
    // Never REST POST line comments
    expect(restCommentPosts.length).toBe(0);
  });

  test('known pendingReviewNodeId skips create and only GraphQL-attaches', async () => {
    const { fetchImpl, calls } = makeFetch((url, init) => {
      if (url.includes('/user') && init.method === 'GET' && !url.includes('/repos')) {
        return jsonRes({ login: 'me' });
      }
      // List must not be required when known PRR_ is passed
      if (url.includes('/pulls/7/reviews') && init.method === 'GET') {
        return jsonRes([]);
      }
      if (url.includes('/pulls/7/reviews') && init.method === 'POST') {
        return jsonRes(
          { message: 'User can only have one pending review per Pull Request' },
          422
        );
      }
      if (url.includes('/graphql')) {
        expect(init.body?.variables?.review).toBe(PENDING.node_id);
        return jsonRes(GQL_THREAD_OK);
      }
      if (url.includes('/comments') && init.method === 'POST') {
        return jsonRes({ message: 'one pending review' }, 422);
      }
      return jsonRes({});
    });

    const out = await postReviewComment(
      'o',
      'r',
      7,
      {
        body: 'second via known node',
        path: 'a.ts',
        line: 12,
        side: 'RIGHT',
        asPending: true,
        commitId: 'abc',
        pendingReviewNodeId: PENDING.node_id,
        pendingReviewId: PENDING.id,
      },
      fetchImpl,
      't'
    );
    expect(out.pending).toBe(true);
    expect(out.pendingReviewNodeId).toBe(PENDING.node_id);
    expect(
      calls.filter(
        (c) =>
          c.method === 'POST' &&
          /\/pulls\/7\/reviews$/.test(c.url.replace(/\?.*$/, ''))
      ).length
    ).toBe(0);
    expect(
      calls.filter(
        (c) =>
          c.method === 'POST' &&
          c.url.includes('graphql') &&
          String(c.body?.query || '').includes('addPullRequestReviewThread')
      ).length
    ).toBe(1);
  });

  test('create 422 on second asPending recovers via list+GraphQL attach (no toast 422)', async () => {
    // Simulates: ensure misses PENDING first, create 422s, then list has PRR_
    let listHas = false;
    let createTried = 0;
    const { fetchImpl, calls } = makeFetch((url, init) => {
      if (url.includes('/user') && init.method === 'GET' && !url.includes('/repos')) {
        return jsonRes({ login: 'me' });
      }
      if (url.includes('/pulls/7/reviews') && !url.includes('/reviews/') && init.method === 'GET') {
        return jsonRes(listHas ? [PENDING] : []);
      }
      if (url.includes('/pulls/7/reviews/9001') && init.method === 'GET') {
        return jsonRes(PENDING);
      }
      if (url.includes('/pulls/7/reviews') && init.method === 'POST' && !url.includes('/events')) {
        createTried += 1;
        listHas = true; // PENDING becomes visible after create 422
        return jsonRes(
          { message: 'User can only have one pending review per Pull Request' },
          422
        );
      }
      if (url.includes('/graphql')) {
        const q = String(init.body?.query || '');
        if (q.includes('addPullRequestReviewThread')) {
          expect(init.body?.variables?.review).toBe(PENDING.node_id);
          return jsonRes(GQL_THREAD_OK);
        }
        // resolveViewerPendingReviewViaGraphql
        return jsonRes({
          data: {
            repository: {
              pullRequest: {
                reviews: {
                  nodes: listHas
                    ? [
                        {
                          id: PENDING.node_id,
                          databaseId: PENDING.id,
                          state: 'PENDING',
                          author: { login: 'me' },
                        },
                      ]
                    : [],
                },
              },
            },
          },
        });
      }
      if (url.includes('/comments') && init.method === 'POST') {
        return jsonRes({ message: 'one pending review' }, 422);
      }
      return jsonRes({});
    });

    const out = await postReviewComment(
      'o',
      'r',
      7,
      {
        body: 'add after miss',
        path: 'z.ts',
        line: 4,
        asPending: true,
        commitId: 'sha',
      },
      fetchImpl,
      't'
    );
    expect(out.pending).toBe(true);
    expect(out.pendingReviewNodeId).toBe(PENDING.node_id);
    expect(createTried).toBeGreaterThanOrEqual(1);
    expect(
      calls.some(
        (c) =>
          c.method === 'POST' &&
          c.url.includes('graphql') &&
          String(c.body?.query || '').includes('addPullRequestReviewThread')
      )
    ).toBe(true);
  });

  test('existing PENDING + asPending never POSTs REST /comments (even if create races 422)', async () => {
    const { fetchImpl, calls } = makeFetch((url, init) => {
      if (url.includes('/user') && init.method === 'GET' && !url.includes('/repos')) {
        return jsonRes({ login: 'me' });
      }
      if (url.includes('/pulls/7/reviews') && !url.includes('/reviews/') && init.method === 'GET') {
        return jsonRes([PENDING]);
      }
      if (url.includes('/pulls/7/reviews/9001') && init.method === 'GET') {
        return jsonRes(PENDING);
      }
      if (url.includes('/pulls/7/reviews') && init.method === 'POST' && !url.includes('/events')) {
        // Should not be needed when pending already found — if called, 422
        return jsonRes(
          {
            message: 'User can only have one pending review per Pull Request',
          },
          422
        );
      }
      if (url.includes('/graphql')) {
        return jsonRes(GQL_THREAD_OK);
      }
      if (url.includes('/pulls/7/comments') && init.method === 'POST') {
        return jsonRes(
          { message: 'User can only have one pending review per Pull Request' },
          422
        );
      }
      return jsonRes({});
    });

    const out = await postReviewComment(
      'o',
      'r',
      7,
      {
        body: 'add more',
        path: 'b.ts',
        line: 3,
        side: 'RIGHT',
        commitId: 'deadbeef',
        asPending: true,
      },
      fetchImpl,
      't'
    );
    expect(out.pending).toBe(true);
    expect(
      calls.some(
        (c) =>
          c.method === 'POST' &&
          /\/pulls\/7\/comments$/.test(c.url.replace(/\?.*$/, ''))
      )
    ).toBe(false);
    expect(calls.some((c) => c.url.includes('graphql'))).toBe(true);
  });

  test('ensureViewerPendingReview recovers node_id after 422 create (race)', async () => {
    let listHas = false;
    const { fetchImpl } = makeFetch((url, init) => {
      if (url.includes('/user') && init.method === 'GET' && !url.includes('/repos')) {
        return jsonRes({ login: 'me' });
      }
      if (url.includes('/pulls/7/reviews') && !url.includes('/reviews/') && init.method === 'GET') {
        return jsonRes(listHas ? [PENDING] : []);
      }
      if (url.includes('/pulls/7/reviews/9001') && init.method === 'GET') {
        return jsonRes(PENDING);
      }
      if (url.includes('/pulls/7/reviews') && init.method === 'POST') {
        // Race: another tab created pending; create 422s then list has it
        listHas = true;
        return jsonRes(
          { message: 'User can only have one pending review per Pull Request' },
          422
        );
      }
      return jsonRes({});
    });

    const p = await ensureViewerPendingReview(
      'o',
      'r',
      7,
      { commitId: 'abc', createIfMissing: true },
      fetchImpl,
      't'
    );
    expect(p?.id).toBe(9001);
    expect(p?.node_id).toBe('PRR_pending_node_abc');
  });

  test('list PENDING without node_id: hydrate GET supplies node_id for GraphQL attach', async () => {
    const listRow = { id: 9001, state: 'PENDING', user: { login: 'me' } }; // no node_id
    const { fetchImpl, calls } = makeFetch((url, init) => {
      if (url.includes('/user') && init.method === 'GET' && !url.includes('/repos')) {
        return jsonRes({ login: 'me' });
      }
      if (url.includes('/pulls/7/reviews') && !url.includes('/reviews/') && init.method === 'GET') {
        return jsonRes([listRow]);
      }
      if (url.includes('/pulls/7/reviews/9001') && init.method === 'GET') {
        return jsonRes(PENDING); // full has node_id
      }
      if (url.includes('/graphql')) {
        expect(init.body?.variables?.review).toBe(PENDING.node_id);
        return jsonRes(GQL_THREAD_OK);
      }
      if (url.includes('/comments') && init.method === 'POST') {
        return jsonRes({ message: 'one pending review' }, 422);
      }
      return jsonRes({});
    });

    const out = await postReviewComment(
      'o',
      'r',
      7,
      {
        body: 'add',
        path: 'c.ts',
        line: 1,
        asPending: true,
        commitId: 'sha',
      },
      fetchImpl,
      't'
    );
    expect(out.pending).toBe(true);
    expect(
      calls.filter((c) => c.method === 'POST' && c.url.includes('/comments'))
        .length
    ).toBe(0);
  });

  test('GET review 403 keeps list node_id (no create→422 on Add comment)', async () => {
    const { fetchImpl, calls } = makeFetch((url, init) => {
      if (url.includes('/user') && init.method === 'GET' && !url.includes('/repos')) {
        return jsonRes({ login: 'me' });
      }
      if (url.includes('/pulls/7/reviews') && !url.includes('/reviews/') && init.method === 'GET') {
        return jsonRes([PENDING]);
      }
      if (url.includes('/pulls/7/reviews/9001') && init.method === 'GET') {
        return jsonRes({ message: 'Forbidden' }, 403);
      }
      if (url.includes('/pulls/7/reviews') && init.method === 'POST' && !url.includes('/events')) {
        return jsonRes(
          { message: 'User can only have one pending review per Pull Request' },
          422
        );
      }
      if (url.includes('/graphql')) {
        const q = String(init.body?.query || '');
        if (q.includes('addPullRequestReviewThread')) {
          expect(init.body?.variables?.review).toBe(PENDING.node_id);
          return jsonRes(GQL_THREAD_OK);
        }
        // resolveViewerPendingReviewViaGraphql — not required when list has node_id
        return jsonRes({ data: { repository: { pullRequest: { reviews: { nodes: [] } } } } });
      }
      return jsonRes({});
    });

    const out = await postReviewComment(
      'o',
      'r',
      7,
      {
        body: 'second after 403 hydrate',
        path: 'a.ts',
        line: 2,
        asPending: true,
        commitId: 'sha',
      },
      fetchImpl,
      't'
    );
    expect(out.pending).toBe(true);
    expect(
      calls.some(
        (c) =>
          c.method === 'POST' &&
          /\/pulls\/7\/reviews$/.test(c.url.replace(/\?.*$/, ''))
      )
    ).toBe(false);
  });

  test('REST omits node_id entirely → GraphQL reviews query supplies PRR_ id', async () => {
    const listRow = { id: 9001, state: 'PENDING', user: { login: 'me' } };
    const { fetchImpl, calls } = makeFetch((url, init) => {
      if (url.includes('/user') && init.method === 'GET' && !url.includes('/repos')) {
        return jsonRes({ login: 'me' });
      }
      if (url.includes('/pulls/7/reviews') && !url.includes('/reviews/') && init.method === 'GET') {
        return jsonRes([listRow]);
      }
      if (url.includes('/pulls/7/reviews/9001') && init.method === 'GET') {
        // Full review also lacks node_id
        return jsonRes({ id: 9001, state: 'PENDING', user: { login: 'me' } });
      }
      if (url.includes('/graphql')) {
        const q = String(init.body?.query || '');
        // resolveViewerPendingReviewViaGraphql: reviews(first:N) + client PENDING filter
        if (
          q.includes('reviews(') &&
          q.includes('databaseId') &&
          !q.includes('addPullRequestReviewThread')
        ) {
          return jsonRes({
            data: {
              repository: {
                pullRequest: {
                  reviews: {
                    nodes: [
                      {
                        id: PENDING.node_id,
                        databaseId: 9001,
                        state: 'PENDING',
                        author: { login: 'me' },
                      },
                    ],
                  },
                },
              },
            },
          });
        }
        if (q.includes('addPullRequestReviewThread')) {
          expect(init.body?.variables?.review).toBe(PENDING.node_id);
          return jsonRes(GQL_THREAD_OK);
        }
        return jsonRes({ data: {} });
      }
      if (url.includes('/comments') && init.method === 'POST') {
        return jsonRes({ message: 'one pending review' }, 422);
      }
      return jsonRes({});
    });

    const out = await postReviewComment(
      'o',
      'r',
      7,
      {
        body: 'add via gql node resolve',
        path: 'd.ts',
        line: 4,
        asPending: true,
        commitId: 'sha',
      },
      fetchImpl,
      't'
    );
    expect(out.pending).toBe(true);
    const gqlQueries = calls.filter(
      (c) => c.method === 'POST' && c.url.includes('graphql')
    );
    expect(gqlQueries.length).toBeGreaterThanOrEqual(2);
    expect(
      calls.filter((c) => c.method === 'POST' && c.url.includes('/comments'))
        .length
    ).toBe(0);
  });

  test('known pendingReviewNodeId attaches without create (Add comment path)', async () => {
    const { fetchImpl, calls } = makeFetch((url, init) => {
      if (url.includes('/graphql') && init.method === 'POST') {
        expect(init.body?.variables?.review).toBe(PENDING.node_id);
        return jsonRes(GQL_THREAD_OK);
      }
      if (url.includes('/pulls/7/reviews') && init.method === 'POST') {
        return jsonRes({ message: 'one pending review' }, 422);
      }
      return jsonRes({});
    });
    const out = await postReviewComment(
      'o',
      'r',
      7,
      {
        body: 'add with known node',
        path: 'z.ts',
        line: 1,
        asPending: true,
        pendingReviewNodeId: PENDING.node_id,
        pendingReviewId: PENDING.id,
      },
      fetchImpl,
      't'
    );
    expect(out.pending).toBe(true);
    expect(out.pendingReviewNodeId).toBe(PENDING.node_id);
    expect(
      calls.filter(
        (c) =>
          c.method === 'POST' &&
          /\/pulls\/7\/reviews$/.test(c.url.replace(/\?.*$/, ''))
      ).length
    ).toBe(0);
  });

  test('asPending false + REST 422 one-pending recovers via GraphQL attach', async () => {
    const { fetchImpl, calls } = makeFetch((url, init) => {
      if (url.includes('/user') && init.method === 'GET' && !url.includes('/repos')) {
        return jsonRes({ login: 'me' });
      }
      // First ensure (createIfMissing false): pretend list is empty (stale)
      // After REST 422, ensure again returns pending
      const reviewGets = calls.filter(
        (c) =>
          c.method === 'GET' &&
          c.url.includes('/pulls/7/reviews') &&
          !c.url.includes('/reviews/')
      ).length;
      if (url.includes('/pulls/7/reviews') && !url.includes('/reviews/') && init.method === 'GET') {
        // First list empty; subsequent lists have pending
        return jsonRes(reviewGets >= 1 ? [PENDING] : []);
      }
      if (url.includes('/pulls/7/reviews/9001') && init.method === 'GET') {
        return jsonRes(PENDING);
      }
      if (url.includes('/pulls/7/comments') && init.method === 'POST') {
        return jsonRes(
          { message: 'User can only have one pending review per Pull Request' },
          422
        );
      }
      if (url.includes('/graphql')) {
        return jsonRes(GQL_THREAD_OK);
      }
      return jsonRes({});
    });

    const out = await postReviewComment(
      'o',
      'r',
      7,
      {
        body: 'immediate comment while pending exists',
        path: 'e.ts',
        line: 8,
        asPending: false,
        commitId: 'sha',
      },
      fetchImpl,
      't'
    );
    expect(out.pending).toBe(true);
    expect(calls.some((c) => c.url.includes('graphql'))).toBe(true);
  });
});
