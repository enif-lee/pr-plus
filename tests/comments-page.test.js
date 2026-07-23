const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCRATCH =
  process.env.PRP_SCRATCH ||
  '/var/folders/sl/km7nh7qj50b9mw4901n7ch940000gn/T/grok-goal-4eb56420c3d0/implementer';
fs.mkdirSync(SCRATCH, { recursive: true });

const page = require('../src/modal/pure/comments-page.js');
const { fetchPrCommentsPage } = require('../src/fetch-pulls.js');
const polish = require('../src/modal/pure/ui-polish.js');

const log = [];
function ok(msg) {
  log.push(`ok - ${msg}`);
  console.log(`ok - ${msg}`);
}

async function main() {
  // Link header parsing
  {
    const link =
      '<https://api.github.com/repos/o/r/issues/1/comments?page=2>; rel="next", <https://api.github.com/repos/o/r/issues/1/comments?page=5>; rel="last"';
    assert.equal(page.parseLinkNextPage(link), 2);
    assert.equal(page.linkHasMore(link), true);
    assert.equal(page.parseLinkNextPage(''), null);
    ok('parseLinkNextPage');
  }

  // URL builder includes page/since
  {
    const url = page.buildCommentsListUrl('review', 'acme', 'app', 9, {
      page: 3,
      perPage: 50,
      since: '2026-01-01T00:00:00Z',
      sort: 'created',
      direction: 'asc',
    });
    assert.match(url, /pulls\/9\/comments/);
    assert.match(url, /page=3/);
    assert.match(url, /per_page=50/);
    assert.match(url, /since=2026-01-01/);
    ok('buildCommentsListUrl');
  }

  // merge by id
  {
    const merged = page.mergeCommentsById(
      [
        { id: 1, body: 'a', createdAt: '2026-01-01T00:00:00Z' },
        { id: 2, body: 'b', createdAt: '2026-01-02T00:00:00Z' },
      ],
      [
        { id: 2, body: 'b2', createdAt: '2026-01-02T00:00:00Z' },
        { id: 3, body: 'c', createdAt: '2026-01-03T00:00:00Z' },
      ]
    );
    assert.equal(merged.length, 3);
    assert.equal(merged.find((c) => c.id === 2).body, 'b2');
    ok('mergeCommentsById');
  }

  // meta + advance
  {
    const m1 = page.buildCommentsPageMeta(
      Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        createdAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
      })),
      {
        page: 1,
        perPage: 50,
        linkHeader: '<https://api.github.com/x?page=2>; rel="next"',
      }
    );
    assert.equal(m1.hasMore, true);
    assert.equal(m1.nextPage, 2);
    const m2 = page.advanceCommentsMeta(
      m1,
      { ...m1, page: 2, hasMore: false, nextPage: null },
      80
    );
    assert.equal(m2.hasMore, false);
    assert.equal(m2.loadedCount, 80);
    ok('buildCommentsPageMeta / advance');
  }

  // fetchPrCommentsPage real entry (mock)
  {
    const mockFetch = async (url) => {
      const u = new URL(url);
      const p = Number(u.searchParams.get('page') || 1);
      const items =
        p === 1
          ? Array.from({ length: 50 }, (_, i) => ({
              id: i + 1,
              user: { login: 'u', avatar_url: '' },
              body: `c${i}`,
              created_at: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
              path: 'a.js',
              line: i + 1,
              side: 'RIGHT',
            }))
          : [
              {
                id: 51,
                user: { login: 'u' },
                body: 'last',
                created_at: '2026-01-02T00:00:00Z',
                path: 'a.js',
                line: 1,
              },
            ];
      return {
        ok: true,
        headers: {
          get(name) {
            if (String(name).toLowerCase() === 'link' && p === 1) {
              return '<https://api.github.com/repos/o/r/pulls/9/comments?page=2>; rel="next"';
            }
            return null;
          },
        },
        json: async () => items,
      };
    };
    const page1 = await fetchPrCommentsPage(
      'o',
      'r',
      9,
      'review',
      { page: 1, perPage: 50 },
      mockFetch,
      null
    );
    assert.equal(page1.items.length, 50);
    assert.equal(page1.meta.hasMore, true);
    assert.equal(page1.meta.nextPage, 2);
    const page2 = await fetchPrCommentsPage(
      'o',
      'r',
      9,
      'review',
      { page: 2, perPage: 50 },
      mockFetch,
      null
    );
    assert.equal(page2.items.length, 1);
    const merged = page.mergeCommentsById(page1.items, page2.items);
    assert.equal(merged.length, 51);
    ok('fetchPrCommentsPage offset pages');
  }

  // stack path branch select
  {
    const prs = [
      { number: 1, title: 'Root', headRef: 'a', baseRef: 'main' },
      { number: 2, title: 'Left', headRef: 'b1', baseRef: 'a' },
      { number: 3, title: 'Right', headRef: 'b2', baseRef: 'a' },
      { number: 4, title: 'Left-child', headRef: 'c1', baseRef: 'b1' },
      { number: 5, title: 'Right-child', headRef: 'c2', baseRef: 'b2' },
    ];
    const modelDefault = polish.buildStackPathModel(prs, 1, {});
    assert.ok(
      modelDefault.branches.some((b) => b.parentHeadRef === 'a' && b.options.length === 2)
    );
    const defaultChild = modelDefault.branches.find((b) => b.parentHeadRef === 'a');
    assert.equal(defaultChild.selectedNumber, 3); // sorted desc = first branch
    assert.deepEqual(modelDefault.items.map((i) => i.number).slice(0, 3), [1, 3, 5]);
    const modelLeft = polish.buildStackPathModel(prs, 1, { a: 2 });
    assert.deepEqual(
      modelLeft.items.map((i) => i.number),
      [1, 2, 4]
    );
    assert.equal(
      modelLeft.branches.find((b) => b.parentHeadRef === 'a').selectedNumber,
      2
    );
    ok('buildStackPathModel branch path select');
  }

  const out = log.join('\n') + '\n';
  fs.writeFileSync(path.join(SCRATCH, 'comments-page-unit.log'), out);
  console.log('comments-page.test.js: all assertions passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
