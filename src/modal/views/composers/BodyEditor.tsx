import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@common/Button';
import { MarkdownComposer } from '@common/MarkdownComposer';
import { ACTION_BUSY, isActionLoading } from '@lib/action-busy';
import { useBusyKey } from '../../store/modal-store';

/** Keep in-progress edits when host patches settle `value` after open. */
export function adoptIncomingBodyDraft(
  prevValue: string,
  draft: string,
  nextValue: string
): string {
  return draft === prevValue ? nextValue : draft;
}

export function BodyEditor({
  value,
  onSave,
  onCancel,
  actionBusy,
  onRegisterSave,
  onUploadFile,
  linkCtx,
  mentionCandidates = [],
  rows = 10,
  compact = false,
  placeholder = 'Write a description…',
}: any) {
  const busyKey = useBusyKey();
  const [draft, setDraft] = useState(value || '');
  const valueRef = useRef(value || '');
  useEffect(() => {
    const next = value || '';
    const prev = valueRef.current;
    valueRef.current = next;
    setDraft((d) => adoptIncomingBodyDraft(prev, d, next));
  }, [value]);
  // Register current draft saver so global mod+Enter can save without leaving a review.
  useEffect(() => {
    if (typeof onRegisterSave !== 'function') return undefined;
    onRegisterSave(() => onSave?.(draft));
    return () => onRegisterSave(null);
  }, [draft, onSave, onRegisterSave]);
  return (
    <div className={`prp-body-editor${compact ? ' prp-body-editor--compact' : ''}`}>
      <MarkdownComposer
        value={draft}
        onChange={setDraft}
        placeholder={placeholder}
        forceOpen
        compact={compact}
        rows={rows}
        disabled={actionBusy}
        showTabs
        onUploadFile={onUploadFile}
        linkCtx={linkCtx}
        mentionCandidates={mentionCandidates}
        className="prp-body-editor__wysi"
      />
      <div className="prp-composer__row">
        <Button
          size="sm"
          variant="primary"
          disabled={actionBusy}
          loading={isActionLoading(busyKey, ACTION_BUSY.saveBody)}
          onClick={() => onSave?.(draft)}
        >
          Save
        </Button>
        <Button size="sm" disabled={actionBusy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default BodyEditor;
