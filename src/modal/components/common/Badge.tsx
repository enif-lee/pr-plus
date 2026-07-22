import React from 'react';

export function Badge({ children, tone = 'muted', className = '', ...rest }: any) {
  return (
    <span className={`prp-badge prp-badge--${tone} ${className}`.trim()} {...rest}>
      {children}
    </span>
  );
}
