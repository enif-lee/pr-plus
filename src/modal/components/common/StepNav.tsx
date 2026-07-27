import React, { memo } from 'react';
import { TipPopover } from '@common/TipPopover';
import { OptBtnHint } from '@common/OptBtnHint';

export type StepNavProps = {
  /** 0-based current hit/thread index; negative means none selected */
  index?: number;
  /** Total items */
  total?: number;
  onPrev?: () => void;
  onNext?: () => void;
  disabled?: boolean;
  /** Shown while busy (e.g. searching) instead of count */
  busy?: boolean;
  busyLabel?: string;
  /** Accessible name for the control group */
  label?: string;
  title?: string;
  className?: string;
  /** Prev control glyph (default ↑) */
  prevGlyph?: string;
  /** Next control glyph (default ↓) */
  nextGlyph?: string;
  prevTitle?: string;
  nextTitle?: string;
  /** Keyboard chord shown in tip (e.g. ⌥K / Alt+K) */
  prevShortcut?: string | null;
  /** Keyboard chord shown in tip (e.g. ⌥J / Alt+J) */
  nextShortcut?: string | null;
};

/**
 * Segmented count / prev / next control shared by:
 * - Diff thread navigator
 * - Find-in-PR / find-in-diff hit navigator
 *
 * Order: n/m · ↑ · ↓. Prev and next share the same fixed width.
 * Tips show description + shortcut when provided.
 * Opt-hold badges: OptBtnHint leaf-subscribes to modal store.
 */
export const StepNav = memo(function StepNav({
  index = -1,
  total = 0,
  onPrev,
  onNext,
  disabled = false,
  busy = false,
  busyLabel = '…',
  label = 'Navigate',
  title,
  className = '',
  prevGlyph = '↑',
  nextGlyph = '↓',
  prevTitle = 'Previous',
  nextTitle = 'Next',
  prevShortcut = null,
  nextShortcut = null,
}: StepNavProps) {
  const n = Math.max(0, Number(total) || 0);
  const i = Number(index);
  const countLabel = n
    ? `${Number.isFinite(i) && i >= 0 ? i + 1 : 0}/${n}`
    : '0/0';
  const navDisabled = Boolean(disabled || busy || n <= 0);
  const prevTip = prevTitle || 'Previous';
  const nextTip = nextTitle || 'Next';
  const prevKbd = prevShortcut ? String(prevShortcut).trim() : '';
  const nextKbd = nextShortcut ? String(nextShortcut).trim() : '';

  return (
    <div
      className={`prp-step-nav${className ? ` ${className}` : ''}${
        busy ? ' prp-step-nav--busy' : ''
      }`}
      role="group"
      aria-label={label}
      title={title}
      data-busy={busy ? '1' : undefined}
    >
      <span
        className="prp-step-nav__meta"
        title={
          busy
            ? busyLabel
            : n
              ? undefined
              : 'No items'
        }
        aria-live={busy ? 'polite' : undefined}
      >
        {busy ? busyLabel : countLabel}
      </span>
      <button
        type="button"
        className={`prp-step-nav__btn prp-has-tip${
          prevKbd ? ' prp-opt-hint-host' : ''
        }`}
        onClick={() => onPrev?.()}
        disabled={navDisabled}
        aria-label={prevKbd ? `${prevTip} (${prevKbd})` : prevTip}
      >
        {prevKbd ? (
          <OptBtnHint label={prevKbd} preferredPlacement="top" />
        ) : null}
        {prevGlyph}
        <TipPopover
          title={prevTip}
          shortcut={prevKbd || undefined}
          preferredPlacement="top"
        />
      </button>
      <button
        type="button"
        className={`prp-step-nav__btn prp-has-tip${
          nextKbd ? ' prp-opt-hint-host' : ''
        }`}
        onClick={() => onNext?.()}
        disabled={navDisabled}
        aria-label={nextKbd ? `${nextTip} (${nextKbd})` : nextTip}
      >
        {nextKbd ? (
          <OptBtnHint label={nextKbd} preferredPlacement="top" />
        ) : null}
        {nextGlyph}
        <TipPopover
          title={nextTip}
          shortcut={nextKbd || undefined}
          preferredPlacement="top"
        />
      </button>
    </div>
  );
});

export default StepNav;
