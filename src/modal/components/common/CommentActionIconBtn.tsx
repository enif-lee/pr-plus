import React from 'react';
import { TipPopover } from './TipPopover';
import { OptBtnHint } from './OptBtnHint';

/**
 * Icon chrome for comment actions: hover TipPopover (title + shortcut) and
 * Option-hold OptBtnHint when the parent comment/thread is focused.
 */
export function CommentActionIconBtn({
  tipTitle,
  shortcut,
  showShortcutHint = false,
  className = '',
  children,
  'aria-label': ariaLabel,
  disabled,
  ...rest
}: {
  tipTitle: string;
  /** e.g. ⌥Y — shown in TipPopover and OptBtnHint */
  shortcut?: string | null;
  /** When true, Opt-hold badge is eligible (focus ring on this comment/thread). */
  showShortcutHint?: boolean;
  className?: string;
  children?: React.ReactNode;
  'aria-label'?: string;
  disabled?: boolean;
  [key: string]: any;
}) {
  const tip = String(tipTitle || '').trim();
  const kbd = shortcut ? String(shortcut).trim() : '';
  const hostOpt = Boolean(showShortcutHint && kbd);
  return (
    <button
      type="button"
      className={[
        'prp-icon-btn',
        'prp-has-tip',
        hostOpt ? 'prp-opt-hint-host' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      // TipPopover owns hover copy — suppress native tooltip
      title={undefined}
      aria-label={ariaLabel || tip || undefined}
      disabled={disabled}
      data-shortcut={kbd || undefined}
      {...rest}
    >
      {hostOpt ? (
        <OptBtnHint label={kbd} preferredPlacement="top" />
      ) : null}
      <TipPopover
        title={tip || null}
        // Shortcut in hover tip only when this comment/thread is focused
        // (matches OptBtnHint eligibility).
        shortcut={hostOpt ? kbd || null : null}
        preferredPlacement="top"
      />
      {children}
    </button>
  );
}

export default CommentActionIconBtn;
