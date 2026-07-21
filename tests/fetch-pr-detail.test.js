const assert = require('node:assert/strict');
const {
  fetchPrDetail,
  postIssueComment,
  submitPullReview,
  postReviewComment,
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
          base: { ref: 'main' },
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
        ],
      };
    }
    if (url.includes('/issues/9/comments')) {
      return {
        ok: true,
        json: async () => [
          { id: 1, user: { login: 'c' }, body: 'hi', created_at: '' },
        ],
      };
    }
    if (url.includes('/pulls/9/comments') && !url.includes('/reviews')) {
      return {
        ok: true,
        json: async () => [
          {
            id: 2,
            user: { login: 'lc' },
            body: 'line',
            path: 'a.js',
            line: 3,
            side: 'RIGHT',
            created_at: '',
          },
        ],
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
          total_count: 1,
          statuses: [
            { context: 'ci', state: 'success', description: 'ok', target_url: '' },
          ],
        }),
      };
    }
    if (url.includes('/check-runs')) {
      return { ok: true, json: async () => ({ check_runs: [] }) };
    }
    if (url.includes('/contents/.gitattributes')) {
      return {
        ok: true,
        json: async () => ({
          content: Buffer.from('*.min.js linguist-generated=true\n', 'utf8').toString(
            'base64'
          ),
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

  const detail = await fetchPrDetail('o', 'r', 9, mockFetch, null);
  assert.equal(detail.number, 9);
  assert.equal(detail.files.length, 1);
  assert.equal(detail.files[0].patch.includes('+x'), true);
  assert.equal(detail.comments.length, 1);
  assert.equal(detail.reviews[0].state, 'APPROVED');
  assert.equal(detail.commits[0].sha, 'abcdef1');
  assert.equal(detail.checks.state, 'success');
  assert.equal(detail.reviewComments.length, 1);
  assert.ok(calls.some((c) => c.url.includes('/pulls/9/files')));

  // mutations
  const posts = [];
  const writeFetch = async (url, init) => {
    posts.push({ url, method: init?.method, body: init?.body });
    return { ok: true, status: 201, json: async () => ({ id: 99 }) };
  };
  await postIssueComment('o', 'r', 9, 'hello', writeFetch, 'tok');
  await submitPullReview('o', 'r', 9, { event: 'APPROVE', body: 'lgtm' }, writeFetch, 'tok');
  await postReviewComment(
    'o',
    'r',
    9,
    { body: 'n', path: 'a.js', line: 2, commitId: 'deadbeef' },
    writeFetch,
    'tok'
  );
  assert.equal(posts.length, 3);
  assert.equal(posts[0].method, 'POST');
  assert.ok(JSON.parse(posts[1].body).event === 'APPROVE');
  assert.ok(JSON.parse(posts[2].body).path === 'a.js');

  console.log('fetch-pr-detail.test.js: all assertions passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
