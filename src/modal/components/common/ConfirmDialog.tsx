import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';

export type ConfirmDialogTone = 'danger' | 'warn' | 'default';

export type ConfirmDialogProps = {
  open: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  busy?: boolean;
  /** Match modal shell theme (tokens live on .prp-overlay; confirm is body-portaled). */
  colorMode?: 'light' | 'dark' | string | null;
  onConfirm?: () => void;
  onCancel?: () => void;
};

/**
 * In-app confirmation (replaces browser window.confirm for PR product shell).
 * Portaled to document.body above TipPopover / ShortcutHint layers.
 */
export function ConfirmDialog({
  open,
  title = 'Confirm',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  colorMode = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const mode =
    String(colorMode || '').toLowerCase() === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => {
      try {
        confirmRef.current?.focus?.();
      } catch {
        /* ignore */
      }
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        // Same-target window listeners (modal Escape) must not run after us
        e.stopImmediatePropagation();
        if (!busy) onCancel?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  const toneCls =
    tone === 'danger'
      ? ' prp-confirm--danger'
      : tone === 'warn'
        ? ' prp-confirm--warn'
        : '';
  const themeCls = mode === 'dark' ? ' prp-theme-dark' : ' prp-theme-light';

  const layer = (
    <div
      className={`prp-confirm-layer prp-confirm-layer--enter${themeCls}${toneCls}`}
      role="presentation"
      data-prp-confirm="1"
      /* Do NOT set data-color-mode — GH CSS `[data-color-mode]{background:canvas}`
         paints the full-screen layer solid and hides the page under the veil. */
      data-prp-color-mode={mode}
    >
      <div
        className="prp-confirm-backdrop"
        onClick={() => {
          if (!busy) onCancel?.();
        }}
      />
      <div
        className={`prp-confirm-panel prp-confirm-panel--enter`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="prp-confirm-title"
        aria-describedby="prp-confirm-msg"
      >
        <h2 id="prp-confirm-title" className="prp-confirm-title">
          {title}
        </h2>
        {message ? (
          <p id="prp-confirm-msg" className="prp-confirm-msg">
            {message}
          </p>
        ) : (
          <p id="prp-confirm-msg" className="prp-confirm-msg prp-confirm-msg--empty" />
        )}
        <div className="prp-confirm-actions">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onCancel?.()}
          >
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef as any}
            type="button"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            disabled={busy}
            onClick={() => onConfirm?.()}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return layer;
  return createPortal(layer, document.body);
}
