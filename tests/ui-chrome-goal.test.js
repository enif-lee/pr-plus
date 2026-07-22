/**
 * Structure + pure checks for PR chrome goal:
 * conversation reply wiring, unified header, Diff toolbar, commit SearchableSelect range.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  resolveCompareRange,
  normalizeDiffCommitFilter,
  buildCommitFilterOptions,
  isAllCommitsFilter,
} = require('../src/modal/lib/diff-commit-filter.ts');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const header = read('src/modal/views/chrome/Header.tsx');
const conv = read('src/modal/views/conversation/ConversationView.tsx');
const app = read('src/modal/app/PrModalApp.tsx');
const toolbar = read('src/modal/views/chrome/DiffToolbar.tsx');
const commitFilter = read('src/modal/views/diff/DiffCommitFilter.tsx');
const pen = read('src/modal/components/common/PenIcon.tsx');
const css = read('src/modal/styles.css');
const bundle = read('src/modal/dist/pr-modal.bundle.js');

// --- (a) conversation reply wiring ---
assert.ok(conv.includes('onReplyToThread'), 'ConversationView accepts onReplyToThread');
assert.ok(conv.includes('Reply to thread') || conv.includes('Reply'), 'reply CTA');
assert.ok(
  conv.includes('prp-conversation-thread__composer') ||
    conv.includes('timeline-review-thread'),
  'reply composer lives inside thread box'
);
assert.ok(app.includes('onReplyToThread={onReplyToThread}'), 'App wires reply to ConversationView');
assert.ok(app.includes('replyToReviewComment'), 'uses review reply API');
assert.ok(
  /mode:\s*['"]pending['"]/.test(app) || app.includes("mode === 'pending'"),
  'reply supports pending vs comment modes'
);

// --- (b) Header two-row contract, same for shells ---
assert.ok(header.includes('prp-header--unified') || header.includes('prp-header__row--primary'));
assert.ok(header.includes('prp-header__row--primary'), 'row 1 primary');
assert.ok(header.includes('prp-header__row--secondary'), 'row 2 secondary');
assert.ok(header.includes('prp-header__number'), 'number on header');
assert.ok(header.includes('prp-header__title'), 'title on header');
assert.ok(header.includes('prp-header__checks') || header.includes('checks:'), 'checks on header');
assert.ok(header.includes('prp-header__stats'), 'stats on header');
assert.ok(header.includes('prp-branch-split'), 'branch on header');
assert.ok(header.includes('prp-header__actions'), 'actions on header');
// Live (non-skeleton) block: primary row holds checks + stats before secondary
const liveStart = header.indexOf('return (\n    <header className="prp-header prp-header--unified"');
const live = liveStart >= 0 ? header.slice(liveStart) : header;
const primaryLive = live.indexOf('prp-header__row--primary');
const secondaryLive = live.indexOf('prp-header__row--secondary');
const checksLive = live.indexOf('prp-header__checks');
const statsLive = live.indexOf('prp-header__stats');
assert.ok(primaryLive >= 0 && secondaryLive > primaryLive, 'primary before secondary in live header');
assert.ok(checksLive > primaryLive && checksLive < secondaryLive, 'checks on primary row');
assert.ok(statsLive > primaryLive && statsLive < secondaryLive, 'stats on primary row');
// No shell-specific header fork
assert.ok(!header.includes('if (shellMode ==='), 'no shell mode layout fork');
assert.ok(header.includes('data-shell={shellMode}'), 'shell attr only for styling hooks');

// --- (c) pen icon not ✎ on header edits ---
assert.ok(pen.includes('prp-pen-icon') || pen.includes('viewBox'), 'PenIcon component');
assert.ok(header.includes('PenIcon'), 'Header uses PenIcon');
assert.ok(!header.includes('✎'), 'Header has no ✎ glyph');

// --- (d) Diff toolbar consolidates controls, no checks ---
assert.ok(toolbar.includes('prp-diff-toolbar'), 'DiffToolbar root');
assert.ok(toolbar.includes('Files') || toolbar.includes('fileNav'), 'files nav toggle');
assert.ok(toolbar.includes('SearchableSelect'), 'commit SearchableSelect');
assert.ok(toolbar.includes('Unified') && toolbar.includes('Split'), 'view mode');
assert.ok(toolbar.includes('onPrevComment') || toolbar.includes('Prev'), 'comment nav');
assert.ok(toolbar.includes('pending') || toolbar.includes('Pending'), 'pending review');
assert.ok(!/checks:\s*\{/.test(toolbar) && !toolbar.includes('checks.state'), 'no checks in Diff toolbar');
assert.ok(app.includes('DiffToolbar'), 'App mounts DiffToolbar');
assert.ok(!app.includes('<DiffChrome'), 'DiffChrome strip not mounted in App');

// --- (e) commit filter pure + SearchableSelect range path ---
const commits = [
  { sha: 'aaa1111', message: 'first' },
  { sha: 'bbb2222', message: 'second' },
  { sha: 'ccc3333', message: 'third' },
];
const single = resolveCompareRange(commits, 'main', { mode: 'single', sha: 'bbb2222' });
assert.ok(single);
assert.equal(single.base, 'aaa1111');
assert.equal(single.head, 'bbb2222');

const range = resolveCompareRange(commits, 'main', {
  mode: 'range',
  sha: 'aaa1111',
  endSha: 'ccc3333',
});
assert.ok(range);
assert.equal(range.base, 'main');
assert.equal(range.head, 'ccc3333');
assert.ok(range.label.includes('3') || range.label.includes('…'));

const opts = buildCommitFilterOptions(commits);
assert.equal(opts[0].sha, 'ccc3333', 'newest-first options');
assert.ok(isAllCommitsFilter(normalizeDiffCommitFilter({ mode: 'all' })));

assert.ok(commitFilter.includes('SearchableSelect'), 'DiffCommitFilter uses SearchableSelect');
assert.ok(
  commitFilter.includes('rangeAnchor') || commitFilter.includes('endSha'),
  'range via first+second pick'
);
assert.ok(toolbar.includes('rangeAnchor') || toolbar.includes('endSha'), 'toolbar range path');

// Bundle hooks
assert.ok(bundle.includes('prp-diff-toolbar') || bundle.includes('DiffToolbar'));
assert.ok(bundle.includes('prp-header--unified') || bundle.includes('prp-header__row--primary'));
assert.ok(css.includes('prp-diff-toolbar'));
assert.ok(css.includes('prp-header__row--primary'));

console.log('ui-chrome-goal.test.js: all assertions passed');
console.log(
  [
    'conversation-reply=true',
    'header-two-row=true',
    'pen-icon=true',
    'diff-toolbar-no-checks=true',
    'commit-searchable-range=true',
  ].join('\n')
);
