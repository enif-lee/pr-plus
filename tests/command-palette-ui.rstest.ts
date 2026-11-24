import { describe, expect, test } from '@rstest/core';
import { JSDOM } from 'jsdom';
import { buildPaletteCommands, filterPaletteCommands } from '../src/modal/lib/command-palette';
import { collectPaletteControls } from '../src/modal/lib/command-palette-ui';
import { buildPullsPaletteHelpEntries, buildPullsPaletteItems } from '../src/pulls-palette-actions';

const detail = { owner: 'o', repo: 'r', baseRef: 'main', headRef: 'feature/topic' };

function fixture(html: string) {
  const dom = new JSDOM(`<main>${html}</main>`);
  const root = dom.window.document.querySelector('main')!;
  for (const el of root.querySelectorAll('button, [data-prp-composer-root]')) {
    Object.defineProperty(el, 'getBoundingClientRect', { value: () => ({ width: 10, height: 10 }) });
    Object.defineProperty(el, 'getClientRects', { value: () => [{ width: 10, height: 10 }] });
  }
  return { root, close: () => dom.window.close() };
}

describe('command palette UI parity', () => {
  test('finds both copy actions in either layout, without an inert current-base row', () => {
    for (const layoutMode of ['diff', 'conversation']) {
      const commands = buildPaletteCommands(detail, { layoutMode });
      expect(filterPaletteCommands(commands, 'copy branch').map((c) => c.payload.branch)).toEqual(['base', 'head']);
      expect(commands.some((c) => c.id === 'base-current')).toBe(false);
      expect(filterPaletteCommands(commands, 'open branch').map((c) => c.payload.branch)).toEqual(['base', 'head']);
    }
    expect(filterPaletteCommands(buildPaletteCommands({ ...detail, headRef: ' ' }), 'copy branch').map((c) => c.payload.branch)).toEqual(['base']);
  });

  test('localizes branch actions and hides unavailable Conversation commands from Diff', () => {
    for (const locale of ['ko', 'ja', 'zh_CN']) {
      const commands = buildPaletteCommands({ ...detail, requestedReviewers: ['alice'] }, { layoutMode: 'diff', locale });
      expect(commands.find((c) => c.id === 'copy-base-branch').title).not.toBe('Copy base branch name');
      for (const id of ['set-labels', 'add-reviewer', 'rm-rev-alice', 'edit-body', 'load-more-threads']) {
        expect(commands.some((c) => c.id === id)).toBe(false);
      }
    }
  });

  test('a minimized active reply never inherits destructive controls from the root or inactive panel', () => {
    const { root, close } = fixture(`
      <div class="prp-body-panel"><button data-prp-palette-control="hidden">Not active</button></div>
      <div class="prp-body-panel--active">
        <div class="prp-card--kb-focus"><button data-prp-delete-comment>Delete previous comment</button></div>
        <div class="prp-inline-thread--context-active">
          <div data-prp-thread-unit="root">
            <button data-prp-delete-comment>Delete root</button>
          </div>
          <div data-prp-thread-unit="reply" data-prp-thread-unit-active="1">
            <button data-prp-unhide-comment>Unhide reply</button>
            <button data-prp-copy-comment disabled>Copy reply</button>
          </div>
        </div>
        <div data-prp-composer-root data-prp-composer-kind="selection">
          <button data-prp-composer-start-review data-prp-composer-submit>Add pending</button>
        </div>
      </div>`);
    try {
      const controls = collectPaletteControls(root, true);
      expect([...controls.keys()]).toEqual(['comment-unhide', 'add-pending-review']);
      expect(controls.get('comment-unhide')?.textContent).toBe('Unhide reply');
      root.querySelector('[data-prp-thread-unit="reply"]')?.remove();
      expect(collectPaletteControls(root, true).has('comment-delete')).toBe(false);
    } finally {
      close();
    }
  });

  test('two drafts require a focused composer while Conversation Find remains discoverable', () => {
    const { root, close } = fixture(`
      <button data-prp-palette-control="search-load-comments">Search outside Conversation panel</button>
      <div class="prp-body-panel">
        <button data-prp-palette-control="search-load-comments">Inactive Diff search</button>
      </div>
      <div class="prp-body-panel prp-body-panel--active">
        <div class="prp-inline-thread--context-active"><div data-prp-composer-root>
          <button data-prp-composer-submit>Post reply</button>
        </div></div>
        <div data-prp-composer-root data-prp-composer-kind="selection">
          <button data-prp-composer-submit>Post selection</button>
        </div>
      </div>`);
    try {
      const controls = collectPaletteControls(root, false);
      expect(controls.get('search-load-comments')?.textContent).toBe('Search outside Conversation panel');
      expect(controls.has('comment-now')).toBe(false);
      const reply = root.querySelector('.prp-inline-thread--context-active [data-prp-composer-root]');
      expect(collectPaletteControls(root, false, reply).get('comment-now')?.textContent).toBe('Post reply');
      reply?.remove();
      expect(collectPaletteControls(root, false, reply).has('comment-now')).toBe(false);
    } finally {
      close();
    }
  });

  test('focusing a review group does not expose actions on its child comments', () => {
    const { root, close } = fixture(`<div class="prp-body-panel--active">
      <div class="prp-card--kb-focus" data-search-anchor="review-group:1">
        <button data-prp-delete-comment>Delete child comment</button>
      </div>
    </div>`);
    try {
      expect(collectPaletteControls(root, false).has('comment-delete')).toBe(false);
    } finally {
      close();
    }
  });

  test('list and Help only offer the localized tree toggle when the host supplies it', () => {
    const treeToggleTitle = '트리 전환';
    const isTree = (item: { action?: string }) => item.action === 'togglePullsTree';
    expect(buildPullsPaletteItems([], { query: 'tree' }).some(isTree)).toBe(false);
    expect(buildPullsPaletteItems([], { query: 'tree', treeToggleTitle }).find(isTree)?.title).toBe(treeToggleTitle);
    expect(buildPullsPaletteHelpEntries().some(isTree)).toBe(false);
    expect(buildPullsPaletteHelpEntries({ treeToggleTitle }).find(isTree)?.title).toBe(treeToggleTitle);
  });
});
