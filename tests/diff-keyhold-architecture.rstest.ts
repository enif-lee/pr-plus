/** Regression gates for the PR-detail Diff key-hold critical path. */
import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

describe('Diff key-hold architecture', () => {
  test('multi-file active path does not subscribe the composition root', () => {
    const shell = read('src/modal/app/PrModalShell.tsx');
    expect(shell).not.toMatch(
      /const activeFilePath = useModalStore\(\(s\) => s\.activeFilePath\)/
    );
    expect(shell).toMatch(/singleFileMode \? s\.activeFilePath : null/);
    expect(shell).toMatch(/readActiveFilePath/);
  });

  test('active file chrome subscribes at row/header leaves', () => {
    const tree = read('src/modal/views/diff/FolderFileTree.tsx');
    const rows = read('src/modal/views/diff/VirtualDiffRows.tsx');
    expect(tree).toMatch(/const FileTreeFileRow = memo/);
    expect(tree).toMatch(/s\.activeFilePath[^\n]+node\.path/);
    expect(rows).toMatch(/const storeFocused = useModalStore/);
    expect(rows).toMatch(/s\.activeFilePath[^\n]+row\?\.filePath/);
  });

  test('file/selection hops stay DOM-first and file-tree scrolling is local', () => {
    const shell = read('src/modal/app/PrModalShell.tsx');
    const fileNav = shell.slice(
      shell.indexOf('function scrollFileNavRowIntoView'),
      shell.indexOf('/** Live Diff scroller')
    );
    expect(fileNav).not.toMatch(/scrollIntoView\?\.\(/);
    expect(fileNav).toMatch(/scroller\.scrollTop/);
    const selectFile = shell.slice(
      shell.indexOf('function onSelectFile'),
      shell.indexOf('function onToggleDir')
    );
    expect(selectFile).toMatch(/minStoreDelta: Number\.POSITIVE_INFINITY/);
  });

  test('multi-file key-hold commits only the final active path on idle', () => {
    const shell = read('src/modal/app/PrModalShell.tsx');
    expect(shell).toMatch(/pendingActiveFilePathRef = useRef\(''\)/);
    expect(shell).toMatch(/function setActiveFilePathForNav/);
    expect(shell).toMatch(
      /if \(navActive\) \{\s*pendingActiveFilePathRef\.current = p;\s*return;/s
    );
    expect(shell).toMatch(
      /const pendingPath = pendingActiveFilePathRef\.current;[\s\S]*setActiveFilePath\(pendingPath\)/
    );
  });

  test('host paints and URI writes yield while Diff navigation is active', () => {
    const shell = read('src/modal/app/PrModalShell.tsx');
    const host = read('src/host/modules/props-render-close.ts');
    expect(shell).toMatch(/data-prp-diff-nav-active/);
    expect(shell).toMatch(/window\.setTimeout\(flushRoute, 80\)/);
    expect(host).toMatch(/diffNavDeferredRenderTimer/);
    expect(host).toMatch(/data-prp-diff-nav-active/);
  });

  test('selection route writes stamp the inbound dedupe key before host echo', () => {
    const shell = read('src/modal/app/PrModalShell.tsx');
    const outbound = shell.slice(
      shell.indexOf('// Sync URI + host session open snap.'),
      shell.indexOf('// Reset route restore markers when modal closes')
    );
    expect(outbound.match(/ghSelectionAppliedRef\.current\s*=/g)).toHaveLength(
      2
    );
    expect(outbound).toMatch(
      /ghSelectionAppliedRef\.current\s*=[\s\S]*onRouteChange\(/
    );
  });

  test('active Diff panel forms an inner containment boundary', () => {
    const css = read('src/modal/views/chrome/ShellLayout.css');
    expect(css).toMatch(
      /\.prp-body-panel--diff\.prp-body-panel--active\s*\{[^}]*contain: layout style paint/s
    );
  });

  test('progressive comment patches preserve focused thread by stable id', () => {
    const shell = read('src/modal/app/PrModalShell.tsx');
    expect(shell).toContain('const stableIdx = mappedComments.findIndex');
    expect(shell).toContain('String(c?.id) === String(activeId)');
    expect(shell).toContain('setCommentIndex(stableIdx)');
  });

  test('plain-arrow fast path keeps multi-reply navigation authority', () => {
    const hotkeys = read('src/modal/hooks/usePrModalHotkeys.ts');
    const fastPath = hotkeys.slice(
      hotkeys.indexOf('Diff ↑/↓ / Shift+↑↓ hot path'),
      hotkeys.indexOf('// Physical-key token')
    );
    expect(fastPath).toContain('act.isMultiReplyThreadFocused?.()');
    expect(fastPath).toContain("'stepThreadReplyPrev'");
    expect(fastPath).toContain("'stepThreadReplyNext'");
    expect(fastPath.indexOf('stepThreadReplyNext')).toBeLessThan(
      fastPath.indexOf('moveSelectionDown')
    );
  });
});
