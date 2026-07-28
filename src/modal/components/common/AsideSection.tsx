import React, { useState } from 'react';
import { IconDisclosure } from './icons';
import './AsideSection.css';

/**
 * Flat GitHub-style sidebar section (title + body, hairline separator).
 * Layout: Tailwind. Residual tokens/spinner: AsideSection.css
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
    <h3 className="prp-aside-section__title m-0 text-xs font-semibold leading-snug">
      {title}
    </h3>
  ) : (
    <div className="prp-aside-section__title m-0 text-xs font-semibold leading-snug">
      {title}
    </div>
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
        <div className="prp-aside-section__head mb-1.5 flex items-center justify-between gap-2 p-0">
          {collapsible && title != null ? (
            <button
              type="button"
              className="prp-aside-section__toggle inline-flex min-w-0 flex-1 items-center gap-1.5 p-0"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              title={
                open
                  ? `Collapse ${titleIsPlain ? title : 'section'}`
                  : `Expand ${titleIsPlain ? title : 'section'}`
              }
            >
              <span
                className="prp-aside-section__chev inline-flex w-3 shrink-0 items-center justify-center text-[11px] text-[color:var(--prp-fg-muted)]"
                aria-hidden="true"
              >
                <IconDisclosure open={open} size={12} />
              </span>
              {titleNode}
              {loadingSpin}
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {titleNode}
              {loadingSpin}
            </div>
          )}
          {actions != null ? (
            <div className="prp-aside-section__actions inline-flex shrink-0 items-center gap-0.5">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      {showBody ? (
        <div className="prp-aside-section__body m-0 min-w-0 p-0">{children}</div>
      ) : null}
    </section>
  );
}

export default AsideSection;
