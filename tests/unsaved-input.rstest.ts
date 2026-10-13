import { describe, expect, test } from '@rstest/core';
import { JSDOM } from 'jsdom';
import { formatMessage } from '../src/modal/lib/i18n';
import {
  findCommentBody,
  hasUnsavedModalInput,
  snapshotUnsavedModalInput,
} from '../src/modal/lib/unsaved-input';

describe('hasUnsavedModalInput', () => {
  test('empty composers are not unsaved', () => {
    expect(
      hasUnsavedModalInput({
        commentText: '  ',
        selectionDraft: '',
        replyDrafts: { '1': '\n' },
        pendingBody: '',
      })
    ).toBe(false);
  });

  test('comment, reply, selection, and pending summary count', () => {
    expect(hasUnsavedModalInput({ commentText: 'hello' })).toBe(true);
    expect(hasUnsavedModalInput({ selectionDraft: 'line' })).toBe(true);
    expect(hasUnsavedModalInput({ replyDrafts: { a: '', b: 'reply' } })).toBe(
      true
    );
    expect(hasUnsavedModalInput({ pendingBody: 'summary' })).toBe(true);
    expect(hasUnsavedModalInput({ finishReviewBody: 'LGTM' })).toBe(true);
  });

  test('opened editors count only when the text changed', () => {
    expect(
      hasUnsavedModalInput({
        bodyEditing: true,
        bodyDraft: 'same',
        bodySaved: 'same',
      })
    ).toBe(false);
    expect(
      hasUnsavedModalInput({
        bodyEditing: true,
        bodyDraft: 'edited',
        bodySaved: 'same',
      })
    ).toBe(true);
    expect(
      hasUnsavedModalInput({
        commentEditing: true,
        commentEditDraft: 'body',
        commentEditSaved: 'body',
      })
    ).toBe(false);
    expect(
      hasUnsavedModalInput({
        titleEditing: true,
        titleDraft: 'New',
        titleSaved: 'Old',
      })
    ).toBe(true);
    expect(
      hasUnsavedModalInput({
        titleEditing: true,
        titleDraft: 'Old',
        titleSaved: 'Old',
      })
    ).toBe(false);
  });
});

describe('snapshotUnsavedModalInput', () => {
  test('reads store drafts and mounted editors', () => {
    const doc = new JSDOM(`<!DOCTYPE html><body>
      <input class="prp-header__title-input" value="Renamed" />
      <div data-prp-composer-kind="body" data-prp-unsaved-draft="kept" data-prp-unsaved-saved="kept"></div>
      <div data-prp-composer-kind="body" data-prp-unsaved-draft="edited in diff" data-prp-unsaved-saved="kept"></div>
      <div data-prp-finish-review="1" data-prp-unsaved-draft=""></div>
    </body>`).window.document;
    const detail = {
      title: 'Old',
      body: 'old body',
      comments: [{ id: 9, body: 'kept' }],
      reviewThreads: [{ comments: [{ id: 4, body: 'thread' }] }],
    };
    expect(findCommentBody(detail, 4)).toBe('thread');
    const snap = snapshotUnsavedModalInput({
      state: {
        commentText: '',
        selectionDraft: '',
        replyDrafts: {},
        pendingReview: { body: '', comments: [] },
        editingBody: true,
        editingComment: null,
      },
      detail,
      doc,
    });
    expect(hasUnsavedModalInput(snap)).toBe(true);
    expect(snap.editorDirty).toBe(true);
    expect(snap.titleDraft).toBe('Renamed');
    expect(snap.finishReviewBody).toBe('');
  });

  test('unchanged description does not count', () => {
    const doc = new JSDOM(`<!DOCTYPE html><body>
      <div data-prp-composer-kind="body" data-prp-unsaved-draft="same" data-prp-unsaved-saved="same"></div>
      <div data-prp-composer-kind="body" data-prp-unsaved-draft="thread" data-prp-unsaved-saved="thread"></div>
    </body>`).window.document;
    const snap = snapshotUnsavedModalInput({
      state: { editingBody: true, commentText: '   ' },
      detail: { body: 'same', title: 'T' },
      doc,
    });
    expect(hasUnsavedModalInput(snap)).toBe(false);
    expect(snap.editorDirty).toBe(false);
  });
});

describe('leave confirm copy', () => {
  test('ko/ja/zh differ from English', () => {
    const en = formatMessage('leave_unsaved_title', 'en');
    expect(en).toBe('Leave without sending?');
    expect(formatMessage('leave_unsaved_confirm', 'ko')).toBe('나가기');
    expect(formatMessage('leave_unsaved_title', 'ja')).not.toBe(en);
    expect(formatMessage('leave_unsaved_message', 'zh_CN')).not.toBe(
      formatMessage('leave_unsaved_message', 'en')
    );
  });
});
