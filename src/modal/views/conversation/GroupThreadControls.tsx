/**
 * Review-group path-row fold / jump controls.
 * Colocated conversation-specific chrome (⌥F fold · ⌥D jump tips).
 */
import React from 'react';
import { IconDisclosure, IconFileDiff } from '@common/icons';
import { OptBtnHint } from '@common/OptBtnHint';
import { useIsConversationKbFocused } from '@common/ConversationKbFocus';

/** Group path-row fold control — ⌥F tip only when this thread is context-focused. */
export function GroupThreadFoldBtn({
  anchor,
  open,
  onToggle,
  fileLoc,
  path,
  pendingBadge,
  outdatedBadge,
  resolvedBadge,
}: {
  anchor: string;
  open: boolean;
  onToggle: () => void;
  fileLoc: string;
  path?: string;
  pendingBadge?: React.ReactNode;
  outdatedBadge?: React.ReactNode;
  resolvedBadge?: React.ReactNode;
}) {
  const focused = useIsConversationKbFocused(anchor);
  return (
    <button
      type="button"
      className={`prp-review-group__row-btn inline-flex min-w-0 flex-1 items-center gap-1.5 text-left${
        focused ? ' prp-opt-hint-host' : ''
      }`}
      onClick={onToggle}
      aria-expanded={open}
      title={
        focused
          ? open
            ? 'Collapse thread (⌥F)'
            : 'Expand thread (⌥F)'
          : undefined
      }
    >
      {focused ? <OptBtnHint label="⌥F" preferredPlacement="top" /> : null}
      <span className="prp-review-group__chev shrink-0" aria-hidden="true">
        <IconDisclosure open={open} size={16} />
      </span>
      <span
        className="prp-mono prp-review-group__path min-w-0 truncate"
        title={fileLoc || ''}
      >
        {fileLoc || path || 'thread'}
      </span>
      {pendingBadge}
      {outdatedBadge}
      {resolvedBadge}
    </button>
  );
}

/** Group jump-to-diff control — ⌥D tip only when context-focused. */
export function GroupThreadJumpBtn({
  anchor,
  fileLoc,
  onJump,
}: {
  anchor: string;
  fileLoc: string;
  onJump: () => void;
}) {
  const focused = useIsConversationKbFocused(anchor);
  return (
    <button
      type="button"
      className={`prp-icon-btn prp-review-group__jump shrink-0${
        focused ? ' prp-opt-hint-host' : ''
      }`}
      title={
        focused
          ? `View in Diff · ${fileLoc} (⌥D)`
          : `View in Diff · ${fileLoc}`
      }
      aria-label={`View ${fileLoc} in Diff`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onJump();
      }}
    >
      {focused ? <OptBtnHint label="⌥D" preferredPlacement="top" /> : null}
      <IconFileDiff size={16} />
    </button>
  );
}
