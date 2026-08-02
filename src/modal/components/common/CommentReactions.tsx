import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SmileyIcon } from '@primer/octicons-react';
import {
  REACTION_DEFS,
  activeReactionGroups,
  reactionDef,
  formatReactionUsersTooltip,
  type ReactionContent,
  type ReactionGroup,
} from '@lib/comment-reactions';
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
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const addBtnRef = useRef<HTMLButtonElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const reactorsRequested = useRef(false);
  const pickerId = useId();
  const active = activeReactionGroups(reactions);
  const byContent = new Map(active.map((g) => [g.content, g]));
  const locked = Boolean(disabled || busy || !onToggle);

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
    const btn = addBtnRef.current;
    if (!btn) return;
    const place = () => {
      const r = btn.getBoundingClientRect();
      // Prefer above the button; if near top of viewport, open below
      const preferAbove = r.top > 56;
      const top = preferAbove ? r.top - 8 : r.bottom + 8;
      setPickerPos({
        top,
        left: Math.max(8, Math.min(r.left, window.innerWidth - 280)),
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node | null;
      if (hostRef.current?.contains(t)) return;
      if (pickerRef.current?.contains(t)) return;
      setPickerOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  async function toggle(content: ReactionContent) {
    if (locked) return;
    const cur = byContent.get(content);
    const currently = Boolean(cur?.viewerHasReacted);
    setPickerOpen(false);
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

  const portalRoot =
    typeof document !== 'undefined'
      ? (document.querySelector('.prp-overlay') as HTMLElement | null) ||
        document.body
      : null;

  const pickerEl =
    pickerOpen && pickerPos && portalRoot
      ? createPortal(
          <div
            ref={pickerRef}
            id={pickerId}
            className="prp-reactions__picker prp-reactions__picker--portal"
            role="menu"
            aria-label="Pick a reaction"
            style={{
              top: pickerPos.top,
              left: pickerPos.left,
              transform:
                addBtnRef.current &&
                addBtnRef.current.getBoundingClientRect().top > 56
                  ? 'translateY(-100%)'
                  : undefined,
            }}
          >
            {REACTION_DEFS.map((d) => {
              const g = byContent.get(d.content);
              const reacted = Boolean(g?.viewerHasReacted);
              return (
                <button
                  key={d.content}
                  type="button"
                  role="menuitem"
                  className={`prp-reactions__picker-btn${
                    reacted ? ' is-reacted' : ''
                  }`}
                  disabled={locked}
                  title={
                    reacted
                      ? `Remove your ${d.label} reaction`
                      : `React with ${d.label}`
                  }
                  aria-label={d.label}
                  aria-pressed={reacted}
                  onClick={() => void toggle(d.content)}
                >
                  {d.emoji}
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
        <div className="prp-reactions__picker-host" ref={hostRef}>
          <button
            ref={addBtnRef}
            type="button"
            className="prp-reactions__add"
            disabled={locked}
            aria-label="Add reaction"
            title="Add reaction"
            aria-expanded={pickerOpen}
            aria-controls={pickerOpen ? pickerId : undefined}
            onClick={() => setPickerOpen((o) => !o)}
          >
            <SmileyIcon size={16} />
          </button>
          {pickerEl}
        </div>
      ) : null}
    </div>
  );
}
