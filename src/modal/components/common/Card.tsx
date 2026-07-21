import React from 'react';

export function Card({ title, children, actions, className = '' }: { title?: any; children?: any; actions?: any; className?: string }) {
  return (
    <section className={`prp-card ${className}`.trim()}>
      {title ? (
        <div className="prp-card__head">
          <h3 className="prp-card__title">{title}</h3>
          {actions ? <div className="prp-card__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="prp-card__body">{children}</div>
    </section>
  );
}
