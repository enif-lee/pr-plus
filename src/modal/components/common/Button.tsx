import React from 'react';
import { TipPopover, hasTipContent } from './TipPopover';

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
  ...rest
}: {
  children?: any;
  variant?: string;
  size?: string;
  className?: string;
  shortcut?: string;
  title?: string;
  [key: string]: any;
}) {
  const tipLabel = title ? String(title).trim() : '';
  const tipKbd = shortcut ? String(shortcut).trim() : '';
  const hasTip = hasTipContent(title, shortcut);
  const { 'aria-label': ariaLabelProp, ...btnRest } = rest;
  return (
    <button
      type="button"
      className={`prp-btn prp-btn--${variant} prp-btn--size-${size}${
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
      <TipPopover title={tipLabel || null} shortcut={tipKbd || null} />
    </button>
  );
}
