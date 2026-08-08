import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  filterSelectOptions,
  labelColorCss,
  pickFilteredOptionByIndex,
  queryMatchesOption,
  resolveOptDigitPickIndex,
} from '@lib/searchable-select';
import { Avatar } from './Avatar';
import { IconCheck } from './icons';
import { OptBtnHint } from './OptBtnHint';
import './SearchableSelect.css';

/**
 * Anchored popover searchable select.
 * - Single: click option → onPick
 * - Multi: toggle options, free-text Enter adds to selection, Apply → onConfirm(ids)
 * - allowCreate: when free-text does not match any option, show Create… row
 */
export function SearchableSelect({
  open,
  title,
  options = [],
  query,
  onQuery,
  onPick,
  onClose,
  placeholder = 'Type to filter…',
  emptyLabel = 'No matches',
  allowFreeText = true,
  /**
   * When true and the typed name does not match any option, show a Create… row.
   * Click / Enter (with no filtered hits) calls onCreate(name) when provided,
   * otherwise falls back to onPick({ id, label, create: true }).
   */
  allowCreate = false,
  onCreate = null,
  createLabel = null,
  createBusy = false,
  anchorRef,
  anchorKey = null,
  /**
   * Preferred open direction.
   * - bottom (default): open below the anchor; flip above only when space is insufficient
   * - top: open above; flip below only when space is insufficient
   */
  placement = 'bottom',
  multi = false,
  /** Initial selected ids when multi opens */
  initialSelectedIds = null,
  onConfirm = null,
  confirmLabel = 'Apply',
  /**
   * Optional multi-toggle resolver (e.g. commit range fill).
   * When set, called as (prevSelectedIds, clickedId) → nextSelectedIds
   * instead of plain add/remove.
   */
  resolveMultiToggle = null,
  /**
   * Panel width bounds (px). Defaults keep other pickers compact;
   * commit picker passes a wider min/max so messages fit.
   */
  minWidth = 220,
  maxWidth = 320,
}: any) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  // Reset multi selection when opening
  useEffect(() => {
    if (!open) return;
    if (!multi) {
      setSelected([]);
      return;
    }
    const init = Array.isArray(initialSelectedIds)
      ? initialSelectedIds.map((x) => String(x))
      : [];
    setSelected(init);
  }, [open, multi, initialSelectedIds]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }

    function measure() {
      const el = (anchorRef?.current || null) as HTMLElement | null;
      if (!el || typeof el.getBoundingClientRect !== 'function') return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height && r.top === 0 && r.left === 0) return;

      const gap = 6;
      const edge = 8;
      const minW = Number.isFinite(Number(minWidth)) ? Math.max(160, Number(minWidth)) : 220;
      const maxW = Number.isFinite(Number(maxWidth))
        ? Math.max(minW, Number(maxWidth))
        : 320;
      const width = Math.max(minW, Math.min(maxW, Math.max(r.width, minW)));
      const left = Math.min(Math.max(edge, r.left), window.innerWidth - width - edge);
      const h = panelRef.current?.offsetHeight || 0;
      const preferBottom = placement !== 'top';

      // Preferred side first; flip only when the preferred side cannot fit the panel.
      let top = preferBottom ? r.bottom + gap : Math.max(edge, r.top - gap);
      if (h > 0) {
        const belowTop = r.bottom + gap;
        const aboveTop = r.top - h - gap;
        const fitsBelow = belowTop + h <= window.innerHeight - edge;
        const fitsAbove = aboveTop >= edge;

        if (preferBottom) {
          if (fitsBelow) {
            top = belowTop;
          } else if (fitsAbove) {
            top = aboveTop;
          } else {
            // Neither fits fully — pick the side with more free space
            const spaceBelow = window.innerHeight - r.bottom - edge;
            const spaceAbove = r.top - edge;
            top = spaceAbove > spaceBelow ? Math.max(edge, aboveTop) : belowTop;
          }
        } else {
          // placement === 'top'
          if (fitsAbove) {
            top = aboveTop;
          } else if (fitsBelow) {
            top = belowTop;
          } else {
            const spaceBelow = window.innerHeight - r.bottom - edge;
            const spaceAbove = r.top - edge;
            top = spaceBelow > spaceAbove ? belowTop : Math.max(edge, aboveTop);
          }
        }
      }
      setPos({ top: Math.max(edge, top), left, width });
    }

    measure();
    const id = requestAnimationFrame(() => {
      measure();
      requestAnimationFrame(measure);
    });
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [
    open,
    anchorRef,
    anchorKey,
    placement,
    query,
    options?.length,
    selected.length,
    multi,
    minWidth,
    maxWidth,
  ]);

  const filteredLive = useMemo(() => {
    if (!open) return [];
    return typeof filterSelectOptions === 'function'
      ? filterSelectOptions(options, query)
      : (options || []).slice(0, 50);
  }, [open, options, query]);

  // Keep latest filtered + callbacks for window capture handlers (no stale closure).
  const filteredRef = useRef(filteredLive);
  filteredRef.current = filteredLive;
  const multiRef = useRef(multi);
  multiRef.current = multi;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    if (!open) return undefined;
    const claim = (e: KeyboardEvent) => {
      try {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      } catch {
        /* ignore */
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Claim before App shell close (window capture).
        claim(e);
        onClose?.();
        return;
      }
      // ⌘/Ctrl+Enter confirms: multi → Apply selection; single → pickEnter (first/create).
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.altKey) {
        claim(e);
        if (multiRef.current) {
          const ids = selectedRef.current.slice();
          if (typeof onConfirmRef.current === 'function') {
            onConfirmRef.current(ids);
          } else if (ids.length === 1) {
            onPickRef.current?.({ id: ids[0], label: ids[0] });
          }
        } else {
          // Fire primary footer confirm for single (milestone / reviewer / assignee)
          try {
            const btn = panelRef.current?.querySelector?.(
              '[data-prp-sselect-confirm="1"]'
            ) as HTMLButtonElement | null;
            if (btn) btn.click();
            else {
              const hit = filteredRef.current?.[0];
              if (hit) onPickRef.current?.(hit);
            }
          } catch {
            const hit = filteredRef.current?.[0];
            if (hit) onPickRef.current?.(hit);
          }
        }
        return;
      }
      // Single-select: ⌥1 / ⌥2 / ⌥3 → first three filtered hits.
      if (!multiRef.current) {
        const idx = resolveOptDigitPickIndex(e);
        if (idx != null) {
          const hit = pickFilteredOptionByIndex(filteredRef.current, idx);
          if (hit) {
            claim(e);
            onPickRef.current?.(hit);
          }
        }
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef?.current?.contains?.(t)) return;
      onClose?.();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onDown, true);
    };
  }, [open, onClose, anchorRef]);

  const selectedSet = useMemo(
    () => new Set(selected.map((s) => s.toLowerCase())),
    [selected]
  );

  if (!open) return null;

  const filtered = filteredLive;
  const free = String(query || '').trim();
  const exactMatch =
    typeof queryMatchesOption === 'function'
      ? queryMatchesOption(options, free)
      : false;
  const showCreate =
    Boolean(allowCreate) && Boolean(free) && !exactMatch && !createBusy;
  const createText =
    typeof createLabel === 'function'
      ? createLabel(free)
      : createLabel
        ? String(createLabel).replace(/\{name\}/g, free)
        : `Create “${free}”`;

  function runCreate() {
    if (!showCreate || !free || createBusy) return;
    const name = free;
    if (typeof onCreate === 'function') {
      const result = onCreate(name);
      Promise.resolve(result)
        .then((created: any) => {
          const id =
            typeof created === 'string'
              ? created
              : created?.name || created?.id || name;
          if (multi) {
            toggleId(String(id || name));
            onQuery?.('');
          }
        })
        .catch(() => {
          /* parent surfaces error via action toast */
        });
      return;
    }
    if (multi) {
      toggleId(name);
      onQuery?.('');
      return;
    }
    onPick?.({ id: name, label: name, create: true, meta: { create: true } });
  }

  function toggleId(id: string) {
    const raw = String(id || '').trim();
    if (!raw) return;
    setSelected((prev) => {
      if (typeof resolveMultiToggle === 'function') {
        try {
          const next = resolveMultiToggle(prev, raw);
          return Array.isArray(next)
            ? next.map((x) => String(x || '').trim()).filter(Boolean)
            : prev;
        } catch {
          /* fall through to default toggle */
        }
      }
      const key = raw.toLowerCase();
      const has = prev.some((x) => x.toLowerCase() === key);
      if (has) return prev.filter((x) => x.toLowerCase() !== key);
      return [...prev, raw];
    });
  }

  function pickEnter() {
    if (multi) {
      if (filtered[0]) {
        toggleId(String(filtered[0].id || filtered[0].label || ''));
        onQuery?.('');
        return;
      }
      if (showCreate) {
        runCreate();
        return;
      }
      if (allowFreeText && free) {
        toggleId(free);
        onQuery?.('');
      }
      return;
    }
    if (filtered[0]) {
      onPick?.(filtered[0]);
      return;
    }
    if (showCreate) {
      runCreate();
      return;
    }
    if (allowFreeText && free) {
      onPick?.({ id: free, label: free });
    }
  }

  function confirmMulti() {
    const ids = selected.slice();
    if (typeof onConfirm === 'function') onConfirm(ids);
    else if (ids.length === 1) onPick?.({ id: ids[0], label: ids[0] });
  }

  // Portal layer above Conversation OptBtnHint (--prp-z-dialog 100100).
  const panelZ = 'var(--prp-z-portal, 120000)';
  const style: React.CSSProperties = pos
    ? {
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        minWidth: pos.width,
        maxWidth: pos.width,
        zIndex: panelZ,
      }
    : { zIndex: panelZ };

  const panel = (
    <div
      ref={panelRef}
      className={`prp-sselect-panel prp-sselect-panel--popover${pos ? '' : ' prp-sselect-panel--center'}${
        multi ? ' prp-sselect-panel--multi' : ''
      }`}
      role="dialog"
      aria-label={title || 'Select'}
      aria-multiselectable={multi || undefined}
      data-prp-nested-layer="1"
      data-prp-sselect="1"
      style={pos ? style : undefined}
    >
      {title ? <div className="prp-sselect-title">{title}</div> : null}
      {/* Search first so commit/file pickers open with filter ready */}
      <input
        className="prp-sselect-input"
        autoFocus
        placeholder={placeholder}
        value={query || ''}
        onChange={(e) => onQuery?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose?.();
            return;
          }
          if (multi && e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            confirmMulti();
            return;
          }
          if (!multi) {
            const idx = resolveOptDigitPickIndex(e.nativeEvent || e);
            if (idx != null) {
              const hit = pickFilteredOptionByIndex(filtered, idx);
              if (hit) {
                e.preventDefault();
                e.stopPropagation();
                onPick?.(hit);
                return;
              }
            }
          }
          if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            if (multi && !filtered[0] && !free && selected.length) {
              confirmMulti();
              return;
            }
            pickEnter();
          }
        }}
      />
      <ul className="prp-sselect-list">
        {filtered.length === 0 && !showCreate ? (
          <li className="prp-sselect-empty prp-muted">
            {allowFreeText && free
              ? multi
                ? `Press Enter to add “${free}”`
                : `Press Enter to use “${free}”`
              : emptyLabel}
          </li>
        ) : (
          filtered.map((o: any, rowIndex: number) => {
            const meta = o.meta || {};
            const kind = String(meta.kind || '');
            const id = String(o.id || o.label || '');
            const isOn = selectedSet.has(id.toLowerCase());
            const secondary = String(
              o.secondary || meta.secondary || ''
            ).trim();
            const colorCss =
              typeof labelColorCss === 'function'
                ? labelColorCss(meta.color, meta.name || id)
                : meta.color
                  ? `#${String(meta.color).replace(/^#/, '')}`
                  : '';
            const showLabelSwatch =
              kind === 'label' ||
              (kind !== 'user' &&
                kind !== 'milestone' &&
                Boolean(colorCss || meta.color));
            const showAvatar =
              kind === 'user' ||
              (!showLabelSwatch &&
                kind !== 'milestone' &&
                (Boolean(meta.login) || Boolean(meta.avatarUrl)));
            const showOptDigit = !multi && rowIndex < 3;
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`prp-sselect-item${isOn ? ' prp-sselect-item--selected' : ''}${
                    secondary ? ' prp-sselect-item--has-secondary' : ''
                  }${showOptDigit ? ' prp-opt-hint-host' : ''}`}
                  aria-selected={multi ? isOn : undefined}
                  data-prp-sselect-opt-index={
                    showOptDigit ? String(rowIndex + 1) : undefined
                  }
                  onClick={() => {
                    if (multi) toggleId(id);
                    else onPick?.(o);
                  }}
                >
                  {showOptDigit ? (
                    <OptBtnHint
                      label={`⌥${rowIndex + 1}`}
                      preferredPlacement="left"
                      className="prp-opt-btn-hint--sselect"
                    />
                  ) : null}
                  {multi ? (
                    <span
                      className={`prp-sselect-check${isOn ? ' prp-sselect-check--on' : ''}`}
                      aria-hidden="true"
                    >
                      {isOn ? <IconCheck size={12} /> : null}
                    </span>
                  ) : null}
                  {showLabelSwatch ? (
                    <span
                      className="prp-sselect-item__swatch"
                      style={{
                        backgroundColor: colorCss || 'var(--prp-bg-muted)',
                      }}
                      aria-hidden="true"
                      title={colorCss || 'label'}
                    />
                  ) : showAvatar ? (
                    <Avatar
                      login={meta.login || o.id || o.label}
                      avatarUrl={meta.avatarUrl || meta.avatar_url || ''}
                      size="sm"
                      className="prp-sselect-item__avatar"
                    />
                  ) : null}
                  <span className="prp-sselect-item__text">
                    <span className="prp-sselect-item__label">{o.label}</span>
                    {secondary ? (
                      <span className="prp-sselect-item__secondary">
                        {secondary}
                      </span>
                    ) : null}
                  </span>
                  {meta.status ? (
                    <span className="prp-sselect-item__meta">{String(meta.status)}</span>
                  ) : meta.state && kind === 'milestone' ? (
                    <span className="prp-sselect-item__meta">{String(meta.state)}</span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
        {showCreate ? (
          <li key="__create__">
            <button
              type="button"
              className="prp-sselect-item prp-sselect-item--create"
              disabled={createBusy}
              onClick={() => runCreate()}
            >
              <span className="prp-sselect-item__label">{createText}</span>
              <span className="prp-sselect-item__meta">new</span>
            </button>
          </li>
        ) : null}
      </ul>
      {/* Multi (labels) and single meta pickers (milestone / people): Cancel +
          confirm chords with OptBtnHint under Opt-hold. */}
      <div className="prp-sselect-footer" data-prp-sselect-footer="1">
        <span className="prp-opt-hint-host prp-sselect-footer__btn-host">
          <OptBtnHint
            label="Esc"
            preferredPlacement="top"
            className="prp-opt-btn-hint--sselect"
          />
          <button
            type="button"
            className="prp-btn prp-btn--size-sm"
            data-prp-sselect-cancel="1"
            onClick={onClose}
          >
            Cancel
          </button>
        </span>
        <span className="prp-opt-hint-host prp-sselect-footer__btn-host">
          <OptBtnHint
            label="⌘↵"
            preferredPlacement="top"
            className="prp-opt-btn-hint--sselect"
          />
          <button
            type="button"
            className="prp-btn prp-btn--primary prp-btn--size-sm"
            data-prp-sselect-confirm="1"
            onClick={() => {
              if (multi) confirmMulti();
              else pickEnter();
            }}
          >
            {confirmLabel}
            {multi && selected.length ? ` (${selected.length})` : ''}
          </button>
        </span>
      </div>
    </div>
  );

  if (!pos && !anchorRef) {
    return (
      <div className="prp-sselect-layer" role="presentation">
        <div className="prp-sselect-backdrop" onClick={onClose} />
        {panel}
      </div>
    );
  }

  return (
    <>
      <div className="prp-sselect-backdrop prp-sselect-backdrop--soft" onClick={onClose} />
      {panel}
    </>
  );
}

export default SearchableSelect;
