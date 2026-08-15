import React from 'react';
import './Badge.css';

function textFromChildren(children: unknown): string {
  if (children == null || children === false) return '';
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(textFromChildren).filter(Boolean).join(' ');
  }
  return '';
}

/**
 * Status / label chip. Layout: Tailwind. Tone colors: Badge.css residual.
 * @param {'bordered'|'soft'} [variant] bordered = outline chip; soft = fill only (no border)
 */
export function Badge({
  children,
  tone = 'muted',
  variant = 'bordered',
  className = '',
  title,
  ...rest
}: any) {
  const autoTitle = textFromChildren(children);
  const soft = variant === 'soft' || variant === 'plain';
  // Prefer explicit title (e.g. full PR title on ellipsized chips). Put it on
  // both the root and the text span so hover over the ellipsis still shows it
  // (inner overflow box is the actual pointer target).
  const tip =
    title != null && String(title).length
      ? String(title)
      : autoTitle || undefined;
  return (
    <span
      className={`prp-badge prp-badge--${tone}${soft ? ' prp-badge--soft' : ''} inline-flex h-5 max-w-[min(160px,100%)] min-w-0 items-center overflow-hidden whitespace-nowrap rounded-full px-2 text-[11px] font-semibold ${className}`.trim()}
      title={tip}
      {...rest}
    >
      <span
        className="prp-badge__text min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
        title={tip}
      >
        {children}
      </span>
    </span>
  );
}
