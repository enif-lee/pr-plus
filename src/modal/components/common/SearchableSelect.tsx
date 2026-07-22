import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { filterSelectOptions, labelColorCss } from '@lib/searchable-select';
import { Avatar } from './Avatar';

/**
 * Anchored popover searchable select (opens above trigger by default).
 * Pass `anchorRef` for positioning; falls back to centered layer when missing.
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
  anchorRef,
  placement = 'top',
}: any) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const el = anchorRef?.current as HTMLElement | null;
    if (!el) {
      setPos(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const width = Math.max(220, Math.min(320, r.width + 40));
    let top = placement === 'bottom' ? r.bottom + 6 : r.top - 8;
    let left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    // After paint, flip if off-screen
    requestAnimationFrame(() => {
      const h = panelRef.current?.offsetHeight || 200;
      if (placement !== 'bottom' && r.top - h < 8) {
        top = r.bottom + 6;
      } else if (placement === 'top') {
        top = r.top - h - 6;
      }
      setPos({ top: Math.max(8, top), left, width });
    });
  }, [open, anchorRef, placement, query, options?.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
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

  if (!open) return null;

  const filtered =
    typeof filterSelectOptions === 'function'
      ? filterSelectOptions(options, query)
      : (options || []).slice(0, 50);
  const free = String(query || '').trim();

  function pickEnter() {
    if (filtered[0]) {
      onPick?.(filtered[0]);
      return;
    }
    if (allowFreeText && free) {
      onPick?.({ id: free, label: free });
    }
  }

  const style: React.CSSProperties = pos
    ? {
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 80,
      }
    : {};

  const panel = (
    <div
      ref={panelRef}
      className={`prp-sselect-panel prp-sselect-panel--popover${pos ? '' : ' prp-sselect-panel--center'}`}
      role="dialog"
      aria-label={title || 'Select'}
      style={pos ? style : undefined}
    >
      {title ? <div className="prp-sselect-title">{title}</div> : null}
      <input
        className="prp-sselect-input"
        autoFocus
        placeholder={placeholder}
        value={query || ''}
        onChange={(e) => onQuery?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose?.();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pickEnter();
          }
        }}
      />
      <ul className="prp-sselect-list">
        {filtered.length === 0 ? (
          <li className="prp-sselect-empty prp-muted">
            {allowFreeText && free ? `Press Enter to use “${free}”` : emptyLabel}
          </li>
        ) : (
          filtered.map((o: any) => {
            const meta = o.meta || {};
            const kind = String(meta.kind || '');
            const colorCss =
              typeof labelColorCss === 'function'
                ? labelColorCss(meta.color)
                : meta.color
                  ? `#${String(meta.color).replace(/^#/, '')}`
                  : '';
            const showLabelSwatch = kind === 'label' || (kind !== 'user' && Boolean(meta.color));
            const showAvatar =
              kind === 'user' ||
              (!showLabelSwatch && (Boolean(meta.login) || Boolean(meta.avatarUrl)));
            return (
              <li key={String(o.id)}>
                <button type="button" className="prp-sselect-item" onClick={() => onPick?.(o)}>
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
                  <span className="prp-sselect-item__label">{o.label}</span>
                  {meta.status ? (
                    <span className="prp-sselect-item__meta">{String(meta.status)}</span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
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
