import React from 'react';

export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'info'; children: React.ReactNode }) {
  return <span className={`demo-badge demo-badge--${tone}`}>{children}</span>;
}
