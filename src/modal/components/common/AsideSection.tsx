import React, { useState } from 'react';
import { IconDisclosure } from './icons';

/**
 * Flat GitHub-style sidebar section (title + body, hairline separator).
 * Prefer over Card in the conversation right rail.
 * Set collapsible + defaultOpen={false} for sections that start folded.
 * `loading` shows a spinner next to the title (useful when collapsed so body
 * skeletons are not visible).
 */
export function AsideSection({
  title,
  children,
  actions,
  className = '',
  collapsible = false,
  defaultOpen = true,
  loading = false,
  ...rest
}: {
  title?: any;
  children?: any;
  actions?: any;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Show spinning indicator to the right of the section title. */
  loading?: boolean;
  [key: string]: any;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const hasHead = title != null || actions != null;
  const titleIsPlain =
    title == null || typeof title === 'string' || typeof title === 'number';
  const showBody = !collapsible || open;
  const busy = Boolean(loading);

  const titleNode = titleIsPlain ? (
    <h3 className="prp-aside-section__title">{title}</h3>
  ) : (
    <div className="prp-aside-section__title">{title}</div>
  );

  const loadingSpin = busy ? (
    <span
      className="prp-aside-section__loading"
      aria-hidden="true"
      title="Loading…"
    />
  ) : null;

  return (
    <section
      className={`prp-aside-section${
        collapsible ? ' prp-aside-section--collapsible' : ''
      }${collapsible && !open ? ' prp-aside-section--collapsed' : ''}${
        busy ? ' prp-aside-section--loading' : ''
      }${className ? ` ${className}` : ''}`.trim()}
      data-loading={busy ? '1' : undefined}
      aria-busy={busy ? true : undefined}
      {...rest}
    >
      {hasHead ? (
        <div className="prp-aside-section__head">
          {collapsible && title != null ? (
            <button
              type="button"
              className="prp-aside-section__toggle"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              title={
                open
                  ? `Collapse ${titleIsPlain ? title : 'section'}`
                  : `Expand ${titleIsPlain ? title : 'section'}`
              }
            >
              <span className="prp-aside-section__chev" aria-hidden="true">
                <IconDisclosure open={open} size={12} />
              </span>
              {titleNode}
              {loadingSpin}
            </button>
          ) : title != null ? (
            <>
              {titleNode}
              {loadingSpin}
            </>
          ) : null}
          {actions ? (
            <div className="prp-aside-section__actions">{actions}</div>
          ) : null}
        </div>
      ) : null}
      {showBody ? (
        <div className="prp-aside-section__body">{children}</div>
      ) : null}
    </section>
  );
}

export default AsideSection;
