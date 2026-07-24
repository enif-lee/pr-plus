const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCRATCH =
  process.env.PRP_SCRATCH ||
  path.join(require('node:os').tmpdir(), 'pr-plus-test-scratch');
fs.mkdirSync(SCRATCH, { recursive: true });

const layout = require('../src/modal/lib/layout-mode.ts');
const css = fs.readFileSync(
  path.join(__dirname, '../src/modal/styles.css'),
  'utf8'
);
function readModalSources() {
  const root = path.join(__dirname, '../src/modal');
  const parts = [];
  function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'dist' || ent.name === 'pure') continue;
        walk(p);
      } else if (/\.(tsx?|jsx?)$/.test(ent.name)) {
        parts.push(fs.readFileSync(p, 'utf8'));
      }
    }
  }
  walk(root);
  return parts.join('\n');
}
const appSrc = readModalSources();

// Animation hooks in shipped CSS
assert.ok(css.includes('transition:'), 'css transitions present');
assert.ok(css.includes('prp-modal--diff'), 'diff layout class');
assert.ok(css.includes('prp-modal--centered'), 'centered layout class');
assert.ok(/280ms|cubic-bezier/.test(css), 'timing curve for expand/collapse');

// Side sheet enter is one-shot (.prp-modal--sheet-in), not permanent on .prp-shell--sheet .prp-modal
// (permanent animation re-fires on every progressive load re-render)
{
  const baseSheetBlock = css.match(
    /\.prp-overlay\.prp-shell--sheet\s+\.prp-modal\s*\{[^}]*\}/
  );
  assert.ok(baseSheetBlock, 'base sheet modal rule exists');
  assert.ok(
    !/animation\s*:\s*prp-sheet-in/.test(baseSheetBlock[0]),
    'base sheet rule must NOT permanently attach prp-sheet-in'
  );
  assert.ok(
    css.includes('prp-modal--sheet-in') &&
      /prp-modal--sheet-in[\s\S]{0,120}prp-sheet-in/.test(css),
    'enter uses one-shot .prp-modal--sheet-in class'
  );
  assert.ok(
    appSrc.includes('prp-modal--sheet-in'),
    'App applies sheet-in enter class'
  );
  assert.ok(
    /enterAnimTokenRef|One-shot enter animation/.test(appSrc),
    'App gates enter anim on open only'
  );
}

// Diff shell is viewport-relative with no artificial pixel max-width ceiling
assert.ok(!/min\(\s*1520px/.test(css), 'no 1520px max-width cap on diff');
assert.ok(!/min\(\s*1100px/.test(css), 'no 1100px max-width cap on centered');
assert.ok(
  /\.prp-modal--diff\s*\{[^}]*width:\s*100vw/s.test(css),
  'diff width tracks viewport (100vw)'
);
assert.ok(
  /\.prp-modal--diff\s*\{[^}]*height:\s*100vh/s.test(css),
  'diff height tracks viewport (100vh)'
);
// Backdrop is translucent (alpha token, not solid black)
assert.ok(css.includes('--prp-backdrop-alpha'), 'backdrop alpha token');
assert.ok(
  /--prp-backdrop-alpha:\s*0\.\d+/.test(css),
  'backdrop alpha is fractional opacity'
);
assert.ok(css.includes('--prp-pad-card') || css.includes('--prp-space-'), 'spacing tokens');

// App drives layout mode + animation classes
assert.ok(appSrc.includes('LAYOUT_DIFF'));
assert.ok(appSrc.includes('prp-modal--animating'));
assert.ok(appSrc.includes('expandDiff') || appSrc.includes('setLayoutMode'));
assert.ok(appSrc.includes('FolderFileTree') || appSrc.includes('FileTree'));
assert.ok(appSrc.includes('VirtualDiff'));
assert.ok(appSrc.includes('MarkdownView') || appSrc.includes('marked'));
assert.ok(appSrc.includes('highlightCode') || appSrc.includes('hljs'));
assert.ok(appSrc.includes('navComment') || appSrc.includes('CommentNav'));
assert.ok(appSrc.includes('AsideCommitsTimeline') || appSrc.includes('takeCommitsForTimeline'));
assert.ok(appSrc.includes('AsideFilesTree') || appSrc.includes('takeVisibleTreeNodes'));
assert.ok(appSrc.includes('LoadingSkeleton') || appSrc.includes('prp-skeleton'));
assert.ok(appSrc.includes('onClosePr') && appSrc.includes('onReopenPr'));
// Review UX: line select, radios, file search, viewed, colored stats
assert.ok(appSrc.includes('beginLineSelection') || appSrc.includes('onSelectionStart'));
assert.ok(appSrc.includes('finalizeSelection') || appSrc.includes('selectionGestureMode'));
assert.ok(appSrc.includes('role="radiogroup"') || appSrc.includes('prp-diff-mode'));
assert.ok(
  (appSrc.includes("setDiffMode('unified')") && appSrc.includes("setDiffMode('split')")) ||
    (appSrc.includes('DiffToolbar') &&
      appSrc.includes('onDiffMode') &&
      (appSrc.includes('unified') && appSrc.includes('split'))),
  'unified/split via App or DiffToolbar'
);
assert.ok(appSrc.includes('DiffToolbar') || appSrc.includes('prp-diff-toolbar'), 'unified Diff toolbar');
assert.ok(
  appSrc.includes('flattenFilesToVirtualRows(') &&
    (appSrc.includes('displayFiles') || appSrc.includes('annotatedFiles')) &&
    appSrc.includes('diffMode'),
  'virtual rows built from filtered display/annotated files'
);
assert.ok(appSrc.includes('Filter files') || appSrc.includes('fileQuery'));
assert.ok(appSrc.includes('onToggleViewed') || appSrc.includes('viewedPaths'));
assert.ok(appSrc.includes('prp-stat-add') || css.includes('prp-stat-add'));
assert.ok(css.includes('prp-vline--selected') || appSrc.includes('prp-vline--selected'));
assert.ok(
  css.includes('prp-selection-bar--bottom') ||
    css.includes('prp-selection-island') ||
    appSrc.includes('prp-selection-island')
);
assert.ok(css.includes('padding: 0 16px') || css.includes('prp-code'));
assert.ok(appSrc.includes('RichComposer') || appSrc.includes('detectMentionTrigger'));
assert.ok(appSrc.includes('MermaidBlock') || appSrc.includes('mermaid'));
assert.ok(appSrc.includes('replyToReviewComment') || appSrc.includes('onReplyToThread'));
assert.ok(appSrc.includes('resolveReviewThread') || appSrc.includes('onResolveThread'));
assert.ok(appSrc.includes("label: 'Diff'") || appSrc.includes("? 'Conversation' : 'Diff'"));
assert.ok(
  !/Files changed/.test(
    appSrc.match(/function ConversationView[\s\S]*?function formatWhen/)?.[0] ||
      appSrc.match(/function ConversationView[\s\S]*?function ChecksPanel/)?.[0] ||
      ''
  ),
  'no Files changed in conversation'
);
// Unified leave-review form (Comment / Approve / Request changes) + Linear palette
assert.ok(
  appSrc.includes('onLeaveReviewAction') && appSrc.includes('Request changes'),
  'unified comment+review form'
);
assert.ok(appSrc.includes('CommandPalette') || appSrc.includes('buildPaletteCommands'));
assert.ok(appSrc.includes('BodyEditor') || appSrc.includes('editingBody'));
assert.ok(appSrc.includes('SuggestionBlock') || appSrc.includes('parseSuggestionFences'));
assert.ok(appSrc.includes('applyReviewSuggestion') || appSrc.includes('onApplySuggestion'));
assert.ok(appSrc.includes('prp-label') || appSrc.includes('detail.labels'));
assert.ok(appSrc.includes('prp-header__stats') || appSrc.includes('header__stats'));
assert.ok(appSrc.includes('addPendingComment') || appSrc.includes('Start review'));
assert.ok(appSrc.includes('discardPendingReview') || appSrc.includes('Discard'));
assert.ok(appSrc.includes('buildConversationTimeline') || appSrc.includes('review-thread'));
assert.ok(
  appSrc.includes('pageTimelineItems') ||
    appSrc.includes('VirtualConversationList') ||
    appSrc.includes('prp-pagination') ||
    appSrc.includes('Load more'),
  'conversation timeline paging or virtual list'
);
assert.ok(appSrc.includes('loadSessionView') || appSrc.includes('saveSessionView'));
assert.ok(
  appSrc.includes('showHunk') ||
    appSrc.includes('DiffSnippetView') ||
    appSrc.includes('prp-diff-snippet'),
  'conversation embeds code hunk via showHunk / DiffSnippetView'
);
assert.ok(appSrc.includes('Start review') && appSrc.includes('Add comment'));
assert.ok(!appSrc.includes('Start review + add comment'));
assert.ok(appSrc.includes('deleteReviewComment') || appSrc.includes('onDeleteReviewComment'));
assert.ok(appSrc.includes('editIssueComment') || appSrc.includes('onSaveEditComment'));
assert.ok(appSrc.includes('prp-file-header__viewed') || appSrc.includes('file-header__collapse'));
assert.ok(appSrc.includes('prp-vline--split') || appSrc.includes('leftCode'));
assert.ok(appSrc.includes('prp-inline-thread') || appSrc.includes('InlineThread'));
assert.ok(!/ \(collapsed\)/.test(fs.readFileSync(path.join(__dirname, '../src/modal/lib/diff-rows.ts'), 'utf8')));

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
