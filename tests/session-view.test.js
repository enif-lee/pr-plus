const assert = require('node:assert/strict');
const {
  sessionViewKey,
  serializeSessionView,
  parseSessionView,
  loadSessionView,
  saveSessionView,
  serializeOpenModal,
  parseOpenModal,
  saveOpenModal,
  loadOpenModal,
  clearOpenModal,
  OPEN_MODAL_KEY,
} = require('../src/modal/lib/session-view.ts');

assert.equal(sessionViewKey('Owner', 'Repo', 12), 'prp:view:owner/repo#12');

const snap = serializeSessionView({
  layoutMode: 'diff',
  diffMode: 'split',
  collapsedFiles: new Set(['a.js', 'b.js']),
  viewedPaths: ['a.js'],
  activeFilePath: 'a.js',
});
assert.equal(snap.layoutMode, 'diff');
assert.equal(snap.diffMode, 'split');
assert.deepEqual(snap.collapsedFiles.sort(), ['a.js', 'b.js']);
assert.deepEqual(snap.viewedPaths, ['a.js']);

const round = parseSessionView(JSON.stringify(snap));
assert.equal(round.layoutMode, 'diff');
assert.equal(round.diffMode, 'split');
assert.ok(round.collapsedFiles.includes('b.js'));

const mem = {
  data: {},
  getItem(k) {
    return this.data[k] ?? null;
  },
  setItem(k, v) {
    this.data[k] = String(v);
  },
  removeItem(k) {
    delete this.data[k];
  },
};
assert.equal(saveSessionView(mem, 'o', 'r', 3, snap), true);
const loaded = loadSessionView(mem, 'o', 'r', 3);
assert.equal(loaded.layoutMode, 'diff');
assert.equal(loaded.activeFilePath, 'a.js');
assert.equal(parseSessionView('nope'), null);
assert.equal(parseSessionView({ v: 2 }), null);

// Open-modal restore snapshot (page refresh)
{
  const openSnap = serializeOpenModal({
    owner: 'Acme',
    repo: 'app',
    number: 42,
    page: 'diff',
    position: 'c:900',
  });
  assert.equal(openSnap.owner, 'Acme');
  assert.equal(openSnap.number, 42);
  assert.equal(openSnap.page, 'diff');
  assert.equal(openSnap.position, 'c:900');
  assert.ok(openSnap.at > 0);
  assert.equal(serializeOpenModal({ owner: '', repo: 'x', number: 1 }), null);

  const parsed = parseOpenModal(JSON.stringify(openSnap));
  assert.deepEqual(
    {
      owner: parsed.owner,
      repo: parsed.repo,
      number: parsed.number,
      page: parsed.page,
      position: parsed.position,
    },
    { owner: 'Acme', repo: 'app', number: 42, page: 'diff', position: 'c:900' }
  );

  // Expired
  assert.equal(
    parseOpenModal(
      JSON.stringify({ ...openSnap, at: Date.now() - 999 * 24 * 3600 * 1000 }),
      { maxAgeMs: 1000 }
    ),
    null
  );

  assert.equal(saveOpenModal(mem, { owner: 'o', repo: 'r', number: 9 }), true);
  assert.ok(mem.data[OPEN_MODAL_KEY]);
  const loadedOpen = loadOpenModal(mem);
  assert.equal(loadedOpen.number, 9);
  clearOpenModal(mem);
  assert.equal(loadOpenModal(mem), null);
}

console.log('session-view.test.js: all assertions passed');
