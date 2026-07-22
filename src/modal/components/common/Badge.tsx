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

export function Badge({ children, tone = 'muted', className = '', title, ...rest }: any) {
  const autoTitle = textFromChildren(children);
  return (
    <span
      className={`prp-badge prp-badge--${tone} ${className}`.trim()}
      title={title != null ? title : autoTitle || undefined}
      {...rest}
    >
      <span className="prp-badge__text">{children}</span>
    </span>
  );
}
