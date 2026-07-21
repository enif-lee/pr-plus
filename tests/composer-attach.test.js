const assert = require('node:assert/strict');
const {
  buildAttachmentMarkdown,
  insertMarkdownAtCursor,
  guessContentType,
  mergeDetailPreserveOptimistic,
  buildAssetRepoPath,
} = require('../src/modal/lib/composer-attach.ts');

// Attachment markdown
assert.equal(
  buildAttachmentMarkdown('shot.png', 'https://cdn.example/a.png', { isImage: true }),
  '![shot.png](https://cdn.example/a.png)'
);
assert.equal(
  buildAttachmentMarkdown('notes.pdf', 'https://cdn.example/n.pdf', { isImage: false }),
  '[notes.pdf](https://cdn.example/n.pdf)'
);
assert.ok(buildAttachmentMarkdown('x.png', 'https://x/y.png').startsWith('!['));

// Cursor insert
const ins = insertMarkdownAtCursor('hello', 5, '![a](u)');
assert.equal(ins.text, 'hello\n![a](u)');
assert.ok(ins.cursor >= ins.text.length - 1);

const mid = insertMarkdownAtCursor('ab', 1, 'X');
assert.equal(mid.text, 'a\nX\nb');

// Content type
assert.equal(guessContentType('a.png'), 'image/png');
assert.equal(guessContentType('a.jpg'), 'image/jpeg');
assert.equal(guessContentType('a.bin'), 'application/octet-stream');
assert.equal(guessContentType('x', 'image/webp'), 'image/webp');

// Asset path
const p = buildAssetRepoPath('My Photo!.png');
assert.ok(p.startsWith('.pr-plus-assets/'));
assert.ok(p.includes('My_Photo_.png') || p.includes('Photo'));

// Optimistic merge: host refresh must NOT drop optimistic reply
const prev = {
  number: 1,
  comments: [{ id: 10, body: 'issue' }],
  reviewComments: [
    { id: 100, body: 'root', path: 'a.ts', line: 1 },
    { id: 'tmp-optimistic', body: 'reply flash', inReplyToId: 100 },
  ],
};
const next = {
  number: 1,
  comments: [{ id: 10, body: 'issue' }],
  reviewComments: [{ id: 100, body: 'root', path: 'a.ts', line: 1 }],
};
const merged = mergeDetailPreserveOptimistic(prev, next);
assert.ok(Array.isArray(merged.reviewComments));
assert.ok(
  merged.reviewComments.some((c) => String(c.id) === 'tmp-optimistic'),
  'optimistic reply must survive host rehydrate'
);
assert.ok(merged.reviewComments.some((c) => String(c.id) === '100'));

// Host wins on shared id but keeps threadNodeId from optimistic if missing
const prev2 = {
  reviewComments: [{ id: 5, body: 'old', threadNodeId: 'TH_1' }],
  comments: [],
};
const next2 = {
  reviewComments: [{ id: 5, body: 'new from host' }],
  comments: [],
};
const m2 = mergeDetailPreserveOptimistic(prev2, next2);
const row = m2.reviewComments.find((c) => String(c.id) === '5');
assert.equal(row.body, 'new from host');
assert.equal(row.threadNodeId, 'TH_1');

// Host-only comments kept
const m3 = mergeDetailPreserveOptimistic(
  { reviewComments: [], comments: [{ id: 1, body: 'a' }] },
  { reviewComments: [{ id: 9, body: 'r' }], comments: [{ id: 2, body: 'b' }] }
);
assert.equal(m3.comments.length, 2);
assert.equal(m3.reviewComments.length, 1);

console.log('composer-attach.test.js: all assertions passed');
