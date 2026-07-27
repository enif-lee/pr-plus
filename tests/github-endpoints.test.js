/**
 * Unit tests for GitHub.com / Enterprise endpoint resolution.
 */
const assert = require('node:assert/strict');
const {
  normalizeHostname,
  isKnownGithubHostname,
  isGithubWebDocument,
  graphqlUrlFromRestBase,
  defaultEndpointsForWebHost,
  resolveGithubEndpoints,
  setGithubApiContext,
  getGithubApiContext,
  githubRestUrl,
  githubGraphqlUrl,
  normalizeEnterpriseWebHosts,
  contentScriptMatchesForHosts,
  selectTokenForWebHost,
  registerHostAccount,
  unregisterHostAccount,
  normalizeHostAccounts,
  hostsFromAccounts,
  createGithubApiExclusiveRunner,
  MAX_HOST_ACCOUNTS,
  DEFAULT_REST,
  DEFAULT_GRAPHQL,
} = require('../src/github-endpoints.js');

assert.equal(normalizeHostname('https://GitHub.Example.com/foo'), 'github.example.com');
assert.equal(normalizeHostname('github.com:443'), 'github.com');
assert.ok(isKnownGithubHostname('github.com'));
assert.ok(isKnownGithubHostname('www.github.com'));
assert.ok(isKnownGithubHostname('gist.github.com'));
// *.ghe.com requires explicit host registration — not auto-known
assert.equal(isKnownGithubHostname('acme.ghe.com'), false);
assert.equal(isKnownGithubHostname('gitlab.com'), false);
assert.equal(isKnownGithubHostname('github.mycorp.internal'), false);

// Document detection
{
  const { JSDOM } = require('jsdom');
  const ghe = new JSDOM(
    `<!doctype html><html><head>
      <meta name="github-keyboard-shortcuts" content="repo">
      <meta property="og:site_name" content="GitHub">
    </head><body></body></html>`,
    { url: 'https://github.mycorp.internal/org/repo/pulls' }
  );
  assert.ok(
    isGithubWebDocument(ghe.window.document, ghe.window.location),
    'GHE document with meta markers'
  );
  const plain = new JSDOM(`<!doctype html><html><body>hi</body></html>`, {
    url: 'https://example.com/',
  });
  assert.equal(
    isGithubWebDocument(plain.window.document, plain.window.location),
    false
  );
}

assert.equal(graphqlUrlFromRestBase(DEFAULT_REST), DEFAULT_GRAPHQL);
assert.equal(
  graphqlUrlFromRestBase('https://ghe.example.com/api/v3'),
  'https://ghe.example.com/api/graphql'
);
assert.equal(
  graphqlUrlFromRestBase('https://api.ghe.example.com'),
  'https://api.ghe.example.com/graphql'
);

{
  const d = defaultEndpointsForWebHost('github.com');
  assert.equal(d.restBase, DEFAULT_REST);
  assert.equal(d.graphqlUrl, DEFAULT_GRAPHQL);
  assert.equal(d.kind, 'dotcom');
}
{
  // GHES (self-hosted): same host + /api/v3 and /api/graphql
  const d = defaultEndpointsForWebHost('github.mycorp.com');
  assert.equal(d.restBase, 'https://github.mycorp.com/api/v3');
  assert.equal(d.graphqlUrl, 'https://github.mycorp.com/api/graphql');
  assert.equal(d.kind, 'ghes');
}
{
  // GHE Cloud: web octocorp.ghe.com → API api.octocorp.ghe.com (official EC docs)
  const d = defaultEndpointsForWebHost('octocorp.ghe.com');
  assert.equal(d.kind, 'ghe-cloud');
  assert.equal(d.restBase, 'https://api.octocorp.ghe.com');
  assert.equal(d.graphqlUrl, 'https://api.octocorp.ghe.com/graphql');
}

{
  const r = resolveGithubEndpoints({ webHost: 'github.mycorp.com' });
  assert.equal(r.restBase, 'https://github.mycorp.com/api/v3');
  assert.equal(r.graphqlUrl, 'https://github.mycorp.com/api/graphql');
}

// Stateless URL builders — pass explicit ctx (no mutable global)
{
  const gheCtx = {
    restBase: 'https://ghe.example.com/api/v3',
    graphqlUrl: 'https://ghe.example.com/api/graphql',
  };
  assert.equal(
    githubRestUrl('/repos/o/r/pulls', gheCtx),
    'https://ghe.example.com/api/v3/repos/o/r/pulls'
  );
  assert.equal(
    githubGraphqlUrl(gheCtx),
    'https://ghe.example.com/api/graphql'
  );
  // Without ctx → github.com defaults (stateless)
  assert.equal(
    githubRestUrl('/repos/o/r/pulls'),
    `${DEFAULT_REST}/repos/o/r/pulls`
  );
  assert.equal(githubGraphqlUrl(), DEFAULT_GRAPHQL);
  // setGithubApiContext is deprecated no-op store — returns normalized ctx only
  const fromSet = setGithubApiContext(gheCtx);
  assert.equal(fromSet.restBase, gheCtx.restBase);
  assert.equal(getGithubApiContext().restBase, DEFAULT_REST);
}

assert.deepEqual(
  normalizeEnterpriseWebHosts(['github.com', 'GHE.Corp.IO', 'ghe.corp.io', '']),
  ['ghe.corp.io']
);
assert.deepEqual(contentScriptMatchesForHosts(['ghe.corp.io']), [
  'https://ghe.corp.io/*',
]);

// Multi-account token selection
{
  const def = 'ghp_' + 'z'.repeat(36);
  const hostTok = 'ghp_' + 'a'.repeat(36);
  const accounts = [{ host: 'ghe.corp.io', token: hostTok }];

  const cloud = selectTokenForWebHost('github.com', {
    defaultToken: def,
    hostAccounts: accounts,
  });
  assert.equal(cloud.token, def);
  assert.equal(cloud.source, 'default');

  const reg = selectTokenForWebHost('ghe.corp.io', {
    defaultToken: def,
    hostAccounts: accounts,
  });
  assert.equal(reg.token, hostTok);
  assert.equal(reg.source, 'host');

  // unregistered *.ghe.com must NOT fall back to default PAT
  const unreg = selectTokenForWebHost('acme.ghe.com', {
    defaultToken: def,
    hostAccounts: accounts,
  });
  assert.equal(unreg.token, null);
  assert.equal(unreg.source, null);
}

// Max 3 hosts; update allowed when full
{
  assert.equal(MAX_HOST_ACCOUNTS, 3);
  let accounts = [];
  for (let i = 0; i < 3; i++) {
    const r = registerHostAccount(
      accounts,
      `h${i}.example.com`,
      'ghp_' + String(i).repeat(36)
    );
    assert.equal(r.ok, true);
    accounts = r.accounts;
  }
  const fourth = registerHostAccount(
    accounts,
    'h3.example.com',
    'ghp_' + 'x'.repeat(36)
  );
  assert.equal(fourth.ok, false);
  assert.match(fourth.error, /at most 3/i);

  const update = registerHostAccount(
    accounts,
    'h0.example.com',
    'ghp_' + 'y'.repeat(36)
  );
  assert.equal(update.ok, true);

  const removed = unregisterHostAccount(accounts, 'h1.example.com');
  assert.equal(removed.accounts.length, 2);
  assert.deepEqual(hostsFromAccounts(removed.accounts), [
    'h0.example.com',
    'h2.example.com',
  ]);
}

assert.deepEqual(
  normalizeHostAccounts([
    { host: 'https://GHE.Example.com/', token: 'ghp_' + 'a'.repeat(36) },
    { host: 'github.com', token: 'ghp_' + 'b'.repeat(36) },
  ]),
  [{ host: 'ghe.example.com', token: 'ghp_' + 'a'.repeat(36) }]
);

// Explicit ctx wins over process-global (safe for concurrent callers)
{
  setGithubApiContext({
    restBase: 'https://api.github.com',
    graphqlUrl: 'https://api.github.com/graphql',
  });
  const entCtx = {
    restBase: 'https://ghe.corp.io/api/v3',
    graphqlUrl: 'https://ghe.corp.io/api/graphql',
  };
  assert.equal(
    githubRestUrl('/repos/o/r/pulls', entCtx),
    'https://ghe.corp.io/api/v3/repos/o/r/pulls'
  );
  assert.equal(getGithubApiContext().restBase, 'https://api.github.com');
}

// Exclusive runner: concurrent setGithubApiContext + restUrl do not cross-clobber
async function testExclusiveApiContext() {
  const exclusive = createGithubApiExclusiveRunner();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const cloudEndpoints = {
    restBase: 'https://api.github.com',
    graphqlUrl: 'https://api.github.com/graphql',
  };
  const entEndpoints = {
    restBase: 'https://ghe.corp.io/api/v3',
    graphqlUrl: 'https://ghe.corp.io/api/graphql',
  };

  // Stateless concurrent handlers: each passes its own ctx — no race even when
  // exclusive runner is a no-op pass-through.
  const urls = [];
  const jobCloud = exclusive(async () => {
    await sleep(20);
    urls.push(['cloud', githubRestUrl('/repos/o/r', cloudEndpoints)]);
  });
  const jobEnt = exclusive(async () => {
    await sleep(5);
    urls.push(['ent', githubRestUrl('/repos/o/r', entEndpoints)]);
  });
  await Promise.all([jobCloud, jobEnt]);
  // Completion order may vary; membership must be correct
  assert.equal(urls.length, 2);
  const by = Object.fromEntries(urls);
  assert.equal(by.cloud, 'https://api.github.com/repos/o/r');
  assert.equal(by.ent, 'https://ghe.corp.io/api/v3/repos/o/r');
}

testExclusiveApiContext()
  .then(() => {
    console.log('github-endpoints.test.js: all assertions passed');
    console.log('github-endpoints=true');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
