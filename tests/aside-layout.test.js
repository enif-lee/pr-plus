/**
 * Conversation right-rail collapse helpers + structural UI wiring.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ASIDE_PREF_KEY,
  ASIDE_EXPANDED_WIDTH,
  ASIDE_COLLAPSED_WIDTH, // used in compact-width assertion
  toggleAsideCollapsed,
  serializeAsidePref,
  parseAsidePref,
  loadAsidePref,
  saveAsidePref,
  conversationGridTemplate,
  conversationAsideWidthPx,
} = require('../src/modal/lib/aside-layout.ts');

assert.equal(toggleAsideCollapsed(false), true);
assert.equal(toggleAsideCollapsed(true), false);
assert.equal(toggleAsideCollapsed(null), true);

assert.equal(parseAsidePref(null).collapsed, false);
assert.equal(parseAsidePref('{"v":1,"collapsed":true}').collapsed, true);
assert.equal(parseAsidePref(true).collapsed, true);
assert.equal(parseAsidePref('collapsed').collapsed, true);

const mem = {
  data: {},
  getItem(k) {
    return this.data[k] ?? null;
  },
  setItem(k, v) {
    this.data[k] = String(v);
  },
};
assert.equal(loadAsidePref(null).collapsed, false);
assert.equal(saveAsidePref(mem, { collapsed: true }), true);
assert.ok(mem.data[ASIDE_PREF_KEY]);
assert.equal(loadAsidePref(mem).collapsed, true);
assert.equal(saveAsidePref(mem, { collapsed: false }), true);
assert.equal(loadAsidePref(mem).collapsed, false);

assert.equal(
  conversationGridTemplate(false),
  `minmax(0, 1fr) 28px ${ASIDE_EXPANDED_WIDTH}px`
);
assert.equal(
  conversationGridTemplate(true),
  `minmax(0, 1fr) 28px ${ASIDE_COLLAPSED_WIDTH}px`
);
assert.equal(conversationAsideWidthPx(false), ASIDE_EXPANDED_WIDTH);
assert.equal(conversationAsideWidthPx(true), ASIDE_COLLAPSED_WIDTH);
assert.equal(ASIDE_COLLAPSED_WIDTH, 80);

// Round-trip serialize
const snap = serializeAsidePref({ collapsed: true });
assert.equal(parseAsidePref(snap).collapsed, true);

// Structural: ConversationView wires collapse control + compact rail
const root = path.join(__dirname, '..');
const conv = fs.readFileSync(
  path.join(root, 'src/modal/views/conversation/ConversationView.tsx'),
  'utf8'
);
assert.ok(conv.includes('prp-aside-collapse-btn'));
assert.ok(conv.includes('onToggleAside'));
assert.ok(conv.includes('AsideCompactRail'));
assert.ok(conv.includes('asideCollapsed'));
assert.ok(
  conv.includes('conversationAsideWidthPx') ||
    conv.includes('conversationGridTemplate')
);
assert.ok(conv.includes('saveAsidePref') && conv.includes('loadAsidePref'));

const compact = fs.readFileSync(
  path.join(root, 'src/modal/views/conversation/AsideCompactRail.tsx'),
  'utf8'
);
assert.ok(compact.includes('prp-aside-compact'));
assert.ok(compact.includes('Reviewers'));
assert.ok(compact.includes('Assignees'));
assert.ok(compact.includes('Checks'));
assert.ok(compact.includes('TipPopover'));
assert.ok(compact.includes('avatar-wrap--') || compact.includes('withStatusRing'));
assert.ok(compact.includes('Avatar'));
// Collapsed rail: omit empty groups (no empty-dot placeholders for reviewers/assignees)
assert.ok(
  compact.includes('reviewers.length') && compact.includes('assignees.length'),
  'compact rail gates reviewers/assignees on non-empty'
);
assert.ok(
  !compact.includes('No reviewers yet') && !compact.includes('No assignees'),
  'compact rail does not show empty-state copy for people groups'
);
// Milestone + tags follow the same non-empty gate
assert.ok(compact.includes('showMilestone') || compact.includes('Milestone'), 'milestone in compact');
assert.ok(compact.includes('tagItems') || compact.includes('Tags'), 'tags in compact');
assert.ok(compact.includes('tags') && compact.includes('prp-aside-compact__tag'), 'tag chips in compact');

const css = fs.readFileSync(path.join(root, 'src/modal/styles.css'), 'utf8');
assert.ok(css.includes('.prp-aside-collapse-btn'));
assert.ok(css.includes('.prp-conversation__splitter'));
assert.ok(css.includes('border-radius: 999px'));
assert.ok(css.includes('.prp-aside-compact'));
assert.ok(css.includes('.prp-aside-compact__avatar-wrap--ok'));
assert.ok(css.includes('.prp-aside-compact__more-circle'));
assert.ok(css.includes('.prp-conversation__aside--collapsed'));
assert.ok(css.includes('prp-scroll-float') || css.includes('prp-float-sb'), 'floating scrollbar');
assert.ok(ASIDE_COLLAPSED_WIDTH === 80, 'compact rail ~80px');
assert.ok(
  conv.includes('prp-conversation__splitter'),
  'collapse control lives on vertical splitter'
);
assert.ok(
  compact.includes('MAX_WHEN_OVERFLOW') || compact.includes('MAX_FULL_STACK') ||
    compact.includes('more-circle'),
  'overflow +circle for 5+ avatars'
);

console.log('aside-layout.test.js: all assertions passed');
console.log('aside-collapse-persist=true');
console.log('aside-compact-ui=true');
