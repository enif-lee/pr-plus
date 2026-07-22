import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@common/Button';

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
}: any) {
  const [draft, setDraft] = useState(() => String(query || ''));
  const draftRef = useRef(draft);
  const onChangeRef = useRef(onChange);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOpenRef = useRef(false);

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

  return (
    <div
      className={`prp-search${busy ? ' prp-search--busy' : ''}`}
      role="search"
      aria-busy={busy || undefined}
    >
      <input
        ref={inputRef}
        className="prp-search__input"
        value={draft}
        placeholder="Find in description, comments, reviews…"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          draftRef.current = v;
          scheduleCommit(v);
        }}
        onKeyDown={(e) => {
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
        <span
          className="prp-search__count"
          title={
            hitCount
              ? undefined
              : draftTrim || committedTrim
                ? 'No matches'
                : undefined
          }
        >
          {hitCount ? `${(hitIndex ?? 0) + 1}/${hitCount}` : '0/0'}
        </span>
      )}
      <Button size="sm" onClick={() => onPrev?.()} disabled={busy || !hitCount}>
        ↑
      </Button>
      <Button size="sm" onClick={() => onNext?.()} disabled={busy || !hitCount}>
        ↓
      </Button>
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
