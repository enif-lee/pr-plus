import React from 'react';
import { Button } from './Button';

export function SuggestionBlock({ content, onApply, canApply, actionBusy, onRegisterApply }: any) {
  return (
    <div
      className="prp-suggestion"
      onMouseEnter={() => {
        if (canApply && onApply) onRegisterApply?.(onApply);
      }}
      onFocusCapture={() => {
        if (canApply && onApply) onRegisterApply?.(onApply);
      }}
    >
      <div className="prp-suggestion__head">
        <span className="prp-suggestion__label">Suggested change</span>
        {canApply ? (
          <Button
            size="sm"
            variant="primary"
            disabled={actionBusy}
            onClick={onApply}
            onFocus={() => onRegisterApply?.(onApply)}
          >
            Apply suggestion
          </Button>
        ) : null}
      </div>
      <pre className="prp-suggestion__code">
        <code>{content}</code>
      </pre>
    </div>
  );
}
