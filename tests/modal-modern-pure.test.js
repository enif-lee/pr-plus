const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCRATCH =
  process.env.PRP_SCRATCH || '/var/folders/px/qw6l220x5glb_gxf44lws9p80000gn/T/grok-goal-5a6d37e1751e/implementer';
fs.mkdirSync(SCRATCH, { recursive: true });

const fileTree = require('../src/modal/lib/file-tree.ts');
const collapse = require('../src/modal/lib/collapse.ts');
const commentNav = require('../src/modal/lib/comment-nav.ts');
const theme = require('../src/modal/lib/theme.ts');
const diffRows = require('../src/modal/lib/diff-rows.ts');

const lines = [];

// (a) nested folder tree
{
  const tree = fileTree.buildNestedFileTree([
    { filename: 'src/a.js', additions: 1, deletions: 0 },
    { filename: 'src/b/c.ts', additions: 2, deletions: 1 },
    { filename: 'README.md', additions: 0, deletions: 0 },
  ]);
  assert.ok(tree.some((n) => n.type === 'dir' && n.name === 'src'));
  assert.ok(tree.some((n) => n.type === 'file' && n.name === 'README.md'));
  const src = tree.find((n) => n.name === 'src');
  assert.ok(src.children.some((c) => c.type === 'dir' && c.name === 'b'));
  const visible = fileTree.flattenVisibleTree(tree, new Set(['src', 'src/b']));
  assert.ok(visible.some((v) => v.path === 'src/b/c.ts' && v.depth >= 2));
  lines.push('file-tree: nested ok');
}

// (b) collapse defaults
{
  const attrs = collapse.parseGitattributes(`
*.min.js linguist-generated=true
dist/** -diff
package-lock.json linguist-generated=true
`);
  assert.ok(attrs.length >= 3);
  const annotated = collapse.annotateFilesForCollapse(
    [
      { filename: 'src/app.js', patch: '@@\n+x\n', additions: 1, deletions: 0, changes: 1 },
      { filename: 'vendor/foo.min.js', patch: '@@\n+y\n', additions: 1, deletions: 0, changes: 1 },
      { filename: 'blob.bin', patch: '', additions: 0, deletions: 0, changes: 0 },
      {
        filename: 'huge.js',
        patch: 'x'.repeat(100),
        additions: 600,
        deletions: 0,
        changes: 600,
      },
      {
        filename: 'package-lock.json',
        patch: '@@\n+a\n',
        additions: 10,
        deletions: 0,
        changes: 10,
      },
    ],
    `*.min.js linguist-generated=true\npackage-lock.json linguist-generated=true\n`
  );
  const byName = Object.fromEntries(annotated.map((f) => [f.filename, f.defaultCollapsed]));
  assert.equal(byName['src/app.js'], false);
  assert.equal(byName['vendor/foo.min.js'], true);
  assert.equal(byName['blob.bin'], true);
  assert.equal(byName['huge.js'], true);
  assert.equal(byName['package-lock.json'], true);

  // Non-hardcoded path: only collapses via key=true string form (not path heuristics)
  const pbBase = {
    filename: 'api/v1/foo.pb.go',
    patch: '@@ -1,2 +1,3 @@\n package v1\n+// gen\n',
    additions: 1,
    deletions: 0,
    changes: 1,
  };
  const withoutAttr = collapse.annotateFilesForCollapse([pbBase], '');
  assert.equal(
    withoutAttr[0].defaultCollapsed,
    false,
    'pb.go must stay open without attributes (no hardcode)'
  );
  const withAttr = collapse.annotateFilesForCollapse(
    [pbBase],
    '*.pb.go linguist-generated=true\n'
  );
  assert.equal(
    withAttr[0].defaultCollapsed,
    true,
    'linguist-generated=true string must enable collapse'
  );
  assert.equal(collapse.isAttrEnabled('true'), true);
  assert.equal(collapse.isAttrEnabled(true), true);
  assert.equal(collapse.isAttrEnabled('false'), false);
  assert.equal(collapse.isAttrEnabled(false), false);

  // Re-annotate upgrades SW weak defaults when gitattributes arrive later
  const swLike = [{ ...pbBase, defaultCollapsed: false }];
  const upgraded = collapse.annotateFilesForCollapse(
    swLike,
    '*.pb.go linguist-generated=true\n'
  );
  assert.equal(upgraded[0].defaultCollapsed, true, 're-annotate must honor attributes');

  const rowsCollapsed = diffRows.flattenFilesToVirtualRows(annotated, 'unified', {
    collapsedPaths: new Set(
      annotated.filter((f) => f.defaultCollapsed).map((f) => f.filename)
    ),
  });
  // Fully closed headers: collapsed flag set, no "collapsed" label text, no diff lines
  const collapsedHeaders = rowsCollapsed.filter(
    (r) => r.kind === 'file-header' && r.collapsed
  );
  assert.ok(collapsedHeaders.length > 0, 'expected collapsed file headers');
  assert.ok(
    collapsedHeaders.every((r) => !/collapsed/i.test(r.text)),
    'collapsed headers must not include the word collapsed'
  );
  assert.ok(!rowsCollapsed.some((r) => r.filePath === 'blob.bin' && r.kind === 'diff-line'));

  // Empty collapsedPaths → defaultCollapsed files are closed
  const rowsDefault = diffRows.flattenFilesToVirtualRows(annotated, 'unified', {
    collapsedPaths: new Set(),
  });
  const defaultClosed = rowsDefault.filter((r) => r.kind === 'file-header' && r.collapsed);
  assert.ok(
    defaultClosed.some((r) => r.filePath === 'blob.bin'),
    'empty set still collapses defaultCollapsed files'
  );
  assert.ok(
    rowsDefault.some((r) => r.filePath === 'src/app.js' && r.kind === 'diff-line'),
    'normal files stay open with empty collapsed set'
  );

  // Materialize defaults then expand one path — others stay collapsed
  const materialized = collapse.materializeCollapsedPaths(new Set(), annotated);
  assert.ok(materialized.has('blob.bin'));
  assert.ok(materialized.has('huge.js'));
  assert.equal(materialized.has('src/app.js'), false);
  materialized.delete('blob.bin');
  assert.equal(
    collapse.isPathCollapsed('blob.bin', materialized, true),
    false,
    'expanded path opens after materialize+delete'
  );
  assert.equal(
    collapse.isPathCollapsed('huge.js', materialized, true),
    true,
    'other defaults stay closed after materialize'
  );
  assert.equal(
    collapse.isPathCollapsed('src/app.js', new Set(), false),
    false
  );
  assert.equal(
    collapse.isPathCollapsed('blob.bin', new Set(), true),
    true,
    'empty set + defaultCollapsed → collapsed'
  );

  // Viewed paths collapse by default (empty collapsed set)
  assert.equal(
    collapse.isPathCollapsed('src/app.js', new Set(), false, false, new Set(['src/app.js'])),
    true,
    'viewed path collapses when collapsed set is empty'
  );
  const rowsViewed = diffRows.flattenFilesToVirtualRows(
    [{ filename: 'src/app.js', patch: '@@\n+x\n', additions: 1, deletions: 0, defaultCollapsed: false }],
    'unified',
    { collapsedPaths: new Set(), viewedPaths: new Set(['src/app.js']) }
  );
  assert.ok(
    rowsViewed.some((r) => r.kind === 'file-header' && r.filePath === 'src/app.js' && r.collapsed),
    'viewed file header is collapsed'
  );
  assert.ok(
    !rowsViewed.some((r) => r.filePath === 'src/app.js' && r.kind === 'diff-line'),
    'viewed file has no diff lines'
  );
  const matViewed = collapse.materializeCollapsedPaths(new Set(), annotated, new Set(['src/app.js']));
  assert.ok(matViewed.has('src/app.js'), 'materialize includes viewed paths');
  assert.ok(matViewed.has('blob.bin'), 'materialize still includes defaultCollapsed');
  lines.push('collapse: defaults ok');
  lines.push('collapse: linguist-generated=true on foo.pb.go ok');
}

// (c) comment next/prev + row mapping
{
  const rows = diffRows.flattenFilesToVirtualRows(
    [
      {
        filename: 'a.js',
        status: 'modified',
        patch: '@@ -1,3 +1,4 @@\n line\n+added\n context\n',
        additions: 1,
        deletions: 0,
      },
    ],
    'unified',
    {
      reviewComments: [
        { id: 1, path: 'a.js', line: 2, body: 'first', author: 'a' },
        { id: 2, path: 'a.js', line: 3, body: 'second', author: 'b' },
      ],
    }
  );
  assert.ok(rows.some((r) => r.kind === 'inline-comment'));
  const mapped = commentNav.mapCommentsToRowIndices(
    [
      { id: 1, path: 'a.js', line: 2, body: 'first' },
      { id: 2, path: 'a.js', line: 3, body: 'second' },
    ],
    rows
  );
  assert.equal(mapped.length, 2);
  assert.equal(typeof mapped[0].rowIndex, 'number');
  assert.equal(commentNav.nextCommentIndex(0, 2, 1), 1);
  assert.equal(commentNav.nextCommentIndex(1, 2, 1), 0);
  const nav = commentNav.resolveCommentNav(mapped, 0, 1);
  assert.equal(nav.commentIndex, 1);
  assert.equal(nav.shouldJump, true);
  lines.push('comment-nav: next/prev ok');
}

// (d) theme resolver
{
  const lightDoc = {
    documentElement: {
      getAttribute: (k) => (k === 'data-color-mode' ? 'light' : null),
      className: '',
      style: {},
    },
    body: { getAttribute: () => null, className: '' },
  };
  const darkDoc = {
    documentElement: {
      getAttribute: (k) => (k === 'data-color-mode' ? 'dark' : null),
      className: '',
      style: {},
    },
    body: { getAttribute: () => null, className: '' },
  };
  assert.equal(theme.resolveGithubTheme(lightDoc).mode, 'light');
  assert.equal(theme.resolveGithubTheme(lightDoc).className, 'prp-theme-light');
  assert.equal(theme.resolveGithubTheme(darkDoc).mode, 'dark');
  assert.equal(theme.resolveGithubTheme(darkDoc).className, 'prp-theme-dark');
  lines.push('theme: light/dark ok');
}

// language helper
assert.equal(diffRows.languageFromPath('src/App.tsx'), 'typescript');
assert.equal(diffRows.languageFromPath('x.py'), 'python');
// SO / systems stack extension map
assert.equal(diffRows.languageFromPath('Main.kt'), 'kotlin');
assert.equal(diffRows.languageFromPath('App.java'), 'java');
assert.equal(diffRows.languageFromPath('cmd/main.go'), 'go');
assert.equal(diffRows.languageFromPath('src/lib.rs'), 'rust');
assert.equal(diffRows.languageFromPath('core.c'), 'c');
assert.equal(diffRows.languageFromPath('engine.cpp'), 'cpp');
assert.equal(diffRows.languageFromPath('engine.hpp'), 'cpp');
assert.equal(diffRows.languageFromPath('Service.cs'), 'csharp');
assert.equal(diffRows.languageFromPath('query.sql'), 'sql');
assert.equal(diffRows.languageFromPath('schema.graphql'), 'graphql');
assert.equal(diffRows.languageFromPath('Dockerfile'), 'dockerfile');
assert.equal(diffRows.languageFromPath('build.gradle.kts'), 'kotlin');

const log = ['modal-modern-pure.test.js: all assertions passed', ...lines].join('\n');
fs.writeFileSync(path.join(SCRATCH, 'pure-modern-modal.log'), log + '\n');
console.log(log);
