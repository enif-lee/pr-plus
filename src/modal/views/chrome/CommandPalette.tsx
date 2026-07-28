import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { filterPaletteCommands, formatShortcut } from '@lib/command-palette';
import { FloatingScrollbar } from '../../components/common/FloatingScrollbar';
import { useModalStore } from '../../store/modal-store';

/**
 * Step focus index with wrap (shared with pulls palette behavior).
 * Pure — also exported for unit tests via re-export path.
 */
export function stepPaletteFocusIndex(
  current: number,
  delta: number,
  count: number
): number {
  const n = Number(count) || 0;
  if (n <= 0) return -1;
  const d = delta < 0 ? -1 : 1;
  const cur = Number.isFinite(current) ? Number(current) : -1;
  if (cur < 0 || cur >= n) return d > 0 ? 0 : n - 1;
  let next = cur + d;
  if (next < 0) next = n - 1;
  if (next >= n) next = 0;
  return next;
}

/**
 * PR-view command palette — same `prp-pp-*` shell as pulls.
 * Focus moves via DOM class toggle only (no full list re-render).
 * `query` may be omitted — leaf-subscribes paletteQuery so typing does not re-render App.
 */
export function CommandPalette({ open, query: queryProp, onQuery, commands, onRun, onClose }: any) {
  const storeQuery = useModalStore((s) => s.paletteQuery);
  const storeSetQuery = useModalStore((s) => s.setPaletteQuery);
  const query = queryProp !== undefined ? queryProp : storeQuery;
  const handleQuery =
    typeof onQuery === 'function'
      ? onQuery
      : (q: string) => storeSetQuery(q == null ? '' : String(q));
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.platform || '');

  const filtered = useMemo(() => {
    if (typeof filterPaletteCommands === 'function') {
      return filterPaletteCommands(commands, query);
    }
    return Array.isArray(commands) ? commands : [];
  }, [commands, query]);

  const focusIndexRef = useRef(0);
  const listRef = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;
  /** Bump only when list content changes — not on focus moves */
  const [listEpoch, setListEpoch] = useState(0);
  const prevQueryRef = useRef(query);
  const prevCmdKeyRef = useRef('');

  const applyFocusDom = useCallback((idx: number) => {
    const listEl = listRef.current;
    if (!listEl) return;
    const rows = listEl.querySelectorAll('.prp-pp-item[data-prp-pp-index]');
    let focusedEl: Element | null = null;
    for (const row of rows) {
      const i = Number(row.getAttribute('data-prp-pp-index'));
      const on = i === idx;
      row.classList.toggle('is-focused', on);
      row.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) focusedEl = row;
    }
    try {
      // Instant — never smooth-scroll on focus step
      (focusedEl as HTMLElement | null)?.scrollIntoView?.({
        block: 'nearest',
        behavior: 'auto',
      });
    } catch {
      /* ignore */
    }
  }, []);

  const setFocusIndex = useCallback(
    (idx: number) => {
      const n = filteredRef.current.length;
      if (n <= 0) {
        focusIndexRef.current = 0;
        return;
      }
      const next = Math.max(0, Math.min(idx, n - 1));
      focusIndexRef.current = next;
      applyFocusDom(next);
    },
    [applyFocusDom]
  );

  // Rebuild list only when open / query / commands change
  useEffect(() => {
    if (!open) return;
    const cmdKey = Array.isArray(commands)
      ? commands.map((c: any) => c?.id).join('|')
      : '';
    const qChanged = prevQueryRef.current !== query;
    const cChanged = prevCmdKeyRef.current !== cmdKey;
    prevQueryRef.current = query;
    prevCmdKeyRef.current = cmdKey;
    if (qChanged || cChanged) {
      focusIndexRef.current = 0;
      setListEpoch((e) => e + 1);
    }
  }, [open, query, commands]);

  useEffect(() => {
    if (!open) return;
    focusIndexRef.current = 0;
    setListEpoch((e) => e + 1);
    queueMicrotask(() => {
      try {
        inputRef.current?.focus?.();
        inputRef.current?.select?.();
      } catch {
        /* ignore */
      }
      applyFocusDom(0);
    });
  }, [open, applyFocusDom]);

  // After list DOM paint, re-apply focus class
  useEffect(() => {
    if (!open) return;
    applyFocusDom(focusIndexRef.current);
  }, [listEpoch, filtered, open, applyFocusDom]);

  const runAt = useCallback(
    (idx: number) => {
      const cmd = filteredRef.current[idx];
      if (cmd) onRun?.(cmd);
    },
    [onRun]
  );

  const moveFocus = useCallback(
    (delta: number) => {
      const n = filteredRef.current.length;
      if (n <= 0) return;
      const next = stepPaletteFocusIndex(focusIndexRef.current, delta, n);
      setFocusIndex(next);
    },
    [setFocusIndex]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const alt = Boolean(e.altKey);
      const code = String(e.code || '');
      const key = String(e.key || '').toLowerCase();

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
        return;
      }

      // Arrow + Option+J/K (match pulls palette)
      const isDown =
        e.key === 'ArrowDown' ||
        (alt && (key === 'j' || code === 'KeyJ'));
      const isUp =
        e.key === 'ArrowUp' ||
        (alt && (key === 'k' || code === 'KeyK'));

      if (isDown) {
        e.preventDefault();
        e.stopPropagation();
        moveFocus(1);
        return;
      }
      if (isUp) {
        e.preventDefault();
        e.stopPropagation();
        moveFocus(-1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        runAt(focusIndexRef.current);
      }
    },
    [moveFocus, onClose, runAt]
  );

  if (!open) return null;

  return (
    <div className="prp-pp-layer prp-pp-layer--enter prp-pp-layer--modal" role="presentation">
      <div className="prp-pp-backdrop" data-prp-pp-close="1" onClick={() => onClose?.()} />
      <div
        className="prp-pp-panel"
        role="dialog"
        aria-label="pr+ command palette"
        aria-modal="true"
      >
        <div className="prp-pp-main">
          <div className="prp-pp-head">
            <input
              ref={inputRef}
              className="prp-pp-input"
              data-prp-pp-input
              type="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Type a command…  stack  merge  review"
              value={query}
              onChange={(e) => handleQuery(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className="prp-pp-meta prp-muted" data-prp-pp-meta>
              Opt+Shift actions · ↑↓ / ⌥J ⌥K · Enter · Esc · ⌥⇧K
            </div>
          </div>
          <div className="prp-scroll-float-host prp-edge-fade prp-pp-list-host">
            <ul
              ref={listRef}
              className="prp-pp-list prp-scroll-float"
              data-prp-pp-list
              data-prp-pp-epoch={listEpoch}
              role="listbox"
              aria-label="Commands"
            >
              {filtered.length === 0 ? (
                <li className="prp-pp-empty prp-muted">No matching commands</li>
              ) : (
                filtered.map((c: any, i: number) => {
                  // Focus class applied via DOM after paint — not React state
                  const shortcut = c.shortcut
                    ? typeof formatShortcut === 'function'
                      ? formatShortcut(c.shortcut, isMac)
                      : c.shortcut
                    : '';
                  return (
                    <li
                      key={c.id || i}
                      className="prp-pp-item prp-pp-item--action"
                      data-prp-pp-index={i}
                      role="option"
                      aria-selected="false"
                    >
                      <button
                        type="button"
                        className="prp-pp-item__btn prp-pp-item__btn--row"
                        data-prp-pp-index={i}
                        onClick={() => onRun?.(c)}
                        onMouseEnter={() => setFocusIndex(i)}
                      >
                        <span className="prp-pp-item__main">
                          <span className="prp-pp-item__title">{c.title}</span>
                          <span className="prp-pp-item__meta prp-pp-item__meta--action">
                            {c.section ? (
                              <span className="prp-pp-action-section">{c.section}</span>
                            ) : null}
                            {Array.isArray(c.aliases) && c.aliases.length
                              ? c.aliases.map((a: string) => (
                                  <kbd key={a} className="prp-pp-alias">
                                    {a}
                                  </kbd>
                                ))
                              : null}
                            {c.description ? (
                              <span className="prp-pp-action-desc">{c.description}</span>
                            ) : null}
                          </span>
                        </span>
                        {shortcut ? <kbd className="prp-pp-digit">{shortcut}</kbd> : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            <FloatingScrollbar
              scrollerRef={listRef}
              contentKey={`${listEpoch}:${filtered.length}:${query || ''}`}
            />
          </div>
          <div className="prp-pp-foot">
            <span className="prp-pp-foot__keys prp-muted">
              {isMac ? '⌥⇧K' : 'Alt+Shift+K'} · ↑↓ · ⌥J ⌥K · Enter · Esc
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
