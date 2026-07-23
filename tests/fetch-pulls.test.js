const assert = require('node:assert/strict');

async function main() {
  const {
    fetchOpenPulls,
    fetchOpenPullsPublic,
    buildApiHeaders,
    mapApiPullRequest,
    findDanglingPrNumbers,
    fetchPullByNumber,
  } = require('../src/fetch-pulls.js');

  // buildApiHeaders with token
  {
    const headers = buildApiHeaders('ghp_secret');
    assert.equal(headers.Authorization, 'Bearer ghp_secret');
    assert.equal(buildApiHeaders(null).Authorization, undefined);
  }

  // mapApiPullRequest (body + labels/assignees/milestone for progressive sketch)
  {
    const mapped = mapApiPullRequest({
      number: 7,
      title: 'Feat',
      body: 'Closes ENG-99',
      head: { ref: 'feat-x' },
      base: { ref: 'main' },
      user: { login: 'dev', avatar_url: 'https://avatars.example/dev' },
      draft: true,
      html_url: 'https://github.com/o/r/pull/7',
      labels: [{ name: 'bug', color: 'd73a4a', description: 'something wrong' }],
      assignees: [{ login: 'alice', avatar_url: 'https://avatars.example/alice' }],
      requested_reviewers: [{ login: 'bob', avatar_url: 'https://avatars.example/bob' }],
      milestone: {
        number: 3,
        title: 'v1',
        state: 'open',
        due_on: '2026-08-01T00:00:00Z',
      },
      node_id: 'PR_kwDO_test',
    });
    assert.equal(mapped.number, 7);
    assert.equal(mapped.title, 'Feat');
    assert.equal(mapped.body, 'Closes ENG-99');
    assert.equal(mapped.headRef, 'feat-x');
    assert.equal(mapped.baseRef, 'main');
    assert.equal(mapped.author, 'dev');
    assert.equal(mapped.authorAvatarUrl, 'https://avatars.example/dev');
    assert.equal(mapped.draft, true);
    assert.equal(mapped.htmlUrl, 'https://github.com/o/r/pull/7');
    assert.deepEqual(mapped.labels, [
      { name: 'bug', color: 'd73a4a', description: 'something wrong' },
    ]);
    assert.deepEqual(mapped.assignees, ['alice']);
    assert.deepEqual(mapped.requestedReviewers, ['bob']);
    assert.deepEqual(mapped.milestone, {
      number: 3,
      title: 'v1',
      state: 'open',
      dueOn: '2026-08-01T00:00:00Z',
    });
    assert.equal(mapped.avatarUrls.dev, 'https://avatars.example/dev');
    assert.equal(mapped.avatarUrls.alice, 'https://avatars.example/alice');
    assert.equal(mapped.avatarUrls.bob, 'https://avatars.example/bob');
    assert.equal(mapped.nodeId, 'PR_kwDO_test');
  }

  // findDanglingPrNumbers
  {
    assert.deepEqual(
      findDanglingPrNumbers([10, 11, 12, 11, 'x'], [{ number: 10 }, { number: 12 }]),
      [11]
    );
    assert.deepEqual(findDanglingPrNumbers([], [{ number: 1 }]), []);
    assert.deepEqual(findDanglingPrNumbers([1, 2], []), [1, 2]);
  }

  // fetchOpenPulls uses token on API request
  {
    let authHeader = null;
    const mockFetch = async (url, init) => {
      authHeader = init?.headers?.Authorization;
      return {
        ok: true,
        json: async () => [
          {
            number: 2,
            title: 'B',
            head: { ref: 'feat-b' },
            base: { ref: 'main' },
            user: { login: 'dev' },
            draft: false,
            html_url: 'https://github.com/o/r/pull/2',
          },
        ],
      };
    };
    const prs = await fetchOpenPulls('octo', 'repo', mockFetch, { token: 'ghp_test' });
    assert.equal(authHeader, 'Bearer ghp_test');
    assert.equal(prs.length, 1);
  }

  // fetchOpenPullsPublic maps API payload
  {
    const mockFetch = async (url) => {
      assert.ok(url.includes('api.github.com'));
      assert.ok(!/\/pulls\/\d+$/.test(url));
      return {
        ok: true,
        json: async () => [
          {
            number: 1,
            title: 'A',
            head: { ref: 'feat-a' },
            base: { ref: 'main' },
            user: { login: 'dev' },
            draft: false,
            html_url: 'https://github.com/o/r/pull/1',
          },
        ],
      };
    };
    const prs = await fetchOpenPullsPublic('octo', 'repo', mockFetch);
    assert.equal(prs.length, 1);
    assert.equal(prs[0].headRef, 'feat-a');
  }

  // list API failure still throws (no HTML fallback)
  {
    const calls = [];
    const mockFetch = async (url) => {
      calls.push(url);
      return { ok: false, status: 404, statusText: 'Not Found' };
    };

    await assert.rejects(
      () => fetchOpenPulls('octo', 'repo', mockFetch, { pagePrNumbers: [1] }),
      (err) => err.status === 404
    );
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/pulls\?/);
  }

  // dangling page PRs are filled via single-PR GET
  {
    const calls = [];
    const mockFetch = async (url) => {
      calls.push(url);
      if (/\/pulls\?/.test(url)) {
        return {
          ok: true,
          json: async () => [
            {
              number: 100,
              title: 'Listed',
              head: { ref: 'feat-a' },
              base: { ref: 'main' },
              user: { login: 'dev' },
              draft: false,
              html_url: 'https://github.com/octo/repo/pull/100',
            },
          ],
        };
      }
      if (url.endsWith('/pulls/999')) {
        return {
          ok: true,
          json: async () => ({
            number: 999,
            title: 'Dangling',
            head: { ref: 'feat-z' },
            base: { ref: 'feat-a' },
            user: { login: 'other' },
            draft: true,
            html_url: 'https://github.com/octo/repo/pull/999',
          }),
        };
      }
      return { ok: false, status: 404, statusText: 'Not Found' };
    };

    const prs = await fetchOpenPulls('octo', 'repo', mockFetch, {
      pagePrNumbers: [100, 999],
    });

    assert.equal(prs.length, 2);
    const dangling = prs.find((p) => p.number === 999);
    assert.equal(dangling.headRef, 'feat-z');
    assert.equal(dangling.baseRef, 'feat-a');
    assert.equal(dangling.draft, true);

    assert.equal(calls.filter((u) => /\/pulls\?/.test(u)).length, 1);
    assert.equal(calls.filter((u) => u.endsWith('/pulls/999')).length, 1);
    assert.equal(calls.filter((u) => u.endsWith('/pulls/100')).length, 0);
  }

  // dangling 404 is skipped; listed PRs still returned
  {
    const mockFetch = async (url) => {
      if (/\/pulls\?/.test(url)) {
        return {
          ok: true,
          json: async () => [
            {
              number: 1,
              title: 'A',
              head: { ref: 'a' },
              base: { ref: 'main' },
              user: { login: 'dev' },
              draft: false,
              html_url: 'https://github.com/o/r/pull/1',
            },
          ],
        };
      }
      return { ok: false, status: 404, statusText: 'Not Found' };
    };

    const prs = await fetchOpenPulls('octo', 'repo', mockFetch, {
      pagePrNumbers: [1, 2],
    });
    assert.equal(prs.length, 1);
    assert.equal(prs[0].number, 1);
  }

  // fetchPullByNumber
  {
    const mockFetch = async (url, init) => {
      assert.equal(url, 'https://api.github.com/repos/o/r/pulls/42');
      assert.equal(init.headers.Authorization, 'Bearer tok');
      return {
        ok: true,
        json: async () => ({
          number: 42,
          title: 'Single',
          head: { ref: 'h' },
          base: { ref: 'b' },
          user: { login: 'u' },
          draft: false,
          html_url: 'https://github.com/o/r/pull/42',
        }),
      };
    };
    const pr = await fetchPullByNumber('o', 'r', 42, mockFetch, 'tok');
    assert.equal(pr.number, 42);
    assert.equal(pr.headRef, 'h');
  }

  // Autolink / magic link matching
  {
    const {
      matchAutolinksInText,
      buildAutolinkUrl,
      attachMagicLinks,
      fetchRepoAutolinks,
      fetchOpenPulls,
    } = require('../src/fetch-pulls.js');

    assert.equal(
      buildAutolinkUrl('https://linear.app/t/issue/ENG-<num>', '123'),
      'https://linear.app/t/issue/ENG-123'
    );

    const rules = [
      {
        key_prefix: 'ENG-',
        url_template: 'https://linear.app/acme/issue/ENG-<num>',
        is_alphanumeric: true,
      },
      {
        key_prefix: 'JIRA-',
        url_template: 'https://jira.example/browse/JIRA-<num>',
        is_alphanumeric: false,
      },
    ];

    const matches = matchAutolinksInText(
      'feat: ENG-42 improve stack (also JIRA-99 and ENG-42 again)',
      rules
    );
    assert.equal(matches.length, 2);
    assert.equal(matches[0].key, 'ENG-42');
    assert.equal(matches[0].url, 'https://linear.app/acme/issue/ENG-42');
    assert.equal(matches[1].key, 'JIRA-99');

    const attached = attachMagicLinks(
      [
        {
          number: 1,
          title: 'fix ENG-7',
          headRef: 'feat/ENG-7-foo',
          baseRef: 'main',
        },
        { number: 2, title: 'no ticket', headRef: 'misc', baseRef: 'main' },
      ],
      rules
    );
    assert.equal(attached[0].magicLinks.length, 1);
    assert.equal(attached[0].magicLinks[0].key, 'ENG-7');
    assert.equal(attached[1].magicLinks.length, 0);

    // Body-only token (title/branch have no key) → mapApiPullRequest + attachMagicLinks
    {
      const listPr = mapApiPullRequest({
        number: 3,
        title: 'no key in title',
        body: 'Closes ENG-99 and done',
        head: { ref: 'misc-branch' },
        base: { ref: 'main' },
        user: { login: 'dev' },
        draft: false,
        html_url: 'https://github.com/o/r/pull/3',
      });
      assert.equal(listPr.body, 'Closes ENG-99 and done');
      const withLinks = attachMagicLinks([listPr], rules);
      assert.equal(withLinks[0].magicLinks.length, 1);
      assert.equal(withLinks[0].magicLinks[0].key, 'ENG-99');
      assert.equal(
        withLinks[0].magicLinks[0].url,
        'https://linear.app/acme/issue/ENG-99'
      );
      // Modal enhance path: body HTML gets an anchor for the magic key
      const polish = require('../src/modal/lib/ui-polish.ts');
      const html = polish.enhanceMarkdownHtml('<p>Closes ENG-99 and done</p>', {
        owner: 'o',
        repo: 'r',
        magicLinks: withLinks[0].magicLinks,
      });
      assert.match(html, /href="https:\/\/linear\.app\/acme\/issue\/ENG-99"/);
      assert.match(html, /ENG-99/);
    }

    // fetchRepoAutolinks soft-fails
    const empty = await fetchRepoAutolinks('o', 'r', async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    }));
    assert.deepEqual(empty, []);

    // fetchOpenPulls attaches magic links when autolinks API works
    const mockFetch = async (url) => {
      if (url.includes('/autolinks')) {
        return {
          ok: true,
          json: async () => [
            {
              key_prefix: 'ENG-',
              url_template: 'https://ex.test/ENG-<num>',
              is_alphanumeric: true,
            },
          ],
        };
      }
      return {
        ok: true,
        json: async () => [
          {
            number: 5,
            title: 'ENG-88 work',
            head: { ref: 'f' },
            base: { ref: 'main' },
            user: { login: 'd' },
            draft: false,
            html_url: 'https://github.com/o/r/pull/5',
          },
        ],
      };
    };
    const prs = await fetchOpenPulls('o', 'r', mockFetch, { token: null });
    assert.equal(prs[0].magicLinks[0].key, 'ENG-88');
    assert.equal(prs[0].magicLinks[0].url, 'https://ex.test/ENG-88');
  }

  console.log('fetch-pulls.test.js: all assertions passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
