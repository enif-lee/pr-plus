/**
 * Session view: identity + page gate, selection/form serialize.
 */
import { describe, expect, test } from '@rstest/core';
import {
  canRestoreSessionView,
  parseSessionView,
  serializeLineSelection,
  serializeSessionView,
} from '../src/modal/lib/session-view';

describe('serializeSessionView / parseSessionView', () => {
  test('round-trips PR identity, page, file/line selection, forms', () => {
    const snap = serializeSessionView({
      owner: 'enif-lee',
      repo: 'pr-plus',
      number: 7,
      page: 'diff',
      layoutMode: 'diff',
      diffMode: 'split',
      hideWhitespace: true,
      collapsedFiles: new Set(['a.ts']),
      viewedPaths: ['b.ts'],
      activeFilePath: 'a.ts',
      lineSelection: {
        filePath: 'a.ts',
        anchorLine: 3,
        headLine: 8,
        anchorSide: 'RIGHT',
        headSide: 'RIGHT',
        headRowIndex: 99,
      },
      selectionDraft: 'hello',
      showSelectionComposer: true,
      selectionIslandPhase: 'comment',
      commentText: 'body note',
      scrollTop: 120,
    });
    expect(snap).toBeTruthy();
    expect(snap.v).toBe(2);
    expect(snap.number).toBe(7);
    expect(snap.page).toBe('diff');
    expect(snap.lineSelection).toEqual({
      filePath: 'a.ts',
      anchorLine: 3,
      headLine: 8,
      anchorSide: 'RIGHT',
      headSide: 'RIGHT',
    });
    expect(snap.selectionDraft).toBe('hello');
    expect(snap.showSelectionComposer).toBe(true);
    expect(snap.selectionIslandPhase).toBe('comment');
    expect(snap.commentText).toBe('body note');

    const parsed = parseSessionView(JSON.stringify(snap));
    expect(parsed?.page).toBe('diff');
    expect(parsed?.lineSelection?.headLine).toBe(8);
    expect(parsed?.activeFilePath).toBe('a.ts');
  });

  test('serializeLineSelection drops invalid', () => {
    expect(serializeLineSelection(null)).toBe(null);
    expect(serializeLineSelection({ filePath: '', anchorLine: 1 })).toBe(null);
  });
});

describe('canRestoreSessionView', () => {
  const base = serializeSessionView({
    owner: 'o',
    repo: 'r',
    number: 1,
    page: 'diff',
    layoutMode: 'diff',
    activeFilePath: 'x.ts',
  });

  test('true when PR + page match', () => {
    expect(
      canRestoreSessionView(base, {
        owner: 'o',
        repo: 'r',
        number: 1,
        page: 'diff',
      })
    ).toBe(true);
  });

  test('false when page mismatches', () => {
    expect(
      canRestoreSessionView(base, {
        owner: 'o',
        repo: 'r',
        number: 1,
        page: 'conversation',
      })
    ).toBe(false);
  });

  test('false when PR number mismatches', () => {
    expect(
      canRestoreSessionView(base, {
        owner: 'o',
        repo: 'r',
        number: 2,
        page: 'diff',
      })
    ).toBe(false);
  });

  test('false when owner/repo mismatch', () => {
    expect(
      canRestoreSessionView(base, {
        owner: 'other',
        repo: 'r',
        number: 1,
        page: 'diff',
      })
    ).toBe(false);
  });

  test('allows restore when identity page omitted (URI has no page)', () => {
    expect(
      canRestoreSessionView(base, {
        owner: 'o',
        repo: 'r',
        number: 1,
        page: null,
      })
    ).toBe(true);
  });
});
