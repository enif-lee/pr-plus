/**
 * Unit tests for GitHub-native PR route parse/build (shipped pure module).
 * Round-trips path, #diff-…R, single sha, and a..b range.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  normalizeGithubFilePath,
  sha256HexUtf8,
  githubDiffFileKey,
  buildGithubDiffHash,
  parseGithubDiffHash,
  parseGithubPrPath,
  buildGithubPrPath,
  buildGithubPrLocation,
  buildGithubPrHref,
  replaceGithubPrLocation,
  parseGithubPrLocation,
  commitFilterFromGithubRoute,
  githubCommitsFromFilter,
  githubSelectionFields,
  findFilePathByDiffKey,
} = require('../src/modal/lib/github-pr-route.ts');

// --- file key = sha256(path) matches Node crypto ---
{
  const path = 'src/foo/bar.ts';
  const expected = crypto.createHash('sha256').update(path, 'utf8').digest('hex');
  assert.equal(githubDiffFileKey(path), expected);
  assert.equal(sha256HexUtf8(path), expected);
  assert.equal(githubDiffFileKey('/' + path), expected, 'strip leading slash');
  assert.equal(normalizeGithubFilePath('\\a\\b'), 'a/b');
}

// Known objective-style key shapes (64 hex)
{
  const key = githubDiffFileKey('package.json');
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(findFilePathByDiffKey(['package.json', 'src/x.ts'], key), 'package.json');
  assert.equal(findFilePathByDiffKey([{ filename: 'src/x.ts' }], key), null);
}

// --- #diff- hash build/parse ---
{
  const filePath = 'src/modal/lib/page-embed.ts';
  const key = githubDiffFileKey(filePath);
  const single = buildGithubDiffHash({
    filePath,
    startLine: 26,
    endLine: 26,
    side: 'RIGHT',
  });
  assert.equal(single, `#diff-${key}R26`);
  const parsed = parseGithubDiffHash(single);
  assert.ok(parsed);
  assert.equal(parsed.fileKey, key);
  assert.equal(parsed.startLine, 26);
  assert.equal(parsed.endLine, 26);
  assert.equal(parsed.side, 'RIGHT');
}

{
  const filePath = 'app/server.go';
  const key = githubDiffFileKey(filePath);
  const multi = buildGithubDiffHash({
    filePath,
    startLine: 26,
    endLine: 32,
  });
  assert.equal(multi, `#diff-${key}R26-R32`);
  const parsed = parseGithubDiffHash(multi);
  assert.equal(parsed.startLine, 26);
  assert.equal(parsed.endLine, 32);
}

{
  // LEFT side
  const key = githubDiffFileKey('a.txt');
  const h = buildGithubDiffHash({
    fileKey: key,
    startLine: 10,
    endLine: 12,
    side: 'LEFT',
  });
  assert.equal(h, `#diff-${key}L10-L12`);
  assert.equal(parseGithubDiffHash(h).side, 'LEFT');
}

{
  // File-only anchor
  const key = githubDiffFileKey('README.md');
  assert.equal(buildGithubDiffHash({ filePath: 'README.md' }), `#diff-${key}`);
  const p = parseGithubDiffHash(`#diff-${key}`);
  assert.equal(p.startLine, null);
}

assert.equal(parseGithubDiffHash(''), null);
assert.equal(parseGithubDiffHash('#not-diff'), null);

// --- path parse/build conversation vs changes ---
{
  const conv = parseGithubPrPath('/rtzr/callabo-server/pull/2483');
  assert.ok(conv);
  assert.equal(conv.page, 'conversation');
  assert.equal(conv.number, 2483);
  assert.equal(conv.commitSha, null);
  assert.equal(
    buildGithubPrPath({
      owner: 'rtzr',
      repo: 'callabo-server',
      number: 2483,
      page: 'conversation',
    }),
    '/rtzr/callabo-server/pull/2483'
  );
}

{
  const files = parseGithubPrPath('/o/r/pull/1/files');
  assert.equal(files.page, 'diff');
  assert.equal(files.tab, 'files');
  // Write always uses /changes
  assert.equal(
    buildGithubPrPath({ owner: 'o', repo: 'r', number: 1, page: 'diff' }),
    '/o/r/pull/1/changes'
  );
}

{
  const changes = parseGithubPrPath('/o/r/pull/9/changes');
  assert.equal(changes.page, 'diff');
  assert.equal(changes.tab, 'changes');
  assert.equal(changes.commitSha, null);
}

// Single commit
{
  const sha = 'f334fbf918447bb285d5639b7e58f8974f21f926';
  const p = parseGithubPrPath(`/rtzr/callabo-server/pull/2483/changes/${sha}`);
  assert.equal(p.page, 'diff');
  assert.equal(p.commitSha, sha);
  assert.equal(p.commitEndSha, null);
  assert.equal(
    buildGithubPrPath({
      owner: 'rtzr',
      repo: 'callabo-server',
      number: 2483,
      page: 'diff',
      commitSha: sha,
    }),
    `/rtzr/callabo-server/pull/2483/changes/${sha}`
  );
}

// Range a..b
{
  const a = '1c80998c68f94d575ce97bf03f98e463b86aec6f';
  const b = 'ae9d7dd052bf4347b2ee1f5d4823aaf84efc04ed';
  const path = `/rtzr/callabo-server/pull/2483/changes/${a}..${b}`;
  const p = parseGithubPrPath(path);
  assert.equal(p.commitSha, a);
  assert.equal(p.commitEndSha, b);
  assert.equal(
    buildGithubPrPath({
      owner: 'rtzr',
      repo: 'callabo-server',
      number: 2483,
      page: 'diff',
      commitSha: a,
      commitEndSha: b,
    }),
    path
  );
}

// Non-targets
assert.equal(parseGithubPrPath('/o/r/pull/1/commits'), null);
assert.equal(parseGithubPrPath('/o/r/pulls'), null);

// --- full location + selection + filter round-trip ---
{
  const filePath = 'lib/handler.go';
  const key = githubDiffFileKey(filePath);
  const a = '1c80998c68f94d575ce97bf03f98e463b86aec6f';
  const b = 'ae9d7dd052bf4347b2ee1f5d4823aaf84efc04ed';
  const route = {
    owner: 'rtzr',
    repo: 'callabo-server',
    number: 2483,
    page: 'diff',
    commitSha: a,
    commitEndSha: b,
    filePath,
    startLine: 15,
    endLine: 18,
    side: 'RIGHT',
  };
  const { pathname, hash } = buildGithubPrLocation(route);
  assert.equal(pathname, `/rtzr/callabo-server/pull/2483/changes/${a}..${b}`);
  assert.equal(hash, `#diff-${key}R15-R18`);

  const href = buildGithubPrHref(route, '?prp_page=diff&other=1');
  assert.ok(href.includes('/changes/'));
  assert.ok(href.includes('#diff-'));
  assert.ok(!href.includes('prp_page'), 'strips prp_* on GH write');
  assert.ok(href.includes('other=1'), 'keeps unrelated query');

  const parsed = parseGithubPrLocation({ pathname, hash });
  assert.equal(parsed.owner, 'rtzr');
  assert.equal(parsed.page, 'diff');
  assert.equal(parsed.commitSha, a);
  assert.equal(parsed.commitEndSha, b);
  assert.equal(parsed.fileKey, key);
  assert.equal(parsed.startLine, 15);
  assert.equal(parsed.endLine, 18);
  assert.equal(findFilePathByDiffKey([filePath], parsed.fileKey), filePath);
}

// Single commit + line selection (objective example shape)
{
  const sha = 'f334fbf918447bb285d5639b7e58f8974f21f926';
  const filePath = 'pkg/x.go';
  const key = githubDiffFileKey(filePath);
  const loc = buildGithubPrLocation({
    owner: 'rtzr',
    repo: 'callabo-server',
    number: 2483,
    page: 'diff',
    commitSha: sha,
    filePath,
    startLine: 279,
    endLine: 281,
  });
  assert.equal(
    loc.pathname,
    `/rtzr/callabo-server/pull/2483/changes/${sha}`
  );
  assert.equal(loc.hash, `#diff-${key}R279-R281`);
  const back = parseGithubPrLocation(loc);
  assert.equal(back.commitSha, sha);
  assert.equal(back.startLine, 279);
  assert.equal(back.endLine, 281);
}

// --- commit filter ↔ route ---
{
  assert.deepEqual(commitFilterFromGithubRoute({}), { mode: 'all' });
  assert.deepEqual(commitFilterFromGithubRoute({ commitSha: 'abc1234' }), {
    mode: 'single',
    sha: 'abc1234',
  });
  assert.deepEqual(
    commitFilterFromGithubRoute({
      commitSha: 'aaa',
      commitEndSha: 'bbb',
    }),
    { mode: 'range', sha: 'aaa', endSha: 'bbb' }
  );
  assert.deepEqual(githubCommitsFromFilter({ mode: 'all' }), {
    commitSha: null,
    commitEndSha: null,
  });
  assert.deepEqual(
    githubCommitsFromFilter({ mode: 'single', sha: 'deadbeef' }),
    { commitSha: 'deadbeef', commitEndSha: null }
  );
  assert.deepEqual(
    githubCommitsFromFilter({
      mode: 'range',
      sha: 'aaa',
      endSha: 'bbb',
    }),
    { commitSha: 'aaa', commitEndSha: 'bbb' }
  );
}

// --- selection fields ---
{
  const f = githubSelectionFields({
    filePath: 'a.ts',
    anchorLine: 32,
    headLine: 26,
    anchorSide: 'RIGHT',
    headSide: 'RIGHT',
  });
  assert.equal(f.startLine, 26);
  assert.equal(f.endLine, 32);
  assert.equal(f.filePath, 'a.ts');
}

// parseGithubPrLocation without #diff- nulls selection fields (soft-nav clear)
{
  const withSel = parseGithubPrLocation({
    pathname: '/o/r/pull/1/changes/abc1234',
    hash: `#diff-${githubDiffFileKey('x.ts')}R10-R12`,
  });
  assert.equal(withSel.startLine, 10);
  assert.ok(withSel.fileKey);

  const clean = parseGithubPrLocation({
    pathname: '/o/r/pull/1',
    hash: '',
  });
  assert.equal(clean.page, 'conversation');
  assert.equal(clean.fileKey, null);
  assert.equal(clean.startLine, null);
  assert.equal(clean.endLine, null);
  assert.equal(clean.filePath, null);
  assert.equal(clean.commitSha, null);
}

// --- replaceState ---
{
  const calls = [];
  const historyApi = {
    state: { x: 1 },
    replaceState(state, title, url) {
      calls.push({ state, title, url });
    },
  };
  const locationApi = {
    pathname: '/rtzr/callabo-server/pull/2483',
    search: '?prp_page=diff',
    hash: '',
  };
  const ok = replaceGithubPrLocation(historyApi, locationApi, {
    owner: 'rtzr',
    repo: 'callabo-server',
    number: 2483,
    page: 'diff',
    filePath: 'x.go',
    startLine: 1,
    endLine: 3,
  });
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes('/pull/2483/changes'));
  assert.ok(calls[0].url.includes('#diff-'));
  assert.ok(!calls[0].url.includes('prp_page'));
}

console.log('github-pr-route.test.js: all assertions passed');
