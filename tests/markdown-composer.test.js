const assert = require('node:assert/strict');
const {
  splitMarkdownSegments,
  hasMermaidFence,
  detectMentionTrigger,
  detectSlashTrigger,
  filterMentions,
  filterSlashCommands,
  applyMentionInsertion,
  applySlashInsertion,
  SLASH_COMMANDS,
} = require('../src/modal/lib/markdown-composer.ts');

const md = 'Hello\n\n```mermaid\ngraph TD; A-->B;\n```\n\nAfter';
const segs = splitMarkdownSegments(md);
assert.ok(segs.some((s) => s.type === 'mermaid'));
assert.ok(segs.some((s) => s.type === 'md' && s.content.includes('Hello')));
const mermaid = segs.find((s) => s.type === 'mermaid');
assert.ok(mermaid.content.includes('graph TD'));
assert.equal(hasMermaidFence(md), true);
assert.equal(hasMermaidFence('no charts'), false);

const text = 'Hey @al';
const mTrig = detectMentionTrigger(text, text.length);
assert.ok(mTrig);
assert.equal(mTrig.query, 'al');
const mentions = filterMentions('al', ['alice', 'bob', 'albert']);
assert.deepEqual(mentions, ['alice', 'albert']);
const mIns = applyMentionInsertion(text, mTrig, 'alice');
assert.equal(mIns.text, 'Hey @alice ');

const slashText = '/ap';
const sTrig = detectSlashTrigger(slashText, slashText.length);
assert.ok(sTrig);
const cmds = filterSlashCommands('ap');
assert.ok(cmds.some((c) => c.id === 'approve'));
assert.ok(SLASH_COMMANDS.length >= 5);
const sIns = applySlashInsertion(slashText, sTrig, cmds[0]);
assert.ok(sIns.text.length > 0);
assert.ok(!sIns.text.startsWith('/ap') || sIns.text.includes('LGTM') || sIns.text.includes(cmds[0].insert.slice(0, 4)));

// Slash after newline mid-document
{
  const mid = 'Hello\n/nit';
  const t = detectSlashTrigger(mid, mid.length);
  assert.ok(t);
  assert.equal(t.query, 'nit');
  const nit = filterSlashCommands('nit')[0];
  assert.ok(nit);
  const applied = applySlashInsertion(mid, t, nit);
  assert.match(applied.text, /\*\*nit:\*\*/);
}

// Mention candidates objects + empty query
{
  const list = filterMentions('', [
    { login: 'alice' },
    { login: 'bob' },
    'carol',
  ]);
  assert.ok(list.includes('alice'));
  assert.ok(list.includes('bob'));
  assert.ok(list.includes('carol'));
  assert.ok(list.length <= 8);
}

// MarkdownComposer (shipped UI) must wire mention/slash helpers
{
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(
    path.join(__dirname, '../src/modal/components/common/MarkdownComposer.tsx'),
    'utf8'
  );
  assert.ok(src.includes('detectMentionTrigger'), 'MarkdownComposer wires @mention');
  assert.ok(src.includes('detectSlashTrigger'), 'MarkdownComposer wires /slash');
  assert.ok(src.includes('mentionCandidates'), 'MarkdownComposer accepts candidates');
  assert.ok(src.includes('prp-composer-menu'), 'MarkdownComposer renders suggestion menu');
  assert.ok(
    src.includes('applyMentionInsertion') && src.includes('applySlashInsertion'),
    'MarkdownComposer applies insertions'
  );
}

console.log('markdown-composer.test.js: all assertions passed');
console.log('markdown-composer-mention-slash=true');
