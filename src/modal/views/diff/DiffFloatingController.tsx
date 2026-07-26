import React, { useEffect, useRef, useState } from 'react';
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
} from '@common/icons';
import {
  DIFF_PAGE_SCROLL_SHORTCUT,
  FILE_NAV_SHORTCUT,
} from '@lib/shortcut-policy';

/**
 * Bottom-right Diff chrome: prev/next file & page + Goto path:line.
 * Shares the same handlers as keyboard shortcuts.
 */
export function DiffFloatingController(props: {
  onPrevFile?: (() => void) | null;
  onNextFile?: (() => void) | null;
  onPrevPage?: (() => void) | null;
  onNextPage?: (() => void) | null;
  /** Submit Goto query (`path:line[:line]` or `line[:line]`). Return false to keep open. */
  onGoto?: ((query: string) => boolean | void) | null;
  disabled?: boolean;
  isMac?: boolean;
}) {
  const {
    onPrevFile,
    onNextFile,
    onPrevPage,
    onNextPage,
    onGoto,
    disabled = false,
    isMac = true,
  } = props;

  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoQuery, setGotoQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!gotoOpen) return undefined;
    const t = window.setTimeout(() => {
      try {
        inputRef.current?.focus?.();
        inputRef.current?.select?.();
      } catch {
        /* ignore */
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [gotoOpen]);

  const filePrev = isMac
    ? FILE_NAV_SHORTCUT.prev.labelMac
    : FILE_NAV_SHORTCUT.prev.labelWin;
  const fileNext = isMac
    ? FILE_NAV_SHORTCUT.next.labelMac
    : FILE_NAV_SHORTCUT.next.labelWin;
  const pagePrev = isMac
    ? DIFF_PAGE_SCROLL_SHORTCUT.prev.labelMac
    : DIFF_PAGE_SCROLL_SHORTCUT.prev.labelWin;
  const pageNext = isMac
    ? DIFF_PAGE_SCROLL_SHORTCUT.next.labelMac
    : DIFF_PAGE_SCROLL_SHORTCUT.next.labelWin;

  function submitGoto() {
    const q = String(gotoQuery || '').trim();
    if (!q || typeof onGoto !== 'function') return;
    const ok = onGoto(q);
    if (ok !== false) {
      setGotoOpen(false);
      setGotoQuery('');
    }
  }

  return (
    <div
      className={`prp-diff-float-nav${gotoOpen ? ' prp-diff-float-nav--goto-open' : ''}`}
      role="toolbar"
      aria-label="Diff file and page navigation"
    >
      {gotoOpen ? (
        <div className="prp-diff-float-nav__goto" role="search">
          <input
            ref={inputRef}
            type="text"
            className="prp-diff-float-nav__goto-input"
            value={gotoQuery}
            onChange={(e) => setGotoQuery(e.target.value)}
            placeholder="path:line:line or line:line"
            aria-label="Go to file path and lines"
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                submitGoto();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setGotoOpen(false);
                setGotoQuery('');
              }
            }}
          />
        </div>
      ) : null}
      <div className="prp-diff-float-nav__btns">
        <button
          type="button"
          className="prp-diff-float-nav__btn"
          disabled={disabled || typeof onPrevFile !== 'function'}
          onClick={() => onPrevFile?.()}
          title={`Previous file (${filePrev})`}
          aria-label={`Previous file (${filePrev})`}
        >
          <IconChevronLeft size={14} />
        </button>
        <button
          type="button"
          className="prp-diff-float-nav__btn"
          disabled={disabled || typeof onPrevPage !== 'function'}
          onClick={() => onPrevPage?.()}
          title={`Previous page (${pagePrev})`}
          aria-label={`Previous page (${pagePrev})`}
        >
          <IconChevronUp size={14} />
        </button>
        <button
          type="button"
          className="prp-diff-float-nav__btn"
          disabled={disabled || typeof onNextPage !== 'function'}
          onClick={() => onNextPage?.()}
          title={`Next page (${pageNext})`}
          aria-label={`Next page (${pageNext})`}
        >
          <IconChevronDown size={14} />
        </button>
        <button
          type="button"
          className="prp-diff-float-nav__btn"
          disabled={disabled || typeof onNextFile !== 'function'}
          onClick={() => onNextFile?.()}
          title={`Next file (${fileNext})`}
          aria-label={`Next file (${fileNext})`}
        >
          <IconChevronRight size={14} />
        </button>
        <button
          type="button"
          className={`prp-diff-float-nav__btn prp-diff-float-nav__btn--goto${
            gotoOpen ? ' prp-diff-float-nav__btn--on' : ''
          }`}
          disabled={disabled || typeof onGoto !== 'function'}
          onClick={() => {
            setGotoOpen((o) => {
              const next = !o;
              if (!next) setGotoQuery('');
              return next;
            });
          }}
          title="Go to path:line"
          aria-label="Go to path and line"
          aria-expanded={gotoOpen}
        >
          <span className="prp-diff-float-nav__goto-label" aria-hidden="true">
            :
          </span>
        </button>
      </div>
    </div>
  );
}

export default DiffFloatingController;
