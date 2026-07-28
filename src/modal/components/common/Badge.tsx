import React from 'react';

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
 */
export function Badge({
  children,
  tone = 'muted',
  className = '',
  title,
  ...rest
}: any) {
  const autoTitle = textFromChildren(children);
  return (
    <span
      className={`prp-badge prp-badge--${tone} inline-flex h-5 max-w-[min(160px,100%)] min-w-0 items-center overflow-hidden whitespace-nowrap rounded-full px-2 text-[11px] font-semibold ${className}`.trim()}
      title={title != null ? title : autoTitle || undefined}
      {...rest}
    >
      <span className="prp-badge__text min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {children}
      </span>
    </span>
  );
}
