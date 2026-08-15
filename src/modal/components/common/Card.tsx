import React from 'react';

export function Card({
  title,
  children,
  actions,
  className = '',
  ...rest
}: {
  title?: any;
  children?: any;
  actions?: any;
  className?: string;
  [key: string]: any;
}) {
  const hasHead = title != null || actions != null;
  // Plain strings stay as <h3>; custom nodes (e.g. tablist) use a div to avoid
  // invalid interactive content inside a heading.
  const titleIsPlain =
    title == null || typeof title === 'string' || typeof title === 'number';
  return (
    <section className={`prp-card ${className}`.trim()} {...rest}>
      {hasHead ? (
        <div className="prp-card__head">
          {title != null ? (
            titleIsPlain ? (
              <h3 className="prp-card__title">{title}</h3>
            ) : (
              <div className="prp-card__title">{title}</div>
            )
          ) : null}
          {actions ? <div className="prp-card__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="prp-card__body">{children}</div>
    </section>
  );
}
