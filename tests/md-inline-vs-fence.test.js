const assert = require('node:assert/strict');
const { marked } = require('marked');
marked.setOptions({ gfm: true, breaks: true });
globalThis.marked = marked;
const { renderMdHtml } = require('../src/modal/components/common/utils.tsx');

const inline = renderMdHtml('hello `inline_code` world');
assert.match(inline, /<code>/, 'inline produces code');
assert.doesNotMatch(inline, /<pre/, 'inline must not use pre');
assert.match(inline, /<p>/, 'inline lives in paragraph');

const alone = renderMdHtml('`alone`');
assert.match(alone, /<code>/);
assert.doesNotMatch(alone, /<pre/, 'solo codespan not pre');

const fence = renderMdHtml('```\nfenced\n```');
assert.match(fence, /<pre[\s>]/);
assert.match(fence, /<code/);

const mixed = renderMdHtml('before `inline` after\n\n```\nblock\n```');
assert.match(mixed, /<code>inline<\/code>/);
assert.match(mixed, /<pre[\s\S]*code/);

console.log('md-inline-vs-fence.test.js: passed');
console.log('inline HTML:', inline);
console.log('fence HTML:', fence.slice(0, 120));
