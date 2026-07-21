import React, { useEffect, useState } from 'react';
import { Button } from '@common/Button';
import { MarkdownComposer } from '@common/MarkdownComposer';

export function BodyEditor({
  value,
  onSave,
  onCancel,
  actionBusy,
  onRegisterSave,
  onUploadFile,
  linkCtx,
}: any) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => {
    setDraft(value || '');
  }, [value]);
  // Register current draft saver so global mod+Enter can save without leaving a review.
  useEffect(() => {
    if (typeof onRegisterSave !== 'function') return undefined;
    onRegisterSave(() => onSave?.(draft));
    return () => onRegisterSave(null);
  }, [draft, onSave, onRegisterSave]);
  return (
    <div className="prp-body-editor">
      <MarkdownComposer
        value={draft}
        onChange={setDraft}
        placeholder="Write a description…"
        forceOpen
        compact={false}
        rows={10}
        disabled={actionBusy}
        showTabs
        onUploadFile={onUploadFile}
        linkCtx={linkCtx}
        className="prp-body-editor__wysi"
      />
      <div className="prp-composer__row">
        <Button size="sm" variant="primary" disabled={actionBusy} onClick={() => onSave?.(draft)}>
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
