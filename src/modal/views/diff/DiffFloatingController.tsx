import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  gotoHighlightSegments,
  gotoPathQueryForMatch,
  rankGotoFileSuggestions,
  resolveGotoSubmitQuery,
  type GotoFileLike,
} from '@lib/diff-goto-suggest';

/** CustomEvent name — shell hotkeys (⌥G) open Goto without lifting state. */
export const PRP_OPEN_DIFF_GOTO = 'prp-open-diff-goto';

/**
 * Bottom-right Diff chrome: two separate floating surfaces
 * 1. Goto bar (fixed width) — path:line + ranked suggestions
 * 2. Control island — prev/next file & page + Goto toggle
 */
export function DiffFloatingController(props: {
  onPrevFile?: (() => void) | null;
  onNextFile?: (() => void) | null;
  onPrevPage?: (() => void) | null;
  onNextPage?: (() => void) | null;
  /** Submit Goto query (`path:line[:line]` or `line[:line]`). Return false to keep open. */
  onGoto?: ((query: string) => boolean | void) | null;
  /** PR files for autosuggest ranking / filter. */
  files?: GotoFileLike[] | null;
  disabled?: boolean;
  isMac?: boolean;
}) {
  const {
    onPrevFile,
    onNextFile,
    onPrevPage,
    onNextPage,
    onGoto,
    files = null,
    disabled = false,
    isMac = true,
  } = props;

  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoQuery, setGotoQuery] = useState('');
  /** Debounced query used for suggestion ranking (typing does not thrash list). */
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Debounce suggestion refresh (~120ms — short enough for e2e, long enough for type).
  useEffect(() => {
    if (!gotoOpen) return undefined;
    const t = window.setTimeout(() => setDebouncedQuery(gotoQuery), 120);
    return () => window.clearTimeout(t);
  }, [gotoQuery, gotoOpen]);

  useEffect(() => {
    if (!gotoOpen) {
      setDebouncedQuery('');
      setActiveIndex(0);
    }
  }, [gotoOpen]);

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

  // ⌥G / external open
  useEffect(() => {
    const onOpen = () => {
      if (disabled || typeof onGoto !== 'function') return;
      setGotoOpen(true);
    };
    window.addEventListener(PRP_OPEN_DIFF_GOTO, onOpen as EventListener);
    return () =>
      window.removeEventListener(PRP_OPEN_DIFF_GOTO, onOpen as EventListener);
  }, [disabled, onGoto]);

  const suggestions = useMemo(
    () =>
      rankGotoFileSuggestions(files, debouncedQuery, {
        idleLimit: 3,
        searchLimit: 12,
      }),
    [files, debouncedQuery]
  );

  // Path text used for bold match spans (same strip as ranking)
  const matchQuery = useMemo(
    () => gotoPathQueryForMatch(debouncedQuery),
    [debouncedQuery]
  );

  // Keep highlight in range when list shrinks
  useEffect(() => {
    if (activeIndex >= suggestions.length) {
      setActiveIndex(Math.max(0, suggestions.length - 1));
    }
  }, [suggestions.length, activeIndex]);

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

  function closeGoto() {
    setGotoOpen(false);
    setGotoQuery('');
    setDebouncedQuery('');
    setActiveIndex(0);
  }

  function submitGoto(raw?: string) {
    const q = String(raw != null ? raw : gotoQuery || '').trim();
    if (!q || typeof onGoto !== 'function') return;
    const ok = onGoto(q);
    if (ok !== false) closeGoto();
  }

  function confirmActiveSuggestion() {
    const typed = String(gotoQuery || '').trim();
    const hitPath = suggestions[activeIndex]?.path || null;
    // Bare line(s) → current file; never override with idle top-file suggestion
    const q = resolveGotoSubmitQuery(typed, hitPath);
    if (q) submitGoto(q);
  }

  // Layout stack only — Goto and control island are separate floating surfaces.
  return (
    <div className="prp-diff-float-stack" data-prp-diff-float-stack="1">
      {gotoOpen ? (
        <div
          className="prp-diff-float-goto"
          role="combobox"
          aria-expanded="true"
          aria-haspopup="listbox"
          data-prp-diff-goto="1"
        >
          {suggestions.length > 0 ? (
            <ul
              id="prp-diff-goto-list"
              className="prp-diff-float-goto__suggest"
              role="listbox"
              aria-label="File suggestions"
              data-prp-diff-goto-suggest="1"
            >
              {suggestions.map((s, i) => {
                const segments = gotoHighlightSegments(s.path, matchQuery);
                return (
                  <li key={s.path} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === activeIndex}
                      className={`prp-diff-float-goto__suggest-item${
                        i === activeIndex
                          ? ' prp-diff-float-goto__suggest-item--active'
                          : ''
                      }`}
                      data-prp-diff-goto-item={s.path}
                      data-active={i === activeIndex ? '1' : '0'}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => {
                        setActiveIndex(i);
                        const typed = String(gotoQuery || '').trim();
                        // Explicit click on a row always targets that path (unless bare line)
                        const q = resolveGotoSubmitQuery(typed, s.path);
                        submitGoto(q || s.path);
                      }}
                    >
                      <span className="prp-diff-float-goto__suggest-path">
                        {segments.map((seg, si) =>
                          seg.bold ? (
                            <strong
                              key={si}
                              className="prp-diff-float-goto__match"
                              data-prp-diff-goto-match="1"
                            >
                              {seg.text}
                            </strong>
                          ) : (
                            <span key={si}>{seg.text}</span>
                          )
                        )}
                      </span>
                      {s.volume > 0 ? (
                        <span className="prp-diff-float-goto__suggest-meta">
                          {s.volume}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : debouncedQuery.trim() ? (
            <div
              className="prp-diff-float-goto__suggest-empty prp-muted"
              data-prp-diff-goto-empty="1"
            >
              No matching files
            </div>
          ) : null}
          <input
            ref={inputRef}
            type="text"
            className="prp-diff-float-goto__input"
            value={gotoQuery}
            onChange={(e) => {
              setGotoQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Go to file… path:line"
            aria-label="Go to file path and lines"
            aria-autocomplete="list"
            aria-controls={
              suggestions.length ? 'prp-diff-goto-list' : undefined
            }
            disabled={disabled}
            data-prp-diff-goto-input="1"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                if (!suggestions.length) return;
                setActiveIndex((i) => (i + 1) % suggestions.length);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                if (!suggestions.length) return;
                setActiveIndex(
                  (i) => (i - 1 + suggestions.length) % suggestions.length
                );
              } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                const typed = String(gotoQuery || '').trim();
                // Bare line:line always submits as-is (current-file Goto)
                if (/^\d+(:\d+)?$/.test(typed)) {
                  submitGoto(typed);
                } else if (suggestions.length) {
                  confirmActiveSuggestion();
                } else {
                  submitGoto();
                }
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeGoto();
              }
            }}
          />
        </div>
      ) : null}

      <div
        className="prp-diff-float-nav"
        role="toolbar"
        aria-label="Diff file and page navigation"
        data-prp-diff-float-nav="1"
      >
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
            data-prp-diff-goto-toggle="1"
            onClick={() => {
              setGotoOpen((o) => {
                const next = !o;
                if (!next) {
                  setGotoQuery('');
                  setDebouncedQuery('');
                  setActiveIndex(0);
                }
                return next;
              });
            }}
            title="Go to file (⌥G)"
            aria-label="Go to file path and line"
            aria-expanded={gotoOpen}
          >
            <span className="prp-diff-float-nav__goto-label" aria-hidden="true">
              :
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default DiffFloatingController;
