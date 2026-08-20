/** Regression gates for the PR-detail Diff key-hold critical path. */
import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');
const readShell = () =>
  [
    'src/modal/app/PrModalShell.tsx',
    'src/modal/hooks/useDiffConversationNav.ts',
    'src/modal/hooks/useSelectionKeyboard.ts',
    'src/modal/hooks/usePrModalSessionRoute.ts',
  ]
    .map((rel) => read(rel))
    .join('\n');

describe('Diff key-hold architecture', () => {
  test('multi-file active path does not subscribe the composition root', () => {
    const shell = readShell();
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
    const shell = readShell();
    const fileNav = shell.slice(
      shell.indexOf('function scrollFileNavRowIntoView'),
      shell.indexOf('/** Live Diff scroller')
    );
    expect(fileNav).not.toMatch(/scrollIntoView\?\.\(/);
    expect(fileNav).not.toMatch(/row\.offsetTop/);
    expect(fileNav).toMatch(/row\.getBoundingClientRect\(\)/);
    expect(fileNav).toMatch(/scroller\.getBoundingClientRect\(\)/);
    expect(fileNav).toMatch(/scroller\.scrollTop/);
    const selectFile = shell.slice(
      shell.indexOf('function onSelectFile'),
      shell.indexOf('function onToggleDir')
    );
    expect(selectFile).toMatch(/minStoreDelta: Number\.POSITIVE_INFINITY/);
  });

  test('multi-file key-hold commits every active path through leaf subscriptions', () => {
    const shell = readShell();
    const setPath = shell.slice(
      shell.indexOf('function setActiveFilePathForNav'),
      shell.indexOf('Keep file navigation on the next paint boundary')
    );
    expect(shell).not.toMatch(/pendingActiveFilePathRef/);
    expect(setPath).toMatch(/setActiveFilePath\(p\)/);
    expect(setPath).not.toMatch(/data-prp-diff-nav-active/);
  });

  test('file nav advances one adjacent file per animation frame', () => {
    const shell = readShell();
    const nav = shell.slice(
      shell.indexOf('/** Diff file step'),
      shell.indexOf('function scrollDiffPage')
    );
    expect(nav).toMatch(/function navFile\(delta: number\)/);
    expect(nav).toMatch(/pendingFileNavDeltaRef\.current = d;[\s\S]*requestAnimationFrame/);
    expect(nav).toMatch(/resolveAdjacentFileNav\([\s\S]*queued/);
  });

  test('thread nav does not subscribe commentIndex at the composition root', () => {
    const shell = read('src/modal/app/PrModalShell.tsx');
    expect(shell).not.toMatch(
      /const commentIndex = useModalStore\(\(s\) => s\.commentIndex\)/
    );
    const toolbar = read('src/modal/views/chrome/DiffToolbar.tsx');
    expect(toolbar).toMatch(/useModalStore\(\(s\) => s\.commentIndex\)/);
    const view = read('src/modal/views/diff/VirtualDiff.tsx');
    expect(view).toMatch(/const DiffCommentRowFrame = memo/);
    expect(view).not.toMatch(/const storeThreadSelectionId = useModalStore/);
    const nav = read('src/modal/hooks/useDiffConversationNav.ts');
    expect(nav).toMatch(/function applyNavComment/);
    expect(nav).toMatch(/if \(commentNavRafRef\.current\) return/);
  });

  test('host paints and URI writes yield while Diff navigation is active', () => {
    const shell = readShell();
    const host = read('src/host/modules/props-render-close.ts');
    const optHint = read('src/modal/components/common/ShortcutHint.tsx');
    expect(shell).toMatch(/data-prp-diff-nav-active/);
    expect(shell).toMatch(/window\.setTimeout\(flushRoute, 80\)/);
    expect(host).toMatch(/diffNavDeferredRenderTimer/);
    expect(host).toMatch(/data-prp-diff-nav-active/);
    expect(optHint).toMatch(
      /hasAttribute\?\.\('data-prp-diff-nav-active'\)/
    );
    expect(optHint).toMatch(
      /attributeFilter:\s*\[[\s\S]*'data-prp-diff-nav-active'/
    );
  });

  test('session restore key survives host remount of the same PR', () => {
    const src = read('src/modal/hooks/usePrModalSessionRoute.ts');
    expect(src).toMatch(/let restoredSessionPrKey:\s*string \| null/);
    expect(src).toMatch(/restoredSessionPrKey === key/);
    expect(src).toMatch(/restoredSessionPrKey = null/);
  });

  test('selection route writes stamp the inbound dedupe key before host echo', () => {
    const shell = readShell();
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
    const shell = readShell();
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
