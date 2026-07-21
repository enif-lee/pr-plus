const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCRATCH =
  process.env.PRP_SCRATCH ||
  '/var/folders/sl/km7nh7qj50b9mw4901n7ch940000gn/T/grok-goal-090750d025fa/implementer';
fs.mkdirSync(SCRATCH, { recursive: true });

const layout = require('../src/modal/pure/layout-mode.js');
const css = fs.readFileSync(
  path.join(__dirname, '../src/modal/styles.css'),
  'utf8'
);
const appSrc = fs.readFileSync(path.join(__dirname, '../src/modal/App.jsx'), 'utf8');

// Animation hooks in shipped CSS
assert.ok(css.includes('transition:'), 'css transitions present');
assert.ok(css.includes('prp-modal--diff'), 'diff layout class');
assert.ok(css.includes('prp-modal--centered'), 'centered layout class');
assert.ok(/280ms|cubic-bezier/.test(css), 'timing curve for expand/collapse');

// App drives layout mode + animation classes
assert.ok(appSrc.includes('LAYOUT_DIFF'));
assert.ok(appSrc.includes('prp-modal--animating'));
assert.ok(appSrc.includes('expandDiff') || appSrc.includes('setLayoutMode'));
assert.ok(appSrc.includes('FolderFileTree') || appSrc.includes('FileTree'));
assert.ok(appSrc.includes('VirtualDiff'));
assert.ok(appSrc.includes('MarkdownView') || appSrc.includes('marked'));
assert.ok(appSrc.includes('highlightCode') || appSrc.includes('hljs'));
assert.ok(appSrc.includes('navComment') || appSrc.includes('CommentNav'));

// Pure state transitions
assert.equal(layout.openDiffLayout(), 'diff');
assert.equal(layout.closeDiffLayout(), 'centered');
assert.ok(layout.layoutClassName('diff').includes('prp-modal--diff'));
assert.ok(layout.layoutClassName('centered').includes('prp-modal--centered'));

const log = [
  'pr-modal-diff-anim.test.js: animation + layout hooks present',
  'css-has-transition=true',
  'app-has-anim-class=true',
  `diff-class=${layout.layoutClassName('diff')}`,
].join('\n');
fs.writeFileSync(path.join(SCRATCH, 'pr-modal-diff-anim.log'), log + '\n');
console.log('pr-modal-diff-anim.test.js: all assertions passed');
console.log(log);
