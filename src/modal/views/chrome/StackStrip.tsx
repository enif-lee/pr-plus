import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SearchableSelect } from '@common/SearchableSelect';
import {
  STACK_PATH_HOVER_MS,
  stackBranchHasPathPicker,
  buildStackBranchSelectOptions,
  reduceStackPathHover,
} from '@lib/ui-polish';
import { FloatingScrollbar } from '../../components/common/FloatingScrollbar';
import { useModalStore } from '../../store/modal-store';

/**
 * Stack path strip.
 * - Click any PR chip → open that PR.
 * - Hover a level that has sibling branches → SearchableSelect anchored on that
 *   chip, listing other paths at the same degree.
 */
export function StackStrip({
  items,
  branches = [],
  onOpenPr,
  onPathChange,
  hoverDelayMs = STACK_PATH_HOVER_MS,
  /** Changes when the open PR changes — resets picker state. */
  resetKey = null,
  /** Option held: show ⌥1–9 badges on stack chips */
  showOptHotkeys = false,
  /** Open PR number — authoritative for current chip focus */
  currentNumber = null,
}: any) {
  const storeOptHints = useModalStore((s) => s.optHintsActive);
  const showHotkeys = showOptHotkeys || storeOptHints;
  const branchByLevel = useMemo(() => {
    const m = new Map<number, any>();
    for (const b of Array.isArray(branches) ? branches : []) {
      const level = Number(b?.levelNumber ?? b?.selectedNumber);
      if (Number.isFinite(level)) m.set(level, b);
    }
    return m;
  }, [branches]);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  /** Live anchor element in state so SearchableSelect remeasures reliably. */
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRefs = useRef(new Map<string, HTMLElement | null>());
  /** Stable ref object whose .current tracks anchorEl for SearchableSelect API. */
  const openAnchorRef = useRef<HTMLElement | null>(null);
  openAnchorRef.current = anchorEl;

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const closePicker = useCallback(() => {
    clearTimer();
    setOpenKey(null);
    setArmedKey(null);
    setAnchorEl(null);
    setQuery('');
  }, [clearTimer]);

  // Full reset when switching PRs / strip identity changes
  useEffect(() => {
    closePicker();
  }, [resetKey, closePicker]);

  // Drop stale openKey if that level no longer has a branch control
  useEffect(() => {
    if (!openKey) return;
    const n = Number(String(openKey).replace(/^level-/, ''));
    if (!branchByLevel.has(n)) {
      closePicker();
      return;
    }
    // Re-bind anchor after strip re-render (DOM nodes remount)
    const el = anchorRefs.current.get(openKey) || null;
    setAnchorEl(el);
  }, [openKey, branchByLevel, items, closePicker]);

  const openPickerAt = useCallback(
    (chipKey: string) => {
      clearTimer();
      const el = anchorRefs.current.get(chipKey) || null;
      setAnchorEl(el);
      setOpenKey(chipKey);
      setArmedKey(null);
      setQuery('');
    },
    [clearTimer]
  );

  const onChipEnter = useCallback(
    (chipKey: string, hasPicker: boolean) => {
      if (!hasPicker) return;
      const next = reduceStackPathHover(
        { openKey, armedKey },
        { type: 'enter', key: chipKey }
      );
      setArmedKey(next.armedKey);
      if (next.openKey === chipKey && openKey === chipKey) {
        // Already open on this chip — refresh anchor
        const el = anchorRefs.current.get(chipKey) || null;
        setAnchorEl(el);
        return;
      }
      if (!next.scheduleOpen) return;
      clearTimer();
      const delay = Number.isFinite(hoverDelayMs)
        ? Math.max(0, Number(hoverDelayMs))
        : STACK_PATH_HOVER_MS;
      timerRef.current = setTimeout(() => {
        openPickerAt(chipKey);
      }, delay);
    },
    [armedKey, clearTimer, hoverDelayMs, openKey, openPickerAt]
  );

  const onChipLeave = useCallback(
    (e: React.MouseEvent, chipKey: string) => {
      clearTimer();
      setArmedKey(null);
      // If pointer moves into the open panel, keep it open
      const related = e.relatedTarget as Node | null;
      if (related && openAnchorRef.current?.contains(related)) return;
      // Keep open panel until outside mousedown (SearchableSelect) — only cancel arm
      void chipKey;
    },
    [clearTimer]
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  const openLevelNum = openKey
    ? Number(String(openKey).replace(/^level-/, ''))
    : NaN;
  const openBranch = Number.isFinite(openLevelNum)
    ? branchByLevel.get(openLevelNum) || null
    : null;
  const selectOptions = useMemo(
    () => (openBranch ? buildStackBranchSelectOptions(openBranch) : []),
    [openBranch]
  );

  const list = Array.isArray(items) ? items : [];
  const curNum = Number(currentNumber);
  const show = list.length >= 2;
  const pickerOpen = Boolean(openKey && openBranch && anchorEl);
  const stripScrollRef = useRef<HTMLDivElement | null>(null);

  // Ensure the current stack chip is scrolled into view after adjacent nav
  useEffect(() => {
    if (!show || !Number.isFinite(curNum) || curNum <= 0) return;
    const host = stripScrollRef.current;
    if (!host) return;
    const chip = host.querySelector(
      `[data-pr-number="${curNum}"]`
    ) as HTMLElement | null;
    try {
      chip?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    } catch {
      /* ignore */
    }
  }, [show, curNum, list.length, resetKey]);

  // Non-passive wheel: vertical wheel → horizontal scroll (must stay before early return)
  useEffect(() => {
    if (!show) return undefined;
    const el = stripScrollRef.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 1) return;
      const dx =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!dx) return;
      const prev = el.scrollLeft;
      const next = Math.max(0, Math.min(max, prev + dx));
      if (next !== prev) {
        e.preventDefault();
        el.scrollLeft = next;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [list.length, show]);

  function navigateTo(num: number, e?: React.SyntheticEvent) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!Number.isFinite(num)) return;
    closePicker();
    if (typeof onOpenPr === 'function') onOpenPr(num);
  }

  function onPickPath(opt: any) {
    const num = Number(opt?.meta?.number ?? opt?.id);
    if (!Number.isFinite(num) || !openBranch) return;
    onPathChange?.(openBranch.parentHeadRef, num, openBranch);
    closePicker();
    if (typeof onOpenPr === 'function') onOpenPr(num);
  }

  if (!show) return null;

  return (
    <div className="prp-scroll-float-host prp-stack-strip-host">
      <div
        ref={stripScrollRef}
        className="prp-stack-strip prp-scroll-float"
        role="navigation"
        aria-label="Stacked pull requests"
      >
        <span className="prp-stack-strip__label">Stack</span>
        {list.map((it: any, i: number) => {
          const levelNum = Number(it.number);
          const branch = branchByLevel.get(levelNum) || null;
          const hasPicker = stackBranchHasPathPicker(branch);
          const chipKey = `level-${levelNum}`;
          const title = it.title || `#${it.number}`;
          const isOpenLevel = openKey === chipKey;
          const digit = i < 9 ? i + 1 : null;
          const isCurrent =
            (Number.isFinite(curNum) && curNum > 0
              ? levelNum === curNum
              : Boolean(it.current));
          const className = `prp-stack-strip__item${
            isCurrent ? ' prp-stack-strip__item--current' : ''
          }${hasPicker ? ' prp-stack-strip__item--fork' : ''}${
            isOpenLevel ? ' prp-stack-strip__item--picker-open' : ''
          }`;

          return (
            <React.Fragment key={it.number}>
              {i > 0 ? (
                <span className="prp-stack-strip__sep" aria-hidden="true">
                  →
                </span>
              ) : null}
              <button
                type="button"
                ref={(el) => {
                  if (el) anchorRefs.current.set(chipKey, el);
                  else anchorRefs.current.delete(chipKey);
                  if (openKey === chipKey && el && openAnchorRef.current !== el) {
                    setAnchorEl(el);
                  }
                }}
                className={className}
                title={
                  hasPicker
                    ? `${title} · click to open · hover for other paths at this level${
                        digit != null ? ` · ⌥${digit}` : ''
                      }`
                    : `${title} · click to open${digit != null ? ` · ⌥${digit}` : ''}`
                }
                aria-current={isCurrent ? 'page' : undefined}
                aria-expanded={isOpenLevel || undefined}
                aria-haspopup={hasPicker ? 'listbox' : undefined}
                data-stack-level={levelNum}
                data-stack-fork={hasPicker ? '1' : '0'}
                data-pr-number={levelNum}
                data-prp-opt-digit={digit != null ? String(digit) : undefined}
                onClick={(e) => navigateTo(levelNum, e)}
                onMouseEnter={() => onChipEnter(chipKey, hasPicker)}
                onMouseLeave={(e) => onChipLeave(e, chipKey)}
                onContextMenu={(e) => {
                  if (!hasPicker) return;
                  e.preventDefault();
                  openPickerAt(chipKey);
                }}
              >
                <span className="prp-stack-strip__num">#{it.number}</span>
                <span className="prp-stack-strip__title">
                  {it.title
                    ? String(it.title)
                    : it.headRef || (it.current ? 'current' : `PR ${it.number}`)}
                </span>
                {hasPicker ? (
                  <span
                    className="prp-stack-strip__fork"
                    title="Other paths at this level"
                    aria-hidden="true"
                  >
                    ▾
                  </span>
                ) : null}
                {showHotkeys && digit != null ? (
                  <kbd className="prp-modal-hotkey" aria-hidden="true">
                    ⌥{digit}
                  </kbd>
                ) : null}
              </button>
            </React.Fragment>
          );
        })}
      </div>
      <FloatingScrollbar
        scrollerRef={stripScrollRef}
        orientation="horizontal"
        contentKey={`${list.length}:${list.map((x: any) => x.number).join(',')}`}
      />
      {/* Outside scroller so it never affects min-content width / overflow */}
      <SearchableSelect
        open={pickerOpen}
        title="Paths at this level"
        options={selectOptions}
        query={query}
        onQuery={setQuery}
        onPick={onPickPath}
        onClose={closePicker}
        placeholder="Filter paths…"
        emptyLabel="No alternate path"
        allowFreeText={false}
        anchorRef={openAnchorRef}
        anchorKey={`${openKey || ''}:${anchorEl ? '1' : '0'}:${selectOptions.length}`}
        placement="bottom"
      />
    </div>
  );
}

export default StackStrip;
