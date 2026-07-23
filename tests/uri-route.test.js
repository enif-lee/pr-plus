const assert = require('node:assert/strict');
const {
  URI_PARAM_PAGE,
  URI_PARAM_NUMBER,
  URI_PARAM_POSITION,
  normalizePage,
  buildPositionFromComment,
  parsePosition,
  parseRouteFromSearch,
  parseRouteFromHash,
  parseLocationRoute,
  mergeRoutes,
  serializeRouteToSearch,
  clearRouteFromSearch,
  buildUrlWithRoute,
  replaceLocationRoute,
  clearLocationRoute,
  resolveRestore,
  findCommentIndexByPosition,
} = require('../src/modal/lib/uri-route.ts');

// Canonical prefix is prp_
assert.equal(URI_PARAM_PAGE, 'prp_page');
assert.equal(URI_PARAM_NUMBER, 'prp_number');
assert.equal(URI_PARAM_POSITION, 'prp_position');

// --- normalize / position ---
assert.equal(normalizePage('diff'), 'diff');
assert.equal(normalizePage('centered'), 'conversation');
assert.equal(normalizePage('nope'), null);

assert.equal(buildPositionFromComment({ id: 900 }), 'c:900');
assert.equal(buildPositionFromComment({ commentId: 12 }), 'c:12');
assert.equal(buildPositionFromComment({ id: 'tmp-optimistic' }), null);
assert.equal(buildPositionFromComment(null), null);

assert.deepEqual(parsePosition('c:42'), { kind: 'comment', id: '42' });
assert.deepEqual(parsePosition('#c:99'), { kind: 'comment', id: '99' });
assert.deepEqual(parsePosition('100'), { kind: 'comment', id: '100' });
assert.equal(parsePosition('tmp-1'), null);

// --- parse search / hash (prp_) ---
{
  const r = parseRouteFromSearch(
    '?foo=1&prp_page=diff&prp_number=42&prp_position=c%3A900'
  );
  assert.equal(r.number, 42);
  assert.equal(r.page, 'diff');
  assert.equal(r.position, 'c:900');
}

{
  // Build via serialize then parse (canonical path)
  const qs = serializeRouteToSearch(
    { page: 'diff', number: 7, position: 'c:3' },
    '?tab=open'
  );
  assert.ok(qs.includes('tab=open'), 'preserves unrelated params');
  assert.ok(qs.includes('prp_page') || qs.includes(URI_PARAM_PAGE));
  assert.ok(!qs.includes('pr+page') && !qs.includes('pr%2Bpage'));
  const r = parseRouteFromSearch(qs);
  assert.equal(r.page, 'diff');
  assert.equal(r.number, 7);
  assert.equal(r.position, 'c:3');
}

{
  const r = parseRouteFromHash('#prp_page=conversation&prp_number=5');
  assert.equal(r.page, 'conversation');
  assert.equal(r.number, 5);
}

{
  // Bare hash position
  const r = parseRouteFromHash('#c:55');
  assert.equal(r.position, 'c:55');
}

{
  // Query primary, hash fills gap
  const r = parseLocationRoute({
    search: `?${URI_PARAM_NUMBER}=10`,
    hash: `#${URI_PARAM_PAGE}=diff&${URI_PARAM_POSITION}=c:1`,
  });
  assert.equal(r.number, 10);
  assert.equal(r.page, 'diff');
  assert.equal(r.position, 'c:1');
}

// Missing / only-number
{
  const onlyNum = parseLocationRoute({ search: `?${URI_PARAM_NUMBER}=99` });
  assert.equal(onlyNum.number, 99);
  assert.equal(onlyNum.page, null);
  assert.equal(onlyNum.position, null);
}

// Legacy pr+* still parses; clear/write migrate away
{
  const unencoded = '?pr+page=diff&pr+number=42&pr+position=c:900&tab=open';
  const parsed = parseRouteFromSearch(unencoded);
  assert.equal(parsed.page, 'diff', 'parse legacy pr+page');
  assert.equal(parsed.number, 42, 'parse legacy pr+number');
  assert.equal(parsed.position, 'c:900', 'parse legacy pr+position');

  const cleared = clearRouteFromSearch(unencoded);
  const afterClear = parseRouteFromSearch(cleared);
  assert.equal(afterClear.page, null);
  assert.equal(afterClear.number, null);
  assert.equal(afterClear.position, null);
  assert.ok(cleared.includes('tab=open'), 'keeps unrelated tab');
  assert.ok(!/pr[\+_ ]page/i.test(cleared.replace(/\+/g, ' ')));
  assert.ok(!cleared.includes('pr%2Bpage') && !cleared.includes('pr+page'));
  assert.ok(!cleared.includes('prp_page'));

  const noReopen = resolveRestore({
    sessionOpen: null,
    uri: afterClear,
    pathOwner: 'octo',
    pathRepo: 'repo',
  });
  assert.equal(noReopen.source, 'none');
  assert.equal(noReopen.open, null);

  // serialize on top of legacy rewrites to prp_*
  const rewritten = serializeRouteToSearch(
    { page: 'conversation', number: 7, position: 'c:1' },
    unencoded
  );
  const r2 = parseRouteFromSearch(rewritten);
  assert.equal(r2.page, 'conversation');
  assert.equal(r2.number, 7);
  assert.equal(r2.position, 'c:1');
  assert.ok(rewritten.includes('prp_page') || rewritten.includes(URI_PARAM_PAGE));
  assert.ok(!rewritten.includes('pr page='));
  assert.ok(!rewritten.includes('pr+page'));
}

// clear preserves others
{
  const cleared = clearRouteFromSearch(
    serializeRouteToSearch({ page: 'diff', number: 1 }, '?x=1')
  );
  assert.ok(cleared.includes('x=1'));
  assert.ok(!cleared.includes('prp_'));
  assert.ok(!cleared.includes('pr+'));
}

// mergeRoutes
{
  const m = mergeRoutes({ number: 1, page: null }, { page: 'diff', position: 'c:2' });
  assert.equal(m.number, 1);
  assert.equal(m.page, 'diff');
  assert.equal(m.position, 'c:2');
}

// --- resolveRestore: session > URI ---
{
  const sessionWins = resolveRestore({
    sessionOpen: {
      owner: 'Acme',
      repo: 'app',
      number: 42,
      page: 'diff',
      position: 'c:900',
    },
    uri: { number: 99, page: 'conversation', position: 'c:1' },
    pathOwner: 'other',
    pathRepo: 'x',
  });
  assert.equal(sessionWins.source, 'session');
  assert.equal(sessionWins.open.number, 42);
  assert.equal(sessionWins.open.owner, 'Acme');
  assert.equal(sessionWins.page, 'diff');
  assert.equal(sessionWins.position, 'c:900');
}

{
  // Session open without page → fall back to sessionView layout, then URI
  const r = resolveRestore({
    sessionOpen: { owner: 'o', repo: 'r', number: 3 },
    sessionView: { layoutMode: 'diff' },
    uri: { page: 'conversation', position: 'c:8' },
  });
  assert.equal(r.source, 'session');
  assert.equal(r.page, 'diff');
  assert.equal(r.position, 'c:8');
}

{
  // URI-only restore needs path owner/repo
  const r = resolveRestore({
    sessionOpen: null,
    uri: { number: 11, page: 'conversation', position: 'c:2' },
    pathOwner: 'octo',
    pathRepo: 'hello',
  });
  assert.equal(r.source, 'uri');
  assert.equal(r.open.number, 11);
  assert.equal(r.open.owner, 'octo');
  assert.equal(r.page, 'conversation');
}

{
  const none = resolveRestore({
    sessionOpen: null,
    uri: { number: 11 },
    pathOwner: '',
    pathRepo: '',
  });
  assert.equal(none.source, 'none');
}

// findCommentIndexByPosition
{
  const list = [{ id: 1 }, { commentId: 42 }, { id: 'x' }];
  assert.equal(findCommentIndexByPosition(list, 'c:42'), 1);
  assert.equal(findCommentIndexByPosition(list, 'c:99'), -1);
}

// replace / clear location
{
  const hist = {
    state: null,
    replaceState(state, _t, url) {
      this.state = state;
      this.url = url;
    },
  };
  const loc = { pathname: '/o/r/pulls', search: '?q=1', hash: '' };
  assert.equal(
    replaceLocationRoute(hist, loc, { page: 'diff', number: 9, position: 'c:1' }),
    true
  );
  assert.ok(String(hist.url).includes('prp_page=diff'));
  assert.ok(String(hist.url).includes('prp_number=9'));
  loc.search = hist.url.includes('?') ? `?${hist.url.split('?')[1]}` : '';
  assert.equal(clearLocationRoute(hist, loc), true);
  assert.ok(!String(hist.url).includes('prp_'));
  assert.ok(String(hist.url).includes('q=1') || String(hist.url).endsWith('/pulls'));
}

{
  const url = buildUrlWithRoute(
    { pathname: '/a/b/pulls', search: '?x=1', hash: '#y' },
    { page: 'conversation', number: 2 },
    {}
  );
  assert.ok(url.includes('prp_page=conversation'));
  assert.ok(url.includes('prp_number=2'));
  assert.ok(url.includes('x=1'));
}

console.log('uri-route.test.js: all assertions passed');
console.log('uri-prefix-prp_=true');
console.log('uri-legacy-pr-plus-clears=true');
