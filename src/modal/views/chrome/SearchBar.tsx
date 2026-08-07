import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@common/Button';
import { StepNav } from '@common/StepNav';
import { stepNavShortcutLabel } from '@lib/shortcut-policy';
import './SearchAndFileNav.css';

/** Default pause after last keystroke before parent/search runs. */
export const SEARCH_INPUT_DEBOUNCE_MS = 320;

/**
 * Find bar with **local draft state** so typing never re-renders the heavy modal
 * tree. Parent only receives debounced commits (or immediate flush on Enter).
 */
export const SearchBar = memo(function SearchBar({
  open,
  query,
  hits,
  hitIndex,
  onChange,
  onClose,
  onNext,
  onPrev,
  inputRef,
  searching = false,
  debounceMs = SEARCH_INPUT_DEBOUNCE_MS,
  showLoadComments = false,
  onLoadComments = null,
  loadCommentsBusy = false,
  /**
   * `bar` — full-width row under header (conversation).
   * `toolbar` — inline slot in DiffToolbar (replaces review filters).
   */
  variant = 'bar',
  placeholder = null,
}: any) {
  const [draft, setDraft] = useState(() => String(query || ''));
  const draftRef = useRef(draft);
  const onChangeRef = useRef(onChange);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOpenRef = useRef(false);
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.platform || '');
  const prevShortcut = stepNavShortcutLabel('prev', isMac);
  const nextShortcut = stepNavShortcutLabel('next', isMac);

  draftRef.current = draft;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const next = String(query || '');
      setDraft(next);
      draftRef.current = next;
    }
    wasOpenRef.current = Boolean(open);
  }, [open, query]);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const commit = useCallback(
    (value: string) => {
      clearTimer();
      onChangeRef.current?.(value);
    },
    [clearTimer]
  );

  const scheduleCommit = useCallback(
    (value: string) => {
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        onChangeRef.current?.(value);
      }, Math.max(0, Number(debounceMs) || SEARCH_INPUT_DEBOUNCE_MS));
    },
    [clearTimer, debounceMs]
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  if (!open) return null;

  const committed = String(query || '');
  const draftTrim = draft.trim();
  const committedTrim = committed.trim();
  const pendingCommit = draft !== committed;
  const busy = Boolean(searching || (pendingCommit && draftTrim));
  const hitCount = Array.isArray(hits) ? hits.length : 0;

  const isToolbar = variant === 'toolbar';
  const ph =
    placeholder != null
      ? String(placeholder)
      : isToolbar
        ? 'Find in diff…'
        : 'Find in description, comments, reviews…';

  return (
    <div
      className={`prp-search${busy ? ' prp-search--busy' : ''}${
        isToolbar ? ' prp-search--toolbar' : ''
      }`}
      role="search"
      aria-busy={busy || undefined}
      data-variant={isToolbar ? 'toolbar' : 'bar'}
    >
      <input
        ref={inputRef}
        className="prp-search__input"
        value={draft}
        placeholder={ph}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          draftRef.current = v;
          scheduleCommit(v);
        }}
        onKeyDown={(e) => {
          // ⌘F / Ctrl+F while already in the finder: select all + block browser find
          const isFindChord =
            (e.key === 'f' || e.key === 'F' || e.code === 'KeyF') &&
            (e.metaKey || e.ctrlKey) &&
            !e.altKey &&
            !e.shiftKey;
          if (isFindChord) {
            e.preventDefault();
            e.stopPropagation();
            try {
              const el = e.currentTarget as HTMLInputElement;
              el.focus({ preventScroll: true });
              const len = String(el.value || '').length;
              if (typeof el.select === 'function') el.select();
              else el.setSelectionRange?.(0, len);
            } catch {
              /* ignore */
            }
            return;
          }
          if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            if (pendingCommit) {
              commit(draft);
            } else {
              onPrev?.();
            }
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (pendingCommit) {
              commit(draft);
            } else {
              onNext?.();
            }
          } else if (e.key === 'Escape') {
            e.preventDefault();
            clearTimer();
            onClose?.();
          }
        }}
      />
      {showLoadComments && typeof onLoadComments === 'function' ? (
        <Button
          size="sm"
          variant="primary"
          className="prp-search__load-comments"
          disabled={busy || loadCommentsBusy}
          onClick={() => void onLoadComments?.()}
          title="Load every remaining review thread/comment for full-text search"
        >
          {loadCommentsBusy ? 'Loading all…' : 'Load Comments'}
        </Button>
      ) : null}
      {busy ? (
        <span className="prp-search__loading" role="status" aria-live="polite">
          <span className="prp-search__spinner" aria-hidden="true" />
          <span className="prp-search__loading-label">Searching…</span>
        </span>
      ) : (
        <StepNav
          className="prp-search__step-nav"
          index={hitIndex}
          total={hitCount}
          onPrev={() => onPrev?.()}
          onNext={() => onNext?.()}
          disabled={!hitCount}
          label="Search hits"
          title={
            hitCount
              ? undefined
              : draftTrim || committedTrim
                ? 'No matches'
                : undefined
          }
          prevTitle="Previous match"
          nextTitle="Next match"
          prevShortcut={prevShortcut}
          nextShortcut={nextShortcut}
        />
      )}
      <Button size="sm" onClick={() => onClose?.()}>
        Esc
      </Button>
      {busy ? (
        <div
          className="prp-search__loading-bar"
          role="progressbar"
          aria-label="Searching pull request"
          aria-busy="true"
        />
      ) : null}
    </div>
  );
});
