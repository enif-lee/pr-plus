const assert = require('node:assert/strict');
const {
  fetchPrDetail,
  fetchPrCommits,
  fetchPrChecks,
  fetchPrDevelopment,
  fetchPrFiles,
  fetchPrIssueComments,
  fetchPrReviews,
  postIssueComment,
  submitPullReview,
  postReviewComment,
  replyToReviewComment,
  resolveReviewThread,
  deleteReviewComment,
  deleteIssueComment,
  apiGraphql,
  updatePullState,
  closePullRequest,
  reopenPullRequest,
} = require('../src/fetch-pulls.js');

async function main() {
  const calls = [];
  const mockFetch = async (url, init) => {
    calls.push({ url, method: init?.method || 'GET', body: init?.body });
    if (/\/pulls\/9$/.test(url)) {
      return {
        ok: true,
        json: async () => ({
          number: 9,
          title: 'T',
          body: 'B',
          state: 'open',
          draft: false,
          user: { login: 'u' },
          base: { ref: 'main', sha: 'basebeef' },
          head: { ref: 'feat', sha: 'deadbeef' },
          html_url: 'https://github.com/o/r/pull/9',
          merged: false,
          mergeable: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
          additions: 1,
          deletions: 0,
          changed_files: 1,
        }),
      };
    }
    if (url.includes('/files')) {
      return {
        ok: true,
        json: async () => [
          {
            filename: 'a.js',
            status: 'modified',
            additions: 1,
            deletions: 0,
            changes: 1,
            patch: '@@\n+x\n',
          },
          {
            filename: 'api/v1/foo.pb.go',
            status: 'modified',
            additions: 2,
            deletions: 0,
            changes: 2,
            patch: '@@ -1,1 +1,3 @@\n package v1\n+// generated\n+var x\n',
          },
        ],
      };
    }
    if (url.includes('/issues/9/comments')) {
      return {
        ok: true,
        headers: { get: () => null },
        json: async () => [
          { id: 1, user: { login: 'c' }, body: 'hi', created_at: '2026-01-01T00:00:00Z' },
        ],
      };
    }
    if (url.includes('/pulls/9/comments') && !url.includes('/reviews')) {
      return {
        ok: true,
        headers: { get: () => null },
        json: async () => [
          {
            id: 2,
            user: { login: 'lc' },
            body: 'line',
            path: 'a.js',
            line: 3,
            side: 'RIGHT',
            created_at: '',
            // Intentionally no thread_id — REST never returns it
          },
        ],
      };
    }
    if (url.includes('api.github.com/user') && !url.includes('/users/')) {
      return {
        ok: true,
        json: async () => ({ login: 'viewer-bot' }),
      };
    }
    if (url.includes('api.github.com/graphql')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            repository: {
              pullRequest: {
                reviewThreads: {
                  totalCount: 1,
                  pageInfo: {
                    hasNextPage: false,
                    hasPreviousPage: false,
                    startCursor: 'c0',
                    endCursor: 'c0',
                  },
                  nodes: [
                    {
                      id: 'PRRT_from_graphql',
                      isResolved: false,
                      isOutdated: false,
                      path: 'a.js',
                      diffSide: 'RIGHT',
                      line: 1,
                      comments: {
                        nodes: [
                          {
                            databaseId: 2,
                            id: 'RC_2',
                            body: 'x',
                            path: 'a.js',
                            line: 1,
                            author: { login: 'r' },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        }),
      };
    }
    if (url.includes('/reviews')) {
      return {
        ok: true,
        json: async () => [
          { id: 3, user: { login: 'r' }, state: 'APPROVED', body: 'ok', submitted_at: '' },
        ],
      };
    }
    if (url.includes('/commits/') && url.includes('/status')) {
      return {
        ok: true,
        json: async () => ({
          state: 'success',
          total_count: 2,
          // Same context twice (re-push / re-status) — only latest should survive
          statuses: [
            {
              context: 'ci',
              state: 'failure',
              description: 'old',
              target_url: '',
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
            },
            {
              context: 'ci',
              state: 'success',
              description: 'ok',
              target_url: '',
              created_at: '2024-01-02T00:00:00Z',
              updated_at: '2024-01-02T00:00:00Z',
            },
          ],
        }),
      };
    }
    if (url.includes('/check-runs')) {
      return {
        ok: true,
        json: async () => ({
          check_runs: [
            {
              id: 1,
              name: 'build',
              status: 'completed',
              conclusion: 'failure',
              html_url: 'https://example/1',
              started_at: '2024-01-01T00:00:00Z',
              completed_at: '2024-01-01T00:05:00Z',
              app: { slug: 'github-actions', name: 'GitHub Actions' },
            },
            {
              id: 9,
              name: 'build',
              status: 'completed',
              conclusion: 'success',
              html_url: 'https://example/9',
              started_at: '2024-01-02T00:00:00Z',
              completed_at: '2024-01-02T00:05:00Z',
              app: { slug: 'github-actions', name: 'GitHub Actions' },
            },
          ],
        }),
      };
    }
    if (url.includes('/contents/.gitattributes')) {
      return {
        ok: true,
        json: async () => ({
          content: Buffer.from(
            '*.pb.go linguist-generated=true\n*.min.js linguist-generated=true\n',
            'utf8'
          ).toString('base64'),
          encoding: 'base64',
        }),
      };
    }
    if (url.includes('/commits')) {
      return {
        ok: true,
        json: async () => [
          {
            sha: 'abcdef1',
            commit: { message: 'm', author: { name: 'n' } },
            author: { login: 'n' },
          },
        ],
      };
    }
    return { ok: false, status: 404, statusText: 'no' };
  };

  const detail = await fetchPrDetail('o', 'r', 9, mockFetch, 'tok');
  assert.equal(detail.number, 9);
  // files / comments / reviews deferred — core returns empty placeholders
  assert.deepEqual(detail.files, []);
  assert.deepEqual(detail.comments, []);
  assert.deepEqual(detail.reviews, []);
  assert.equal(detail.gitattributesText, '');
  // commits / checks / development also deferred
  assert.deepEqual(detail.commits, []);
  assert.equal(detail.checks.state, 'unknown');
  assert.equal(detail.baseSha, 'basebeef');
  assert.equal(detail.headSha, 'deadbeef');

  // Independent side fetches
  const filePack = await fetchPrFiles('o', 'r', 9, mockFetch, 'tok', {
    headSha: 'deadbeef',
  });
  assert.equal(filePack.files.length, 2);
  assert.equal(filePack.files[0].patch.includes('+x'), true);
  assert.ok(
    filePack.gitattributesText.includes('*.pb.go linguist-generated=true'),
    'gitattributesText must be decoded from contents API'
  );
  const pb = filePack.files.find((f) => f.filename === 'api/v1/foo.pb.go');
  assert.ok(pb, 'pb.go file present');
  assert.equal(
    pb.defaultCollapsed,
    true,
    'fetchPrFiles must annotate collapse via gitattributes (not path hardcode)'
  );
  assert.equal(
    filePack.files.find((f) => f.filename === 'a.js').defaultCollapsed,
    false
  );
  const collapse = require('../src/modal/pure/collapse.js');
  const re = collapse.annotateFilesForCollapse(
    filePack.files.map((f) => ({ ...f, defaultCollapsed: false })),
    filePack.gitattributesText
  );
  assert.equal(
    re.find((f) => f.filename === 'api/v1/foo.pb.go').defaultCollapsed,
    true
  );

  const issuePage = await fetchPrIssueComments('o', 'r', 9, mockFetch, 'tok');
  assert.equal((issuePage.items || []).length, 1);
  const reviews = await fetchPrReviews('o', 'r', 9, mockFetch, 'tok');
  assert.equal(reviews[0].state, 'APPROVED');

  const commits = await fetchPrCommits('o', 'r', 9, mockFetch, 'tok');
  assert.equal(commits[0].sha, 'abcdef1');
  const checks = await fetchPrChecks('o', 'r', 'deadbeef', mockFetch, 'tok');
  assert.equal(checks.state, 'success');
  assert.equal(checks.statuses.length, 1);
  assert.equal(checks.statuses[0].state, 'success');
  assert.equal(checks.checkRuns.length, 1);
  assert.equal(checks.checkRuns[0].id, 9);
  assert.equal(checks.checkRuns[0].conclusion, 'success');
  assert.equal(checks.totalCount, 2);
  assert.equal(typeof fetchPrDevelopment, 'function');
  assert.equal(detail.reviewComments.length, 1);
  assert.ok(
    calls.some((c) => c.url.includes('/pulls/9/files')),
    'fetchPrFiles hits files endpoint'
  );
  assert.ok(
    calls.some((c) => String(c.url).includes('api.github.com/graphql')),
    'fetchPrDetail must call GraphQL for review threads'
  );
  // Realistic merge: GraphQL thread id + resolved on REST comment id=2
  const rc = detail.reviewComments[0];
  assert.equal(
    rc.threadNodeId,
    'PRRT_from_graphql',
    'reviewComments must receive GraphQL threadNodeId (not REST thread_id)'
  );
  assert.equal(rc.resolved, false, 'resolved must come from GraphQL isResolved');
  assert.ok(
    Array.isArray(detail.reviewThreads) && detail.reviewThreads.length === 1,
    'reviewThreads exposed on detail payload'
  );
  assert.equal(detail.viewerLogin, 'viewer-bot', 'viewerLogin from /user for delete-own');

  // mutations: comment, review, line comment, reply, resolve, close, reopen
  const posts = [];
  const writeFetch = async (url, init) => {
    posts.push({ url, method: init?.method, body: init?.body });
    if (String(url).includes('graphql')) {
      let q = '';
      try {
        q = JSON.parse(init?.body || '{}').query || '';
      } catch {
        q = '';
      }
      if (q.includes('addPullRequestReviewThreadReply')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              addPullRequestReviewThreadReply: {
                comment: {
                  databaseId: 777,
                  body: 'gql reply',
                  author: { login: 'viewer-bot' },
                  replyTo: { databaseId: 42 },
                },
              },
            },
          }),
        };
      }
      if (q.includes('addPullRequestReviewComment')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              addPullRequestReviewComment: {
                comment: {
                  databaseId: 778,
                  body: 'pending reply',
                  author: { login: 'viewer-bot' },
                  replyTo: { databaseId: 42 },
                },
              },
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            resolveReviewThread: {
              thread: { id: 'PRRT_abc', isResolved: true },
            },
          },
        }),
      };
    }
    // Pending-review probe GETs must not look like a PENDING review
    if (String(init?.method || 'GET').toUpperCase() === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => {
          if (String(url).includes('/reviews/') && String(url).includes('/comments')) {
            return [];
          }
          if (String(url).includes('/reviews')) return [];
          if (String(url).includes('/user')) return { login: 'viewer-bot' };
          return { login: 'viewer-bot' };
        },
      };
    }
    // Create PENDING review (no event in body)
    if (
      String(init?.method).toUpperCase() === 'POST' &&
      String(url).includes('/pulls/') &&
      String(url).endsWith('/reviews')
    ) {
      let parsed = {};
      try {
        parsed = JSON.parse(init?.body || '{}');
      } catch {
        parsed = {};
      }
      if (!parsed.event) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 555,
            node_id: 'PRR_pending_mock',
            state: 'PENDING',
          }),
        };
      }
    }
    return { ok: true, status: 201, json: async () => ({ id: 99, state: 'closed' }) };
  };
  await postIssueComment('o', 'r', 9, 'hello', writeFetch, 'tok');
  await submitPullReview(
    'o',
    'r',
    9,
    {
      event: 'APPROVE',
      body: 'lgtm',
      commitId: 'deadbeef',
      comments: [{ path: 'a.js', line: 3, body: 'pending line', side: 'RIGHT' }],
    },
    writeFetch,
    'tok'
  );
  await postReviewComment(
    'o',
    'r',
    9,
    {
      body: 'n',
      path: 'a.js',
      line: 4,
      commitId: 'deadbeef',
      startLine: 2,
      startSide: 'RIGHT',
    },
    writeFetch,
    'tok'
  );
  await replyToReviewComment('o', 'r', 9, 42, 'reply body', writeFetch, 'tok');
  // Prefer GraphQL thread path when threadNodeId provided (pending-safe)
  await replyToReviewComment('o', 'r', 9, 42, 'gql reply', writeFetch, 'tok', {
    threadNodeId: 'PRRT_xyz',
  });
  const resolveData = await resolveReviewThread('PRRT_abc', true, writeFetch, 'tok');
  assert.ok(resolveData?.resolveReviewThread?.thread?.isResolved === true);
  await closePullRequest('o', 'r', 9, writeFetch, 'tok');
  await reopenPullRequest('o', 'r', 9, writeFetch, 'tok');
  await updatePullState('o', 'r', 9, 'closed', writeFetch, 'tok');

  assert.ok(posts.length >= 8);
  assert.equal(posts[0].method, 'POST');
  assert.ok(posts[0].url.endsWith('/issues/9/comments'));
  assert.equal(JSON.parse(posts[0].body).body, 'hello');
  assert.equal(posts[1].method, 'POST');
  assert.ok(posts[1].url.endsWith('/pulls/9/reviews'));
  const reviewBody = JSON.parse(posts[1].body);
  assert.equal(reviewBody.event, 'APPROVE');
  assert.equal(reviewBody.commit_id, 'deadbeef');
  assert.ok(Array.isArray(reviewBody.comments) && reviewBody.comments[0].path === 'a.js');
  // postReviewComment probes pending review first (GET), then REST POST when none
  const multiLinePost = posts.find(
    (p) =>
      p.method === 'POST' &&
      String(p.url).endsWith('/pulls/9/comments') &&
      p.body &&
      (() => {
        try {
          const b = JSON.parse(p.body);
          return b.path === 'a.js' && b.line === 4;
        } catch {
          return false;
        }
      })()
  );
  assert.ok(multiLinePost, 'line comment POST present');
  const multiLine = JSON.parse(multiLinePost.body);
  assert.equal(multiLine.path, 'a.js');
  assert.equal(multiLine.line, 4);
  assert.equal(multiLine.start_line, 2);
  assert.equal(multiLine.start_side, 'RIGHT');
  // REST reply fallback (no threadNodeId, no pending in mock)
  const replyRest = posts.find(
    (p) => p.method === 'POST' && String(p.url).includes('/comments/42/replies')
  );
  assert.ok(replyRest, 'REST /replies used when no threadNodeId / no pending');
  assert.equal(JSON.parse(replyRest.body).body, 'reply body');
  // GraphQL thread reply when threadNodeId provided (mode=comment, no pending)
  const replyGql = posts.find((p) => {
    if (!String(p.url).includes('graphql') || !p.body) return false;
    try {
      const b = JSON.parse(p.body);
      return String(b.query || '').includes('addPullRequestReviewThreadReply');
    } catch {
      return false;
    }
  });
  assert.ok(replyGql, 'GraphQL addPullRequestReviewThreadReply used with threadNodeId');

  // mode=pending creates/uses pending review path
  await replyToReviewComment('o', 'r', 9, 42, 'pending reply', writeFetch, 'tok', {
    mode: 'pending',
    parentNodeId: 'PRRC_parent',
    commitId: 'deadbeef',
  });
  const pendingCreate = posts.find(
    (p) =>
      p.method === 'POST' &&
      String(p.url).endsWith('/pulls/9/reviews') &&
      p.body &&
      !JSON.parse(p.body).event
  );
  // Either created pending or found existing; GraphQL addPullRequestReviewComment
  const pendingGql = posts.find((p) => {
    if (!String(p.url).includes('graphql') || !p.body) return false;
    try {
      return JSON.parse(p.body).query?.includes('addPullRequestReviewComment');
    } catch {
      return false;
    }
  });
  assert.ok(
    pendingCreate || pendingGql,
    'pending mode creates review and/or uses addPullRequestReviewComment'
  );
  const resolvePost = posts.find((p) => {
    if (!String(p.url).includes('graphql') || !p.body) return false;
    try {
      return JSON.parse(p.body).query?.includes('resolveReviewThread');
    } catch {
      return false;
    }
  });
  assert.ok(resolvePost, 'resolve uses GraphQL');
  assert.ok(JSON.parse(resolvePost.body).query.includes('resolveReviewThread'));
  const closeCall = posts.find(
    (p) => p.method === 'PATCH' && p.url.endsWith('/pulls/9') && JSON.parse(p.body).state === 'closed'
  );
  const reopenCall = posts.find(
    (p) => p.method === 'PATCH' && p.url.endsWith('/pulls/9') && JSON.parse(p.body).state === 'open'
  );
  assert.ok(closeCall, 'closePullRequest must PATCH state:closed');
  assert.ok(reopenCall, 'reopenPullRequest must PATCH state:open');

  // GraphQL HTTP 200 + errors must throw (not silent success)
  let gqlErr = null;
  try {
    await apiGraphql(
      'mutation { x }',
      {},
      async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          errors: [{ message: 'Could not resolve to a node' }],
        }),
      }),
      'tok'
    );
  } catch (e) {
    gqlErr = e;
  }
  assert.ok(gqlErr, 'apiGraphql must throw on body.errors');
  assert.match(String(gqlErr.message), /GraphQL|Could not resolve/i);

  let resolveErr = null;
  try {
    await resolveReviewThread(
      'PRRT_bad',
      true,
      async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          errors: [{ message: 'Thread not found' }],
        }),
      }),
      'tok'
    );
  } catch (e) {
    resolveErr = e;
  }
  assert.ok(resolveErr, 'resolveReviewThread must fail on GraphQL errors');
  assert.match(String(resolveErr.message), /Thread not found|GraphQL/i);

  // Delete own review / issue comments — real DELETE paths
  const dels = [];
  const delFetch = async (url, init) => {
    dels.push({ url, method: init?.method || 'GET' });
    return { ok: true, status: 204, json: async () => null };
  };
  await deleteReviewComment('o', 'r', 99, delFetch, 'tok');
  await deleteIssueComment('o', 'r', 88, delFetch, 'tok');
  assert.equal(dels[0].method, 'DELETE');
  assert.ok(dels[0].url.endsWith('/pulls/comments/99'));
  assert.equal(dels[1].method, 'DELETE');
  assert.ok(dels[1].url.endsWith('/issues/comments/88'));

  console.log('fetch-pr-detail.test.js: all assertions passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
