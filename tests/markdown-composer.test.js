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

console.log('markdown-composer.test.js: all assertions passed');
