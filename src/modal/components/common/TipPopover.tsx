import React from 'react';

/**
 * Hover/focus popover for icon buttons and actions.
 * Parent must be `position: relative` (`.prp-btn`, `.prp-header__icon-btn`, …).
 */
export function TipPopover({
  title,
  shortcut,
}: {
  title?: string | null;
  shortcut?: string | null;
}) {
  const tipLabel = title ? String(title).trim() : '';
  const tipKbd = shortcut ? String(shortcut).trim() : '';
  if (!tipLabel && !tipKbd) return null;
  return (
    <span className="prp-tip-pop" role="tooltip">
      {tipLabel ? <span className="prp-tip-pop__label">{tipLabel}</span> : null}
      {tipKbd ? <kbd className="prp-tip-pop__kbd">{tipKbd}</kbd> : null}
    </span>
  );
}

/** True when TipPopover would render something. */
export function hasTipContent(title?: string | null, shortcut?: string | null) {
  return Boolean(
    (title && String(title).trim()) || (shortcut && String(shortcut).trim())
  );
}
