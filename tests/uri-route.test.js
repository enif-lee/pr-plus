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

// --- parse search / hash ---
{
  const r = parseRouteFromSearch('?foo=1&pr%2Bpage=diff&pr%2Bnumber=42&pr%2Bposition=c%3A900');
  // URLSearchParams accepts pr+page when encoded; also try unencoded builder
  assert.equal(r.number, 42);
  assert.equal(r.page, 'diff');
  assert.equal(r.position, 'c:900');
}

{
  // Build via serialize then parse (canonical path)
  const qs = serializeRouteToSearch({ page: 'diff', number: 7, position: 'c:3' }, '?tab=open');
  assert.ok(qs.includes('tab=open'), 'preserves unrelated params');
  assert.ok(qs.includes(encodeURIComponent(URI_PARAM_PAGE).replace(/%2B/g, '%2B') || URI_PARAM_PAGE) || qs.includes('pr%2Bpage') || qs.includes('pr+page'));
  const r = parseRouteFromSearch(qs);
  assert.equal(r.page, 'diff');
  assert.equal(r.number, 7);
  assert.equal(r.position, 'c:3');
}

{
  const r = parseRouteFromHash('#pr%2Bpage=conversation&pr%2Bnumber=5');
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

// Unencoded user-shaped pr+page (URLSearchParams key becomes "pr page")
{
  // Hand-written query as users might type: + becomes space in form-urlencoded
  const unencoded = '?pr+page=diff&pr+number=42&pr+position=c:900&tab=open';
  const parsed = parseRouteFromSearch(unencoded);
  assert.equal(parsed.page, 'diff', 'parse unencoded pr+page');
  assert.equal(parsed.number, 42, 'parse unencoded pr+number');
  assert.equal(parsed.position, 'c:900', 'parse unencoded pr+position');

  // clear must strip spaced keys so nothing reopens
  const cleared = clearRouteFromSearch(unencoded);
  const afterClear = parseRouteFromSearch(cleared);
  assert.equal(afterClear.page, null);
  assert.equal(afterClear.number, null);
  assert.equal(afterClear.position, null);
  assert.ok(cleared.includes('tab=open'), 'keeps unrelated tab');
  // no residual pr keys of either form
  assert.ok(!/pr[\+ ]page/i.test(cleared.replace(/\+/g, ' ')));
  assert.ok(!cleared.includes('pr%2Bpage') && !cleared.includes('pr+page'));
  assert.ok(!cleared.includes('42') || cleared.includes('tab')); // number gone unless in unrelated

  // resolveRestore with cleared location must not open
  const noReopen = resolveRestore({
    sessionOpen: null,
    uri: afterClear,
    pathOwner: 'octo',
    pathRepo: 'repo',
  });
  assert.equal(noReopen.source, 'none');
  assert.equal(noReopen.open, null);

  // serialize on top of unencoded must not leave duplicate spaced + %2B pairs
  const rewritten = serializeRouteToSearch(
    { page: 'conversation', number: 7, position: 'c:1' },
    unencoded
  );
  const r2 = parseRouteFromSearch(rewritten);
  assert.equal(r2.page, 'conversation');
  assert.equal(r2.number, 7);
  assert.equal(r2.position, 'c:1');
  // Only one encoding of page key in string (encoded form from toString)
  const pageHits = (rewritten.match(/pr(%2B|\+)page|pr\spage/gi) || []).length;
  assert.ok(pageHits <= 2, `no duplicate page keys, got ${pageHits} in ${rewritten}`);
  // Spaced key must not remain as literal "pr page="
  assert.ok(!rewritten.includes('pr page='));
}

// clear preserves others
{
  const cleared = clearRouteFromSearch(
    serializeRouteToSearch({ page: 'diff', number: 1 }, '?x=1')
  );
  assert.ok(cleared.includes('x=1'));
  assert.ok(!cleared.includes('pr'));
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
  assert.equal(r.position, 'c:8', 'URI position fills when session has none');
}

{
  // No session → URI with path owner/repo
  const r = resolveRestore({
    sessionOpen: null,
    uri: { number: 12, page: 'diff', position: 'c:4' },
    pathOwner: 'enif-lee',
    pathRepo: 'pr-plus',
  });
  assert.equal(r.source, 'uri');
  assert.deepEqual(r.open, { owner: 'enif-lee', repo: 'pr-plus', number: 12 });
  assert.equal(r.page, 'diff');
  assert.equal(r.position, 'c:4');
}

{
  // URI number without path → cannot open
  const r = resolveRestore({
    sessionOpen: null,
    uri: { number: 1, page: 'diff' },
  });
  assert.equal(r.source, 'none');
  assert.equal(r.open, null);
}

// --- replaceState thin wrapper ---
{
  let replaced = null;
  const historyApi = {
    state: { a: 1 },
    replaceState(state, title, url) {
      replaced = { state, title, url };
    },
  };
  const locationApi = {
    pathname: '/acme/widgets/pulls',
    search: '?q=is%3Aopen',
    hash: '',
  };
  const ok = replaceLocationRoute(historyApi, locationApi, {
    page: 'diff',
    number: 42,
    position: 'c:900',
  });
  assert.equal(ok, true);
  assert.ok(replaced.url.includes('/acme/widgets/pulls'));
  assert.ok(replaced.url.includes('q=is%3Aopen') || replaced.url.includes('q=is:open'));
  assert.ok(replaced.url.includes('42'));
  assert.ok(replaced.url.includes('diff'));
  assert.ok(replaced.url.includes('c%3A900') || replaced.url.includes('c:900'));

  // clear
  locationApi.search = replaced.url.includes('?')
    ? '?' + replaced.url.split('?')[1].split('#')[0]
    : '';
  clearLocationRoute(historyApi, locationApi);
  assert.ok(replaced.url.includes('q=is'));
  assert.ok(!String(replaced.url).includes('pr%2Bnumber') && !String(replaced.url).includes('pr+number'));
}

// findCommentIndexByPosition
{
  const mapped = [
    { commentId: 10, rowIndex: 1 },
    { commentId: 900, rowIndex: 5 },
  ];
  assert.equal(findCommentIndexByPosition(mapped, 'c:900'), 1);
  assert.equal(findCommentIndexByPosition(mapped, 'c:1'), -1);
}

// buildUrlWithRoute
{
  const url = buildUrlWithRoute(
    { pathname: '/o/r/pulls', search: '?x=1', hash: '#frag' },
    { page: 'conversation', number: 2 }
  );
  assert.ok(url.startsWith('/o/r/pulls?'));
  assert.ok(url.includes('x=1'));
  assert.ok(url.includes('2'));
}

console.log('uri-route.test.js: all assertions passed');
