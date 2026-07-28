import React, { useEffect } from 'react';
import { useModalStore } from '../../store/modal-store';

/**
 * True when `anchor` is the active conversation keyboard-focus target.
 * Only this subscriber re-renders when focus moves (not the parent tree).
 */
export function useIsConversationKbFocused(anchor: string | null | undefined): boolean {
  const key = anchor == null || anchor === '' ? '' : String(anchor);
  return useModalStore((s) =>
    key ? s.focusedConversationAnchor === key : false
  );
}

/**
 * Append focus class when this anchor is focused (leaf re-render only).
 */
export function useConversationKbFocusClass(
  anchor: string | null | undefined,
  baseClass = '',
  focusClass = 'prp-card--kb-focus'
): string {
  const focused = useIsConversationKbFocused(anchor);
  const base = String(baseClass || '').trim();
  if (!focused) return base;
  return base ? `${base} ${focusClass}` : focusClass;
}

/**
 * Merges kb-focus class onto a single host element. Parent trees that do not
 * subscribe to focus stay memoized; only this leaf updates on ⌥J/K.
 */
export function ConversationKbFocusHost({
  anchor,
  as = 'div',
  className = '',
  focusClassName = 'prp-card--kb-focus',
  children,
  ...rest
}: {
  anchor: string | null | undefined;
  as?: keyof React.JSX.IntrinsicElements | React.ElementType;
  className?: string;
  focusClassName?: string;
  children?: React.ReactNode;
  [k: string]: any;
}) {
  const cls = useConversationKbFocusClass(anchor, className, focusClassName);
  return React.createElement(
    as as React.ElementType,
    { ...rest, className: cls || undefined },
    children
  );
}

/**
 * Class string helper for leaves that already have a host component
 * (e.g. Card): merge base + optional kb-focus when this anchor is active.
 */
export function ConversationKbFocusClassName({
  anchor,
  baseClass,
  focusClassName = 'prp-card--kb-focus',
  children,
}: {
  anchor: string | null | undefined;
  baseClass: string;
  focusClassName?: string;
  children: (className: string, focused: boolean) => React.ReactNode;
}) {
  const focused = useIsConversationKbFocused(anchor);
  const base = String(baseClass || '').trim();
  const className =
    focused && focusClassName
      ? base
        ? `${base} ${focusClassName}`
        : focusClassName
      : base;
  return <>{children(className, focused)}</>;
}

/**
 * Expand unresolved group path when keyboard-nav targets a review thread.
 * Scroll + focus promotion live in VirtualConversationList (needs row offsets
 * so off-window virtual rows actually mount).
 */
export function ConversationKbFocusScroller(props: {
  /** Expand unresolved group path / collapsed threads when needed */
  onFocusThread?: (commentId: string) => void;
}) {
  const pending = useModalStore((s) => s.pendingConversationNavAnchor);
  const onFocusThread = props.onFocusThread;

  useEffect(() => {
    const a = String(pending || '').trim();
    if (!a.startsWith('review-comment:') || typeof onFocusThread !== 'function') {
      return;
    }
    const id = a.slice('review-comment:'.length);
    if (id) onFocusThread(id);
  }, [pending, onFocusThread]);

  return null;
}

/**
 * Overlay class bridge: toggles `.prp-opt-hints-on` without re-rendering App.
 */
export function OptHintsOverlayClass({
  targetRef,
}: {
  targetRef: React.RefObject<HTMLElement | null>;
}) {
  const active = useModalStore((s) => s.optHintsActive);
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    el.classList.toggle('prp-opt-hints-on', Boolean(active));
  }, [active, targetRef]);
  return null;
}

/**
 * Enter expands the currently focused collapsed thread (resolved header-only).
 * Subscribes to focus anchor only — not the conversation tree.
 */
export function ConversationKbEnterExpand({
  onExpand,
  isCollapsed,
}: {
  onExpand: (commentId: string) => void;
  isCollapsed: (commentId: string) => boolean;
}) {
  const anchor = useModalStore((s) => s.focusedConversationAnchor);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) {
        return;
      }
      const ae = document.activeElement as HTMLElement | null;
      if (
        ae &&
        (ae.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/i.test(ae.tagName || ''))
      ) {
        return;
      }
      const a = String(anchor || '').trim();
      if (!a.startsWith('review-comment:')) return;
      const id = a.slice('review-comment:'.length);
      if (!id || !isCollapsed(id)) return;
      e.preventDefault();
      e.stopPropagation();
      onExpand(id);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [anchor, onExpand, isCollapsed]);
  return null;
}
