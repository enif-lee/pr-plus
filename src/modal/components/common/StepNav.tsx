import React, { memo } from 'react';

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
};

/**
 * Segmented count / prev / next control shared by:
 * - Diff thread navigator
 * - Find-in-PR / find-in-diff hit navigator
 *
 * Order: n/m · ↑ · ↓. Prev and next share the same fixed width.
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
}: StepNavProps) {
  const n = Math.max(0, Number(total) || 0);
  const i = Number(index);
  const countLabel = n
    ? `${Number.isFinite(i) && i >= 0 ? i + 1 : 0}/${n}`
    : '0/0';
  const navDisabled = Boolean(disabled || busy || n <= 0);

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
        className="prp-step-nav__btn"
        onClick={() => onPrev?.()}
        disabled={navDisabled}
        title={prevTitle}
        aria-label={prevTitle}
      >
        {prevGlyph}
      </button>
      <button
        type="button"
        className="prp-step-nav__btn"
        onClick={() => onNext?.()}
        disabled={navDisabled}
        title={nextTitle}
        aria-label={nextTitle}
      >
        {nextGlyph}
      </button>
    </div>
  );
});

export default StepNav;
