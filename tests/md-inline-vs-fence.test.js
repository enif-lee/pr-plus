const assert = require('node:assert/strict');
const { marked } = require('marked');
marked.setOptions({ gfm: true, breaks: true });
// Reset configuration flag if re-run
delete marked.__prpHljsCodeConfigured;
globalThis.marked = marked;

const {
  renderMdHtml,
  normalizeFenceLang,
  highlightFenceCode,
  configureMarkedCodeHighlight,
  clearHighlightCodeCache,
  escapeHtml,
} = require('../src/modal/components/common/utils.tsx');

// Fence lang aliases
assert.equal(normalizeFenceLang('ts'), 'typescript');
assert.equal(normalizeFenceLang('js'), 'javascript');
assert.equal(normalizeFenceLang('c++'), 'cpp');
assert.equal(normalizeFenceLang('C#'), 'csharp');
assert.equal(normalizeFenceLang('shell'), 'bash');
assert.equal(normalizeFenceLang('yml'), 'yaml');
assert.equal(normalizeFenceLang('plaintext'), '');
assert.equal(normalizeFenceLang(''), '');

// Mock hljs for fence highlight path
globalThis.hljs = {
  langs: { javascript: {}, typescript: {} },
  getLanguage(name) {
    return this.langs[name] || null;
  },
  registerLanguage(name, def) {
    this.langs[name] = def || {};
  },
  highlight(text, opts) {
    return {
      value: `<span class="hljs-mock" data-lang="${opts.language}">${text}</span>`,
    };
  },
  highlightAuto(text) {
    return { value: `<span class="auto">${text}</span>` };
  },
};

clearHighlightCodeCache();
const fenceHl = highlightFenceCode('const x = 1', 'js');
assert.match(fenceHl, /hljs-mock/);
assert.match(fenceHl, /data-lang="javascript"/);

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

// Fenced ```js uses highlight path
clearHighlightCodeCache();
const jsFence = renderMdHtml('```js\nconst x = 1\n```');
assert.match(jsFence, /prp-md-code/, 'custom pre class');
assert.match(jsFence, /hljs/, 'hljs class on code');
assert.match(jsFence, /language-javascript|data-lang="javascript"/);
assert.match(jsFence, /hljs-mock/, 'syntax highlight applied');
assert.doesNotMatch(jsFence, /auto/, 'does not use highlightAuto for known lang');

// Unloaded lang escapes + still wraps fence
clearHighlightCodeCache();
const rustFence = renderMdHtml('```rust\nfn main() {}\n```');
assert.match(rustFence, /prp-md-code/);
assert.match(rustFence, /language-rust|data-lang="rust"/);
// rust not in mock langs → escaped body (no mock span until loaded)
assert.doesNotMatch(rustFence, /hljs-mock/);
assert.match(rustFence, /fn main/);

// After grammar registers, highlightFenceCode uses it
globalThis.hljs.registerLanguage('rust', () => ({}));
clearHighlightCodeCache();
assert.match(highlightFenceCode('fn main() {}', 'rust'), /hljs-mock/);

assert.equal(configureMarkedCodeHighlight(marked), true);
assert.equal(configureMarkedCodeHighlight(marked), true, 'idempotent');

console.log('md-inline-vs-fence.test.js: passed');
console.log('inline HTML:', inline);
console.log('fence HTML:', fence.slice(0, 120));
console.log('js-fence-highlight=true');
