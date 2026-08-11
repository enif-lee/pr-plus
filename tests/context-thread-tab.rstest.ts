/**
 * Thread-focus Tab order: input → Comment → Start review → Resolve → leave.
 */
import { describe, expect, test } from '@rstest/core';
import { JSDOM } from 'jsdom';
import {
  isContextThreadCommentActive,
  listContextThreadComposerTabStops,
  stepContextThreadComposerTab,
} from '../src/modal/lib/context-thread-dom';

function mountComposer(html: string) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  const root = dom.window.document.querySelector(
    '[data-prp-composer-root]'
  ) as HTMLElement;
  return { dom, root, document: dom.window.document };
}

describe('context-thread composer Tab stops', () => {
  test('lists input + comment + start-review + resolve hosts', () => {
    const { root } = mountComposer(`
      <div data-prp-composer-root="1">
        <textarea class="prp-mdc__ta"></textarea>
        <span data-prp-thread-tab-host="comment"><button data-prp-composer-submit="1">Comment</button></span>
        <span data-prp-thread-tab-host="start-review"><button data-prp-composer-start-review="1">Start review</button></span>
        <span data-prp-thread-tab-host="resolve"><button data-prp-composer-resolve="1">Resolve</button></span>
      </div>
    `);
    const stops = listContextThreadComposerTabStops(root);
    expect(stops).toHaveLength(4);
    expect(stops[0].classList.contains('prp-mdc__ta')).toBe(true);
    expect(stops[1].getAttribute('data-prp-thread-tab-host')).toBe('comment');
    expect(stops[2].getAttribute('data-prp-thread-tab-host')).toBe(
      'start-review'
    );
    expect(stops[3].getAttribute('data-prp-thread-tab-host')).toBe('resolve');
  });

  test('Tab steps through stops then leave-next', () => {
    const { root, document } = mountComposer(`
      <div data-prp-composer-root="1">
        <textarea class="prp-mdc__ta"></textarea>
        <span data-prp-thread-tab-host="comment" tabindex="0"></span>
        <span data-prp-thread-tab-host="start-review" tabindex="0"></span>
        <span data-prp-thread-tab-host="resolve" tabindex="0"></span>
      </div>
    `);
    const stops = listContextThreadComposerTabStops(root);
    expect(stepContextThreadComposerTab(root, 1, null)).toBe('moved');
    // Simulate focus on last
    Object.defineProperty(document, 'activeElement', {
      get: () => stops[3],
      configurable: true,
    });
    expect(stepContextThreadComposerTab(root, 1, stops[3])).toBe('leave-next');
    expect(stepContextThreadComposerTab(root, -1, stops[0])).toBe('leave-prev');
    expect(stepContextThreadComposerTab(root, 1, stops[0])).toBe('moved');
  });

  test('ghost used when no textarea yet', () => {
    const { root } = mountComposer(`
      <div data-prp-composer-root="1">
        <button type="button" class="prp-mdc__ghost">Write a reply</button>
        <span data-prp-thread-tab-host="comment"></span>
      </div>
    `);
    const stops = listContextThreadComposerTabStops(root);
    expect(stops[0].classList.contains('prp-mdc__ghost')).toBe(true);
  });
});

describe('context thread focus ownership by layout', () => {
  test('Diff ignores a retained Conversation anchor', () => {
    expect(
      isContextThreadCommentActive('diff-root', {
        layoutMode: 'diff',
        activeDiffCommentId: 'diff-root',
        focusedConversationAnchor: 'review-comment:conversation-root',
      })
    ).toBe(true);
    expect(
      isContextThreadCommentActive('conversation-root', {
        layoutMode: 'diff',
        activeDiffCommentId: 'diff-root',
        focusedConversationAnchor: 'review-comment:conversation-root',
      })
    ).toBe(false);
  });

  test('Conversation ignores a retained Diff id', () => {
    expect(
      isContextThreadCommentActive('conversation-root', {
        layoutMode: 'conversation',
        activeDiffCommentId: 'diff-root',
        focusedConversationAnchor: 'review-comment:conversation-root',
      })
    ).toBe(true);
    expect(
      isContextThreadCommentActive('diff-root', {
        layoutMode: 'conversation',
        activeDiffCommentId: 'diff-root',
        focusedConversationAnchor: 'review-comment:conversation-root',
      })
    ).toBe(false);
  });
});
