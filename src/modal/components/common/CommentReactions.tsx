import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SmileyIcon } from '@primer/octicons-react';
import {
  REACTION_DEFS,
  activeReactionGroups,
  reactionDef,
  formatReactionUsersTooltip,
  placeReactionPicker,
  isReactionPickerAnchorLive,
  type ReactionContent,
  type ReactionGroup,
} from '@lib/comment-reactions';
import { TipPopover } from './TipPopover';
import { OptBtnHint } from './OptBtnHint';
import './CommentReactions.css';

export type CommentReactionTarget = {
  /** 'issue' | 'review' | 'pr' (PR description body) */
  kind: 'issue' | 'review' | 'pr';
  commentId: string | number;
  nodeId?: string | null;
  /** PR number when kind === 'pr' */
  number?: number | null;
};

type Props = {
  reactions?: ReactionGroup[] | null;
  target: CommentReactionTarget;
  /** Viewer login for "you" vs others distinction + tooltips */
  viewerLogin?: string | null;
  /** Pending / unsubmitted comments cannot react on GitHub */
  disabled?: boolean;
  busy?: boolean;
  /**
   * Toggle one reaction. Parent applies optimistic update + API.
   */
  onToggle?: (
    target: CommentReactionTarget,
    content: ReactionContent,
    currentlyReacted: boolean
  ) => void | Promise<void>;
  /**
   * Hover: load reactor logins (query-level first-N). Parent merges into comment.
   */
  onLoadReactors?: (
    target: CommentReactionTarget
  ) => void | Promise<void>;
  /**
   * When true (parent comment/thread kb-focused), show OptBtnHint for ⌥.
   * TipPopover with shortcut always when a shortcut label is provided.
   */
  showShortcutHint?: boolean;
  /** e.g. ⌥. */
  reactionShortcut?: string | null;
};

/**
 * GitHub-style reaction pills + smiley picker under a comment / PR body.
 * Own reactions use `.is-reacted` (accent); others stay neutral.
 * Click own reaction again → toggle off. Hover shows who reacted.
 */
export function CommentReactions({
  reactions,
  target,
  viewerLogin = null,
  disabled = false,
  busy = false,
  onToggle,
  onLoadReactors = null,
  showShortcutHint = false,
  reactionShortcut = '⌥E',
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState<{
    top: number;
    left: number;
    /** Anchor edge of the ☺ button; transform flips above when 'above' */
    placement: 'above' | 'below';
  } | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const addBtnRef = useRef<HTMLButtonElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const reactorsRequested = useRef(false);
  /** Prefer focusing emoji list after open (⌥E / keyboard). */
  const focusPickerOnOpenRef = useRef(false);
  const pickerId = useId();
  const active = activeReactionGroups(reactions);
  const byContent = new Map(active.map((g) => [g.content, g]));
  const locked = Boolean(disabled || busy || !onToggle);

  function listPickerButtons(): HTMLButtonElement[] {
    const root = pickerRef.current;
    if (!root) return [];
    return [
      ...root.querySelectorAll<HTMLButtonElement>(
        'button.prp-reactions__picker-btn:not([disabled])'
      ),
    ];
  }

  function focusPickerItem(index: number) {
    const btns = listPickerButtons();
    if (!btns.length) return;
    const i = ((index % btns.length) + btns.length) % btns.length;
    try {
      btns[i].focus({ preventScroll: true });
    } catch {
      btns[i].focus?.();
    }
  }

  function measurePickerPos(): {
    top: number;
    left: number;
    placement: 'above' | 'below';
  } | null {
    const btn = addBtnRef.current;
    if (!btn || !isReactionPickerAnchorLive(btn)) return null;
    const r = btn.getBoundingClientRect();
    const pick = pickerRef.current;
    return placeReactionPicker({
      button: {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
      },
      picker: {
        width: Math.max(200, pick?.offsetWidth || 280),
        height: Math.max(36, pick?.offsetHeight || 44),
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    });
  }

  function openPicker(opts: { focusList?: boolean } = {}) {
    if (locked) return;
    focusPickerOnOpenRef.current = opts.focusList !== false;
    // Seed coords before paint so the portal does not flash at (0,0) / wrong edge
    const seeded = measurePickerPos();
    if (seeded) setPickerPos(seeded);
    setPickerOpen(true);
  }

  function closePicker(opts: { restoreAddFocus?: boolean } = {}) {
    setPickerOpen(false);
    setPickerPos(null);
    focusPickerOnOpenRef.current = false;
    if (opts.restoreAddFocus) {
      queueMicrotask(() => {
        try {
          addBtnRef.current?.focus?.({ preventScroll: true });
        } catch {
          addBtnRef.current?.focus?.();
        }
      });
    }
  }

  function maybeLoadReactors() {
    if (!onLoadReactors || reactorsRequested.current) return;
    // Skip if any group already has users (cached)
    const hasUsers = active.some(
      (g) => Array.isArray(g.users) && g.users.length > 0
    );
    if (hasUsers) {
      reactorsRequested.current = true;
      return;
    }
    if (!target?.nodeId && target?.kind !== 'pr') return;
    reactorsRequested.current = true;
    void Promise.resolve(onLoadReactors(target)).catch(() => {
      reactorsRequested.current = false;
    });
  }

  useLayoutEffect(() => {
    if (!pickerOpen) {
      setPickerPos(null);
      return;
    }
    const place = () => {
      const next = measurePickerPos();
      if (!next) return;
      setPickerPos((prev) => {
        if (
          prev &&
          Math.abs(prev.top - next.top) < 0.5 &&
          Math.abs(prev.left - next.left) < 0.5 &&
          prev.placement === next.placement
        ) {
          return prev;
        }
        return next;
      });
    };
    place();
    // Second pass after portal paints real picker size
    const raf = requestAnimationFrame(() => place());
    const t = window.setTimeout(place, 0);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && pickerRef.current) {
      ro = new ResizeObserver(() => place());
      ro.observe(pickerRef.current);
    }
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      ro?.disconnect();
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [pickerOpen]);

  // After open + portal paint: focus first emoji so Tab/arrows start in the list
  useLayoutEffect(() => {
    if (!pickerOpen || !pickerPos) return;
    if (!focusPickerOnOpenRef.current) return;
    focusPickerOnOpenRef.current = false;
    // Double rAF: portal + layout must settle before focus sticks
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => focusPickerItem(0));
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [pickerOpen, pickerPos]);

  useEffect(() => {
    if (!pickerOpen) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node | null;
      if (hostRef.current?.contains(t)) return;
      if (pickerRef.current?.contains(t)) return;
      closePicker();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closePicker({ restoreAddFocus: true });
        return;
      }
      // Ignore when chords are held (stack digits / product shortcuts)
      if (e.altKey || e.metaKey || e.ctrlKey) return;

      const picker = pickerRef.current;
      if (!picker) return;
      const ae = document.activeElement as HTMLElement | null;
      const inPicker = Boolean(ae && picker.contains(ae));
      const onAdd = ae === addBtnRef.current;
      // Digits work anytime the menu is open; arrows/Tab only when focus is in menu
      const digitRaw = e.key;
      const digitFromCode = /^Digit([1-9])$/.exec(String(e.code || ''));
      const digitFromKey = /^[1-9]$/.test(digitRaw) ? digitRaw : null;
      const digitChar = digitFromKey || (digitFromCode ? digitFromCode[1] : null);
      if (digitChar) {
        const n = Number(digitChar);
        // 1…N maps to REACTION_DEFS order (GitHub picker order)
        if (n >= 1 && n <= REACTION_DEFS.length) {
          e.preventDefault();
          e.stopPropagation();
          const def = REACTION_DEFS[n - 1];
          if (def && !locked) void toggle(def.content);
        }
        return;
      }

      if (!inPicker && !onAdd) return;

      const btns = listPickerButtons();
      if (!btns.length) return;
      const idx = ae ? btns.indexOf(ae as HTMLButtonElement) : -1;

      // Arrow / Tab navigation stays inside the emoji list first
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        focusPickerItem(idx < 0 ? 0 : idx + 1);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        focusPickerItem(idx < 0 ? btns.length - 1 : idx - 1);
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        e.stopPropagation();
        focusPickerItem(0);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        e.stopPropagation();
        focusPickerItem(btns.length - 1);
        return;
      }
      if (e.key === 'Tab') {
        // Cycle within emoji list before leaving the menu
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          focusPickerItem(idx < 0 ? btns.length - 1 : idx - 1);
        } else {
          focusPickerItem(idx < 0 ? 0 : idx + 1);
        }
      }
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [pickerOpen]);

  async function toggle(content: ReactionContent) {
    if (locked) return;
    const cur = byContent.get(content);
    const currently = Boolean(cur?.viewerHasReacted);
    closePicker();
    try {
      // Fire-and-forget paint path: parent applies optimistic groups synchronously
      // (flushSync). Awaiting a slow REST call here left the picker closing without
      // a visible pill when the host re-render raced the unawaited setState.
      const p = onToggle?.(target, content, currently);
      if (p && typeof (p as Promise<unknown>).then === 'function') {
        void Promise.resolve(p).catch(() => {
          /* parent surfaces */
        });
      }
    } catch {
      /* parent surfaces */
    }
  }

  // Hide entirely when disabled and nothing to show (e.g. pending)
  if (disabled && active.length === 0) return null;

  // body portal: viewport-fixed coords (same as OptBtnHint) — avoid overlay
  // stacking/transform contexts shifting the menu away from the ☺ button.
  const portalRoot =
    typeof document !== 'undefined' ? document.body : null;

  const pickerEl =
    pickerOpen && pickerPos && portalRoot
      ? createPortal(
          <div
            ref={pickerRef}
            id={pickerId}
            className="prp-reactions__picker prp-reactions__picker--portal"
            data-prp-reaction-picker="1"
            data-placement={pickerPos.placement}
            data-prp-picker-place="explicit"
            role="menu"
            aria-label="Pick a reaction"
            style={{
              top: pickerPos.top,
              left: pickerPos.left,
            }}
          >
            {REACTION_DEFS.map((d, i) => {
              const g = byContent.get(d.content);
              const reacted = Boolean(g?.viewerHasReacted);
              const hotkey = i < 9 ? String(i + 1) : null;
              return (
                <button
                  key={d.content}
                  type="button"
                  role="menuitem"
                  tabIndex={i === 0 ? 0 : -1}
                  data-prp-reaction-emoji="1"
                  data-prp-reaction-index={String(i)}
                  data-prp-reaction-key={hotkey || undefined}
                  className={`prp-reactions__picker-btn${
                    reacted ? ' is-reacted' : ''
                  }`}
                  disabled={locked}
                  title={
                    reacted
                      ? `Remove your ${d.label} reaction${
                          hotkey ? ` (${hotkey})` : ''
                        }`
                      : `React with ${d.label}${hotkey ? ` (${hotkey})` : ''}`
                  }
                  aria-label={
                    hotkey ? `${d.label} (${hotkey})` : d.label
                  }
                  aria-keyshortcuts={hotkey || undefined}
                  aria-pressed={reacted}
                  onClick={() => void toggle(d.content)}
                >
                  <span className="prp-reactions__picker-emoji" aria-hidden="true">
                    {d.emoji}
                  </span>
                  {hotkey ? (
                    <span className="prp-reactions__picker-key" aria-hidden="true">
                      {hotkey}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>,
          portalRoot
        )
      : null;

  return (
    <div className="prp-reactions" data-prp-reactions="1">
      {active.map((g) => {
        const def = reactionDef(g.content);
        if (!def) return null;
        const reacted = Boolean(g.viewerHasReacted);
        const tip = formatReactionUsersTooltip(g, {
          viewerLogin,
          emoji: def.emoji,
          label: def.label,
        });
        return (
          <button
            key={g.content}
            type="button"
            className={`prp-reactions__pill${reacted ? ' is-reacted' : ' is-others'}`}
            disabled={locked}
            aria-pressed={reacted}
            title={tip || (reacted ? `Remove ${def.label}` : def.label)}
            onMouseEnter={maybeLoadReactors}
            onFocus={maybeLoadReactors}
            onClick={() => void toggle(g.content)}
          >
            <span className="prp-reactions__emoji" aria-hidden="true">
              {def.emoji}
            </span>
            <span className="prp-reactions__count">{g.count}</span>
          </button>
        );
      })}
      {!disabled ? (
        <div
          className={`prp-reactions__picker-host prp-has-tip${
            showShortcutHint && reactionShortcut ? ' prp-opt-hint-host' : ''
          }`}
          ref={hostRef}
        >
          {showShortcutHint && reactionShortcut ? (
            <OptBtnHint label={reactionShortcut} preferredPlacement="top" />
          ) : null}
          <TipPopover
            title="Add reaction"
            shortcut={
              showShortcutHint && reactionShortcut ? reactionShortcut : null
            }
            preferredPlacement="top"
          />
          <button
            ref={addBtnRef}
            type="button"
            className="prp-reactions__add"
            disabled={locked}
            aria-label="Add reaction"
            title={undefined}
            data-prp-reaction-add="1"
            aria-expanded={pickerOpen}
            aria-controls={pickerOpen ? pickerId : undefined}
            aria-haspopup="menu"
            onClick={() => {
              if (pickerOpen) {
                closePicker();
              } else {
                // Keyboard (⌥E click()) and pointer: land focus in emoji list
                openPicker({ focusList: true });
              }
            }}
          >
            <SmileyIcon size={16} />
          </button>
          {pickerEl}
        </div>
      ) : null}
    </div>
  );
}
