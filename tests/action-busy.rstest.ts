import { describe, expect, test } from '@rstest/core';
import {
  ACTION_BUSY,
  isActionLoading,
  leaveReviewBusyKey,
} from '../src/modal/lib/action-busy';
import { useModalStore } from '../src/modal/store/modal-store';

describe('action-busy keys', () => {
  test('isActionLoading is true only for the matching key', () => {
    expect(isActionLoading('comment', ACTION_BUSY.comment)).toBe(true);
    expect(isActionLoading('comment', ACTION_BUSY.approve)).toBe(false);
    expect(isActionLoading(null, ACTION_BUSY.comment)).toBe(false);
  });

  test('leaveReviewBusyKey maps kind to spinner key', () => {
    expect(leaveReviewBusyKey('issue-comment')).toBe(ACTION_BUSY.comment);
    expect(leaveReviewBusyKey('comment')).toBe(ACTION_BUSY.reviewComment);
    expect(leaveReviewBusyKey('approve')).toBe(ACTION_BUSY.approve);
    expect(leaveReviewBusyKey('request_changes')).toBe(ACTION_BUSY.requestChanges);
  });

  test('CTA sources do not bind loading to the global boolean', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    for (const rel of [
      'src/modal/views/conversation/ComposerCard.tsx',
      'src/modal/views/chrome/FinishReviewModal.tsx',
      'src/modal/views/diff/SelectionCommentBar.tsx',
      'src/modal/views/diff/InlineThread.tsx',
    ]) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      expect(src).not.toMatch(/loading=\{Boolean\(actionBusy\)\}/);
      expect(src).toMatch(/isActionLoading\(busyKey/);
    }
  });

  test('setActionBusy(true, key) locks globally but stores one spinner key', () => {
    const prev = useModalStore.getState();
    useModalStore.setState({ actionBusy: false, busyKey: null });
    useModalStore.getState().setActionBusy(true, ACTION_BUSY.comment);
    expect(useModalStore.getState().actionBusy).toBe(true);
    expect(useModalStore.getState().busyKey).toBe(ACTION_BUSY.comment);
    useModalStore.getState().setActionBusy(true);
    expect(useModalStore.getState().actionBusy).toBe(true);
    expect(useModalStore.getState().busyKey).toBe(null);
    useModalStore.getState().setActionBusy(false);
    expect(useModalStore.getState().actionBusy).toBe(false);
    expect(useModalStore.getState().busyKey).toBe(null);
    useModalStore.setState({
      actionBusy: prev.actionBusy,
      busyKey: prev.busyKey,
    });
  });
});
