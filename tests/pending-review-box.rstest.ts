/**
 * Pending-review submit box: own comments can be edited/deleted; replies
 * keep action chrome; box focus helper.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { buildConversationTimeline } from '../src/modal/lib/conversation-timeline';
import { resolveContextCommentActionControl } from '../src/modal/lib/context-thread-dom';
import {
  isPendingReviewBoxKeyboardFocus,
  listPendingReviewBoxFocusTargets,
  stepPendingReviewBoxFocus,
} from '../src/modal/lib/shortcut-policy';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('pending review comment canDelete', () => {
  test('viewer-owned pending root + reply are deletable/editable', () => {
    const items = buildConversationTimeline(
      {
        viewerLogin: 'me',
        comments: [],
        reviews: [{ id: 1, state: 'PENDING', author: 'me' }],
        reviewComments: [
          {
            id: 10,
            author: 'me',
            body: 'root',
            pending: true,
            pendingReviewId: 1,
            path: 'a.ts',
            line: 1,
          },
          {
            id: 11,
            author: 'me',
            body: 'reply',
            pending: true,
            pendingReviewId: 1,
            in_reply_to_id: 10,
            path: 'a.ts',
            line: 1,
          },
        ],
      },
      {}
    );
    const group = items.find((i: any) => i.kind === 'review-group' && i.pending);
    expect(group).toBeTruthy();
    const thread = group.threads[0];
    expect(thread.canDelete).toBe(true);
    expect(thread.replies[0].canDelete).toBe(true);
  });

  test('viewer login match is case-insensitive', () => {
    const items = buildConversationTimeline(
      {
        viewerLogin: 'Me',
        comments: [],
        reviews: [{ id: 1, state: 'PENDING', author: 'me' }],
        reviewComments: [
          {
            id: 10,
            author: 'ME',
            body: 'root',
            pending: true,
            pendingReviewId: 1,
            path: 'a.ts',
            line: 1,
          },
        ],
      },
      {}
    );
    const group = items.find((i: any) => i.kind === 'review-group' && i.pending);
    expect(group.threads[0].canDelete).toBe(true);
  });
});

const PENDING_BOX_ITEMS = [
  { id: 10, kind: 'issue-comment' },
  {
    id: 99,
    kind: 'review-group',
    pending: true,
    threads: [
      { id: 501, path: 'a.ts' },
      { id: 502, path: 'b.ts' },
    ],
  },
];

describe('pending-review box ↑/↓ wrap', () => {
  test('stops are pending threads then composer', () => {
    expect(
      listPendingReviewBoxFocusTargets(PENDING_BOX_ITEMS).map((x) => x.anchor)
    ).toEqual(['review-comment:501', 'review-comment:502', 'composer']);
  });

  test('down wraps last thread → composer → first thread', () => {
    const a = stepPendingReviewBoxFocus(
      PENDING_BOX_ITEMS,
      'review-comment:502',
      1
    );
    expect(a?.anchor).toBe('composer');
    const b = stepPendingReviewBoxFocus(PENDING_BOX_ITEMS, 'composer', 1);
    expect(b?.anchor).toBe('review-comment:501');
  });

  test('up wraps first thread → composer', () => {
    const a = stepPendingReviewBoxFocus(
      PENDING_BOX_ITEMS,
      'review-comment:501',
      -1
    );
    expect(a?.anchor).toBe('composer');
  });
});

describe('InlineThread pending reply actions', () => {
  test('pending replies still render comment actions (edit/delete)', () => {
    const src = fs.readFileSync(
      path.join(root, 'src/modal/views/diff/InlineThread.tsx'),
      'utf8'
    );
    expect(src).toMatch(/isPending \? ' prp-review-thread__item--pending'/);
    expect(src).not.toMatch(
      /\{\s*!isPending\s*\?\s*renderCommentActions\(r\.id/
    );
    expect(src).toMatch(
      /renderCommentActions\(r\.id, r\.body, ownReply/
    );
  });
});

describe('isPendingReviewBoxKeyboardFocus', () => {
  test('true when kb-focus is inside the pending box', () => {
    const box = {
      contains(el: unknown) {
        return el === focused;
      },
    };
    const focused = { closest() { return box; } };
    const doc = {
      querySelector(sel: string) {
        if (sel.includes('data-prp-pending-review-box')) return box;
        if (sel.includes('kb-focus') || sel.includes('composer-focus')) {
          return focused;
        }
        return null;
      },
    } as unknown as Document;
    expect(isPendingReviewBoxKeyboardFocus(doc)).toBe(true);
  });

  test('false without a pending box', () => {
    const doc = {
      querySelector() {
        return null;
      },
    } as unknown as Document;
    expect(isPendingReviewBoxKeyboardFocus(doc)).toBe(false);
  });
});

describe('resolveContextCommentActionControl (unit-active reply)', () => {
  test('prefers unit-active reply edit over root', () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <div class="prp-review-group__row--kb-focus">
          <ul class="prp-review-thread">
            <li data-prp-thread-unit="root">
              <button data-prp-edit-comment="1" data-id="root">edit root</button>
            </li>
            <li data-prp-thread-unit="reply" data-prp-thread-unit-active="1">
              <button data-prp-edit-comment="1" data-id="reply">edit reply</button>
            </li>
          </ul>
        </div>
      </body></html>`,
      { pretendToBeVisual: true }
    );
    const doc = dom.window.document;
    for (const btn of doc.querySelectorAll('[data-prp-edit-comment]')) {
      (btn as any).getBoundingClientRect = () => ({
        top: 10,
        bottom: 30,
        left: 10,
        right: 30,
        width: 20,
        height: 20,
        x: 10,
        y: 10,
        toJSON() {},
      });
    }
    const hit = resolveContextCommentActionControl(doc, [
      '[data-prp-edit-comment="1"]',
    ]);
    expect(hit?.getAttribute('data-id')).toBe('reply');
  });

  test('hotkeys click unit-focused comment actions', () => {
    const src = fs.readFileSync(
      path.join(root, 'src/modal/hooks/usePrModalHotkeys.ts'),
      'utf8'
    );
    expect(src).toMatch(/resolveContextCommentActionControl/);
    expect(src).toMatch(/stepPendingBoxNext/);
    expect(src).toMatch(/navPendingReviewBox/);
  });
});
