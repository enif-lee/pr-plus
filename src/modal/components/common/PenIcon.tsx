import React from 'react';

/** GitHub-style pencil (not the ✎ glyph). */
export function PenIcon({ className = '', size = 14 }: { className?: string; size?: number }) {
  return (
    <svg
      className={`prp-pen-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.314 1.375-8.61 8.61a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.249.249 0 0 0 .108-.064l8.61-8.61a.25.25 0 0 0 0-.354l-1.086-1.086a.25.25 0 0 0-.354 0Z" />
    </svg>
  );
}

export default PenIcon;
