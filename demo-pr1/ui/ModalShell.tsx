import React from 'react';

export function ModalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="demo-modal" role="dialog">
      <div className="demo-modal__panel">{children}</div>
    </div>
  );
}
