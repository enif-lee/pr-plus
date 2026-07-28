import React from 'react';
import { TipPopover, hasTipContent, type TipPlacement } from './TipPopover';
import './Button.css';

/**
 * Shared button. Optional `title` / `shortcut` render a hover/focus popover
 * (native browser tooltips are disabled when a popover is shown).
 */
export function Button({
  children,
  variant = 'default',
  size = 'default',
  className = '',
  shortcut,
  title,
  tipPlacement,
  ...rest
}: {
  children?: any;
  variant?: string;
  size?: string;
  className?: string;
  shortcut?: string;
  title?: string;
  /** Prefer tip side; falls back to TipPopover context inference when omitted */
  tipPlacement?: TipPlacement;
  [key: string]: any;
}) {
  const tipLabel = title ? String(title).trim() : '';
  const tipKbd = shortcut ? String(shortcut).trim() : '';
  const hasTip = hasTipContent(title, shortcut);
  const { 'aria-label': ariaLabelProp, ...btnRest } = rest;
  const sizeTw =
    size === 'sm'
      ? 'h-7 px-2 text-xs gap-1'
      : size === 'lg'
        ? 'h-9 px-3 text-sm gap-1.5'
        : 'h-8 px-2.5 text-xs gap-1';
  return (
    <button
      type="button"
      className={`prp-btn prp-btn--${variant} prp-btn--size-${size} inline-flex items-center justify-center rounded-md whitespace-nowrap select-none ${sizeTw}${
        hasTip ? ' prp-has-tip' : ''
      }${tipKbd ? ' prp-btn--has-shortcut' : ''} ${className}`.trim()}
      title={undefined}
      aria-label={
        ariaLabelProp != null ? ariaLabelProp : tipLabel || undefined
      }
      data-shortcut={tipKbd || undefined}
      {...btnRest}
    >
      {children}
      <TipPopover
        title={tipLabel || null}
        shortcut={tipKbd || null}
        preferredPlacement={tipPlacement}
      />
    </button>
  );
}
