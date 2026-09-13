import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@common/Button';
import { MarkdownComposer } from '@common/MarkdownComposer';
import { ShortcutHint } from '@common/ShortcutHint';
import { ACTION_BUSY, isActionLoading } from '@lib/action-busy';
import { COMPOSER_CONTEXT_SHORTCUT } from '@lib/shortcut-policy';
import { useT } from '@lib/locale-context';
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
  const t = useT();
  const busyKey = useBusyKey();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<string>(value || '');
  const valueRef = useRef<string>(value || '');
  const submitKbd = `${COMPOSER_CONTEXT_SHORTCUT.submit.labelMac} · ${COMPOSER_CONTEXT_SHORTCUT.submitModEnter.labelMac}`;
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
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ta = root.querySelector(
      '[data-prp-composer-input], textarea'
    ) as HTMLTextAreaElement | null;
    if (!ta) return;
    try {
      ta.focus({ preventScroll: true });
    } catch {
      ta.focus();
    }
    try {
      const len = String(ta.value || '').length;
      ta.setSelectionRange?.(len, len);
    } catch {
      /* ignore */
    }
  }, []);
  const save = () => onSave?.(draft);
  return (
    <div
      ref={rootRef}
      className={`prp-body-editor${compact ? ' prp-body-editor--compact' : ''}`}
      data-prp-composer-root="1"
      data-prp-composer-kind="body"
    >
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
        onSubmitRequest={save}
      />
      <div className="prp-composer__row">
        <span className="inline-flex prp-opt-hint-host">
          <ShortcutHint label={submitKbd} preferredPlacement="top" />
          <Button
            size="sm"
            variant="primary"
            disabled={actionBusy}
            loading={isActionLoading(busyKey, ACTION_BUSY.saveBody)}
            onClick={save}
            title={`${t('cta_save')} (${submitKbd})`}
            data-prp-composer-submit="1"
          >
            {isActionLoading(busyKey, ACTION_BUSY.saveBody)
              ? t('cta_submitting')
              : t('cta_save')}
          </Button>
        </span>
        <Button size="sm" disabled={actionBusy} onClick={onCancel}>
          {t('cta_cancel')}
        </Button>
      </div>
    </div>
  );
}

export default BodyEditor;
