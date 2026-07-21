import React from 'react';

export function Badge({ children, tone = 'muted', className = '' }: any) {
  return (
    <span className={`prp-badge prp-badge--${tone} ${className}`.trim()}>{children}</span>
  );
}
