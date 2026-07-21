import React from 'react';

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
  return (
    <button
      type="button"
      className={`prp-btn prp-btn--${variant} prp-btn--size-${size}${
        shortcut ? ' prp-btn--has-shortcut' : ''
      } ${className}`.trim()}
      title={title || undefined}
      data-shortcut={shortcut || undefined}
      {...rest}
    >
      {children}
      {shortcut ? (
        <span className="prp-btn__shortcut-pop" role="tooltip">
          {shortcut}
        </span>
      ) : null}
    </button>
  );
}
