import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  filterPaletteCommands,
  formatShortcut,
  parsePalettePrSearchQuery,
  matchCachedPrsForSearch,
  buildPrSearchPaletteCommands,
  buildPrSearchLoadingCommand,
  buildPrSearchEmptyCommand,
  applyPrSearchQuery,
  applyPrSearchAsyncResult,
  applyPrSearchAsyncError,
  createPalettePrSearchState,
  shouldKickPrSearchAsync,
  buildModalPaletteHelpEntries,
  type PalettePrSearchState,
} from '@lib/command-palette';
import { FloatingScrollbar } from '../../components/common/FloatingScrollbar';
import { useModalStore } from '../../store/modal-store';
import { useT } from '@lib/locale-context';
import {
  avatarImageDecodingAttr,
  avatarImageLoadingAttr,
  markAvatarImageFailed,
  markAvatarImageWarm,
} from '@lib/avatar-image-cache';

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

/** Author avatar or initials fallback — matches pulls-palette host chrome. */
function PalettePrAvatar({
  author,
  authorAvatarUrl,
}: {
  author?: string;
  authorAvatarUrl?: string;
}) {
  const login = String(author || '').trim();
  const url = String(authorAvatarUrl || '').trim();
  const initials = login ? login.slice(0, 2).toUpperCase() : '?';
  if (url) {
    // Prefer shared Avatar so warm-cache + initials-on-error match list rows.
    // Keep img fallback attrs in sync with avatar-image-cache for remounts.
    const loading = avatarImageLoadingAttr(url);
    const decoding = avatarImageDecodingAttr(url);
    return (
      <img
        className="prp-pp-avatar"
        src={url}
        alt=""
        width={28}
        height={28}
        loading={loading}
        decoding={decoding}
        referrerPolicy="no-referrer"
        data-avatar-loading={loading}
        onLoad={() => markAvatarImageWarm(url)}
        onError={() => markAvatarImageFailed(url)}
      />
    );
  }
  return (
    <span className="prp-pp-avatar prp-pp-avatar--fallback" aria-hidden="true">
      {initials}
    </span>
  );
}

/**
 * Rich PR row body: title + #num · avatar @author · Draft · head → base.
 * Same structure/classes as `renderPullsPalettePrBody` in host pulls-palette.
 */
function PalettePrBody({ item }: { item: any }) {
  const num = item?.number != null ? Number(item.number) : NaN;
  const author = String(item?.author || '').trim();
  const head = String(item?.headRef || '').trim();
  const base = String(item?.baseRef || '').trim();
  return (
    <span className="prp-pp-item__main">
      <span className="prp-pp-item__title">{item.title || ''}</span>
      <span className="prp-pp-item__meta">
        {Number.isFinite(num) ? (
          <span className="prp-pp-pr-num">#{num}</span>
        ) : null}
        {author ? (
          <span className="prp-pp-author">
            <PalettePrAvatar
              author={author}
              authorAvatarUrl={item.authorAvatarUrl}
            />
            <span className="prp-pp-author__login">@{author}</span>
          </span>
        ) : null}
        {item?.draft ? <span className="prp-pp-draft">Draft</span> : null}
        {head || base ? (
          <span className="prp-pp-branches">
            {head ? (
              <span className="prp-pp-branch" title={head}>
                {head}
              </span>
            ) : null}
            {head && base ? (
              <span className="prp-pp-branch-arrow" aria-hidden="true">
                →
              </span>
            ) : null}
            {base ? (
              <span className="prp-pp-branch prp-pp-branch--base" title={base}>
                {base}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/**
 * PR-view command palette — same `prp-pp-*` shell as pulls.
 * Focus moves via DOM class toggle only (no full list re-render).
 * `query` may be omitted — leaf-subscribes paletteQuery so typing does not re-render App.
 *
 * PR search (`#…` / `#$…`): cache-first from `openPulls`, then async via `searchPrs`.
 */
export function CommandPalette({
  open,
  query: queryProp,
  onQuery,
  commands,
  onRun,
  onClose,
  openPulls = [],
  searchPrs,
  helpEntries: helpEntriesProp,
  helpOpen: helpOpenProp,
  onHelpOpenChange,
  detail = null,
  layoutMode = 'centered',
  owner = '',
  repo = '',
}: any) {
  const t = useT();
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

  const [localHelpOpen, setLocalHelpOpen] = useState(false);
  const helpOpen =
    typeof helpOpenProp === 'boolean' ? helpOpenProp : localHelpOpen;
  const setHelpOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved =
        typeof next === 'function'
          ? (next as (p: boolean) => boolean)(helpOpen)
          : next;
      if (typeof onHelpOpenChange === 'function') onHelpOpenChange(resolved);
      else setLocalHelpOpen(resolved);
    },
    [helpOpen, onHelpOpenChange]
  );

  const [prSearch, setPrSearch] = useState<PalettePrSearchState>(() =>
    typeof createPalettePrSearchState === 'function'
      ? createPalettePrSearchState()
      : {
          isPrSearch: false,
          term: '',
          cacheHits: [],
          asyncHits: [],
          items: [],
          loading: false,
          error: null,
        }
  );
  const prSearchSeqRef = useRef(0);
  const prSearchAbortRef = useRef<AbortController | null>(null);

  // Cache-first + debounced async PR search (leaf-owned; App only injects fetch).
  // Bare `#` / `#$` is cache-only — remote fetch starts only after a non-empty
  // term settles past the debounce window.
  useEffect(() => {
    if (!open) {
      setPrSearch(
        typeof createPalettePrSearchState === 'function'
          ? createPalettePrSearchState()
          : {
              isPrSearch: false,
              term: '',
              cacheHits: [],
              asyncHits: [],
              items: [],
              loading: false,
              error: null,
            }
      );
      try {
        prSearchAbortRef.current?.abort?.();
      } catch {
        /* ignore */
      }
      prSearchAbortRef.current = null;
      return;
    }
    if (typeof applyPrSearchQuery !== 'function') return;
    const cached = Array.isArray(openPulls) ? openPulls : [];
    const next = applyPrSearchQuery(null, query, cached);
    setPrSearch(next);
    // Invalidate any in-flight request whenever the query changes.
    const seq = ++prSearchSeqRef.current;
    try {
      prSearchAbortRef.current?.abort?.();
    } catch {
      /* ignore */
    }
    prSearchAbortRef.current = null;
    if (!next.isPrSearch) {
      return;
    }
    const term = next.term;
    const kickAsync =
      typeof shouldKickPrSearchAsync === 'function'
        ? shouldKickPrSearchAsync(term)
        : String(term || '').trim().length > 0;
    if (!kickAsync) {
      return;
    }
    const ac =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    prSearchAbortRef.current = ac;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          let remote: any[] = [];
          if (typeof searchPrs === 'function') {
            const raw = await searchPrs(term, ac?.signal || null);
            remote =
              typeof matchCachedPrsForSearch === 'function'
                ? matchCachedPrsForSearch(raw || [], term)
                : Array.isArray(raw)
                  ? raw
                  : [];
          }
          if (seq !== prSearchSeqRef.current) return;
          setPrSearch((prev) =>
            typeof applyPrSearchAsyncResult === 'function'
              ? applyPrSearchAsyncResult(prev, term, remote)
              : { ...prev, asyncHits: remote, loading: false }
          );
        } catch (err: any) {
          if (seq !== prSearchSeqRef.current) return;
          if (err?.name === 'AbortError' || ac?.signal?.aborted) return;
          setPrSearch((prev) =>
            typeof applyPrSearchAsyncError === 'function'
              ? applyPrSearchAsyncError(
                  prev,
                  term,
                  err?.message || 'Search failed'
                )
              : {
                  ...prev,
                  loading: false,
                  error: String(err || 'Search failed'),
                }
          );
        }
      })();
    }, 180);
    return () => {
      clearTimeout(timer);
    };
  }, [open, query, openPulls, searchPrs]);

  const helpEntries = useMemo(() => {
    if (Array.isArray(helpEntriesProp)) return helpEntriesProp;
    if (typeof buildModalPaletteHelpEntries === 'function') {
      // Prefer document stamp so help matches live app locale without prop drilling
      let locale = 'en';
      try {
        locale =
          document.documentElement.getAttribute('data-prp-app-locale') ||
          document.documentElement.getAttribute('data-prp-ui-language') ||
          'en';
      } catch {
        /* ignore */
      }
      return buildModalPaletteHelpEntries(detail, {
        layoutMode:
          String(layoutMode || '').toLowerCase() === 'diff'
            ? 'diff'
            : 'centered',
        locale,
      });
    }
    return [];
  }, [helpEntriesProp, detail, layoutMode, open]);

  const filtered = useMemo(() => {
    if (prSearch.isPrSearch) {
      const rows: any[] = [];
      if (prSearch.loading) {
        rows.push(
          typeof buildPrSearchLoadingCommand === 'function'
            ? buildPrSearchLoadingCommand()
            : {
                id: 'pr-search-loading',
                title: 'Searching pull requests…',
                loading: true,
                disabled: true,
              }
        );
      }
      const prs = Array.isArray(prSearch.items) ? prSearch.items : [];
      if (prs.length) {
        const asCmds =
          typeof buildPrSearchPaletteCommands === 'function'
            ? buildPrSearchPaletteCommands(prs, { owner, repo, source: 'merged' })
            : prs;
        rows.push(...asCmds);
      } else if (!prSearch.loading) {
        rows.push(
          typeof buildPrSearchEmptyCommand === 'function'
            ? buildPrSearchEmptyCommand(prSearch.term)
            : {
                id: 'pr-search-empty',
                title: 'No pull requests found',
                empty: true,
                disabled: true,
              }
        );
      }
      return rows;
    }
    if (typeof filterPaletteCommands === 'function') {
      return filterPaletteCommands(commands, query);
    }
    return Array.isArray(commands) ? commands : [];
  }, [commands, query, prSearch, owner, repo]);

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

  useEffect(() => {
    if (!open) return;
    const cmdKey = Array.isArray(commands)
      ? commands.map((c: any) => c?.id).join('|')
      : '';
    const prKey = prSearch.isPrSearch
      ? `${prSearch.loading}:${prSearch.items.map((c: any) => c?.number).join('|')}`
      : 'off';
    const fullKey = `${cmdKey}::${prKey}`;
    const qChanged = prevQueryRef.current !== query;
    const cChanged = prevCmdKeyRef.current !== fullKey;
    prevQueryRef.current = query;
    prevCmdKeyRef.current = fullKey;
    if (qChanged || cChanged) {
      focusIndexRef.current = 0;
      setListEpoch((e) => e + 1);
    }
  }, [open, query, commands, prSearch]);

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

  useEffect(() => {
    if (!open) setHelpOpen(false);
  }, [open, setHelpOpen]);

  useEffect(() => {
    if (!open) return;
    applyFocusDom(focusIndexRef.current);
  }, [listEpoch, filtered, open, applyFocusDom]);

  const runAt = useCallback(
    (idx: number) => {
      const cmd = filteredRef.current[idx];
      if (!cmd) return;
      if (cmd.disabled || cmd.loading || cmd.empty || cmd.kind === 'status')
        return;
      if (cmd.action === 'toggleHelp') {
        setHelpOpen((v) => !v);
        return;
      }
      onRun?.(cmd);
    },
    [onRun, setHelpOpen]
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
        if (helpOpen) {
          setHelpOpen(false);
          return;
        }
        onClose?.();
        return;
      }

      const isDown =
        e.key === 'ArrowDown' || (alt && (key === 'j' || code === 'KeyJ'));
      const isUp =
        e.key === 'ArrowUp' || (alt && (key === 'k' || code === 'KeyK'));

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
    [moveFocus, onClose, runAt, helpOpen, setHelpOpen]
  );

  const runHelpEntry = useCallback(
    (entry: any) => {
      if (!entry) return;
      const list = Array.isArray(commands) ? commands : [];
      const cmd =
        list.find((c: any) => c?.id === entry.id) ||
        list.find((c: any) => c?.action === entry.action) ||
        {
          id: entry.id,
          action: entry.action,
          title: entry.title,
        };
      if (cmd.action === 'toggleHelp' || entry.action === 'toggleHelp') {
        setHelpOpen((v) => !v);
        return;
      }
      onRun?.(cmd);
    },
    [commands, onRun, setHelpOpen]
  );

  if (!open) return null;

  const isPrSearchMode =
    typeof parsePalettePrSearchQuery === 'function'
      ? parsePalettePrSearchQuery(query).isPrSearch
      : prSearch.isPrSearch;

  return (
    <div
      className="prp-pp-layer prp-pp-layer--enter prp-pp-layer--modal"
      role="presentation"
    >
      <div
        className="prp-pp-backdrop"
        data-prp-pp-close="1"
        onClick={() => onClose?.()}
      />
      <div
        className={`prp-pp-panel${helpOpen ? ' prp-pp-panel--help' : ''}`}
        role="dialog"
        aria-label="pr+ command palette"
        aria-modal="true"
        data-prp-pp-help-open={helpOpen ? '1' : '0'}
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
              placeholder={t('palette_shell_placeholder')}
              value={query}
              onChange={(e) => handleQuery(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className="prp-pp-meta prp-muted" data-prp-pp-meta>
              {isPrSearchMode
                ? prSearch.loading
                  ? t('pulls_palette_hint')
                  : t('pulls_palette_hint')
                : t('pulls_palette_hint')}
            </div>
          </div>
          <div className="prp-scroll-float-host prp-edge-fade prp-pp-list-host">
            <ul
              ref={listRef}
              className="prp-pp-list prp-scroll-float"
              data-prp-pp-list
              data-prp-pp-epoch={listEpoch}
              role="listbox"
              aria-label={
                isPrSearchMode
                  ? t('palette_shell_no_prs')
                  : t('palette_shell_no_commands')
              }
            >
              {filtered.length === 0 ? (
                <li className="prp-pp-empty prp-muted">
                  {isPrSearchMode
                    ? t('palette_shell_no_prs')
                    : t('palette_shell_no_commands')}
                </li>
              ) : (
                filtered.map((c: any, i: number) => {
                  const shortcut = c.shortcut
                    ? typeof formatShortcut === 'function'
                      ? formatShortcut(c.shortcut, isMac)
                      : c.shortcut
                    : '';
                  const isStatus =
                    c.kind === 'status' || c.loading || c.empty || c.disabled;
                  const isPr =
                    c.kind === 'pr' || c.action === 'openPullRequest';
                  return (
                    <li
                      key={c.id || i}
                      className={`prp-pp-item${
                        isStatus
                          ? c.loading
                            ? ' prp-pp-item--status prp-pp-item--loading'
                            : ' prp-pp-item--status'
                          : isPr
                            ? ' prp-pp-item--pr'
                            : ' prp-pp-item--action'
                      }`}
                      data-prp-pp-index={i}
                      data-prp-pp-loading={c.loading ? '1' : undefined}
                      role="option"
                      aria-selected="false"
                      aria-disabled={isStatus ? 'true' : undefined}
                    >
                      <button
                        type="button"
                        className="prp-pp-item__btn prp-pp-item__btn--row"
                        data-prp-pp-index={i}
                        disabled={Boolean(isStatus)}
                        onClick={() => runAt(i)}
                        onMouseEnter={() => setFocusIndex(i)}
                      >
                        {isPr && !isStatus ? (
                          <PalettePrBody item={c} />
                        ) : (
                          <span className="prp-pp-item__main">
                            <span className="prp-pp-item__title">{c.title}</span>
                            <span className="prp-pp-item__meta prp-pp-item__meta--action">
                              {c.section ? (
                                <span className="prp-pp-action-section">
                                  {c.section}
                                </span>
                              ) : null}
                              {Array.isArray(c.aliases) && c.aliases.length
                                ? c.aliases.map((a: string) => (
                                    <kbd key={a} className="prp-pp-alias">
                                      {a}
                                    </kbd>
                                  ))
                                : null}
                              {c.description ? (
                                <span className="prp-pp-action-desc">
                                  {c.description}
                                </span>
                              ) : null}
                            </span>
                          </span>
                        )}
                        {shortcut ? (
                          <kbd className="prp-pp-digit">{shortcut}</kbd>
                        ) : null}
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
              {isMac ? '⌥⇧K' : 'Alt+Shift+K'} · ↑↓ · ⌥J ⌥K · Enter · Esc · #PR
            </span>
            <button
              type="button"
              className="prp-pp-help-btn"
              data-prp-pp-help-toggle
              aria-expanded={helpOpen ? 'true' : 'false'}
              aria-controls="prp-pp-help-panel-modal"
              title="Help"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setHelpOpen(!helpOpen);
              }}
            >
              <svg
                className="prp-pp-help-icon"
                width="14"
                height="14"
                viewBox="0 0 16 16"
                aria-hidden="true"
                fill="currentColor"
              >
                <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm9 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.92 6.085c.081-.16.19-.299.34-.398.145-.097.346-.178.62-.178.26 0 .44.07.55.16.12.095.17.22.17.37 0 .17-.06.3-.19.42-.12.12-.33.26-.66.42-.4.19-.7.4-.92.64a1.7 1.7 0 0 0-.36.75 1 1 0 0 0 1.95.4c.02-.08.06-.15.12-.22.08-.09.2-.19.38-.28.4-.2.76-.45 1.02-.74.27-.3.4-.66.4-1.1 0-.47-.16-.88-.48-1.2-.32-.33-.8-.5-1.4-.5-.52 0-.96.13-1.32.39-.36.25-.6.61-.71 1.06a1 1 0 0 0 1.9.4Z" />
              </svg>
              <span className="prp-pp-help-btn__label prp-muted">help</span>
            </button>
          </div>
        </div>
        <aside
          className="prp-pp-help"
          id="prp-pp-help-panel-modal"
          data-prp-pp-help
          hidden={!helpOpen}
        >
          <div className="prp-pp-help__head">
            <div className="prp-pp-help__title">
              {String(layoutMode || '').toLowerCase() === 'diff'
                ? 'Diff actions'
                : 'Conversation actions'}
            </div>
            <button
              type="button"
              className="prp-pp-help-close"
              data-prp-pp-help-toggle
              aria-label="Close help"
              onClick={() => setHelpOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="prp-pp-help__list" data-prp-pp-help-list>
            {helpEntries.length === 0 ? (
              <div className="prp-pp-help__empty prp-muted">
                {t('palette_help_empty')}
              </div>
            ) : (
              helpEntries.map((e: any) => (
                <button
                  key={e.id}
                  type="button"
                  className="prp-pp-help__row"
                  data-prp-pp-help-run="1"
                  data-prp-pp-help-id={e.id}
                  data-prp-pp-help-action={e.action || ''}
                  onClick={() => runHelpEntry(e)}
                >
                  <span className="prp-pp-help__action">{e.title}</span>
                  <span className="prp-pp-help__aliases">
                    {(e.aliases || []).map((a: string) => (
                      <kbd key={a} className="prp-pp-help__alias">
                        {a}
                      </kbd>
                    ))}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="prp-pp-help__hint prp-muted">
            Click a row to run · or type alias + Enter · #PR search
          </div>
        </aside>
      </div>
    </div>
  );
}
