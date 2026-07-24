import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@common/Button';
import { MarkdownComposer } from '@common/MarkdownComposer';
import { normalizeSelection } from '@lib/line-selection';

export function SelectionCommentBar(props: any) {
  const {
    selection,
    draft,
    onDraft,
    onSubmitImmediate,
    onSubmitPending,
    onCancel,
    actionBusy,
    pendingCount,
    listRef,
    leaving = false,
    onUploadFile,
    linkCtx,
    mentionCandidates = [],
  } = props;

  const barRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ top: 72, left: 48, width: 520 });

  useEffect(() => {
    if (!selection || typeof normalizeSelection !== 'function') return;
    const pane = barRef.current?.closest?.('.prp-diff-pane') as HTMLElement | null;
    const list = listRef?.current as HTMLElement | null;
    if (!pane || !list) return;
    const endEl =
      list.querySelector('[data-sel-role="end"]') ||
      [...list.querySelectorAll('.prp-vline--selected')].pop();
    if (!endEl) return;
    const paneRect = pane.getBoundingClientRect();
    const endRect = (endEl as HTMLElement).getBoundingClientRect();
    setPos({
      top: Math.max(8, endRect.bottom - paneRect.top + 8),
      left: Math.max(16, Math.min(endRect.left - paneRect.left, paneRect.width - 360)),
      width: Math.min(560, Math.max(320, paneRect.width - 48)),
    });
  }, [selection, listRef, draft]);

  if (!selection || typeof normalizeSelection !== 'function') return null;
  const norm = normalizeSelection(selection);
  if (!norm) return null;
  const rangeLabel = norm.multi
    ? `${norm.filePath}:${norm.startLine}–${norm.endLine}`
    : `${norm.filePath}:${norm.endLine}`;
  const canSubmit = !actionBusy && !!String(draft || '').trim();

  return (
    <div
      ref={barRef}
      className={`prp-selection-island${
        leaving ? ' prp-selection-island--out' : ' prp-selection-island--in'
      }`}
      style={{
        position: 'absolute',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 30,
      }}
    >
      <div className="prp-selection-island__meta">
        Comment on <code>{rangeLabel}</code>
        <span className="prp-muted"> ({norm.endSide})</span>
        {pendingCount > 0 ? (
          <span className="prp-muted"> · {pendingCount} pending in review</span>
        ) : null}
      </div>
      <MarkdownComposer
        value={draft}
        onChange={onDraft}
        placeholder="Write a review comment…"
        forceOpen
        compact={false}
        rows={3}
        disabled={actionBusy}
        showTabs
        onUploadFile={onUploadFile}
        linkCtx={linkCtx}
        mentionCandidates={mentionCandidates}
      />
      <div className="prp-composer__row">
        <Button size="sm" variant="primary" disabled={!canSubmit} onClick={onSubmitImmediate}>
          Comment
        </Button>
        <Button size="sm" disabled={!canSubmit} onClick={onSubmitPending}>
          {pendingCount > 0 ? 'Add comment' : 'Start review'}
        </Button>
        <Button size="sm" disabled={actionBusy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default SelectionCommentBar;
