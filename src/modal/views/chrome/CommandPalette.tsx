import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@common/Button';
import { Badge } from '@common/Badge';
import { Card } from '@common/Card';
import { WysiwygComposer } from '@common/WysiwygComposer';
import { MarkdownView } from '@common/MarkdownView';
import { UserLink } from '@common/UserLink';
import { LabelLink } from '@common/LabelLink';
import { SearchableSelect } from '@common/SearchableSelect';
import {
  ROW_HEIGHT, COMMENT_ROW_HEIGHT, escapeHtml, highlightCode, renderMdHtml,
  avatarInitials, formatWhen, reviewStatusTone, rowHeightFor, averageRowHeight,
} from '@common/utils';
import { filterSelectOptions, buildUnifiedReviewerRows } from '@lib/searchable-select';
import { parseSuggestionFences } from '@lib/pr-edit-api';
import { splitMarkdownSegments, filterMentions, filterSlashCommands, detectMentionTrigger, detectSlashTrigger, applyMentionInsertion, applySlashInsertion, SLASH_COMMANDS } from '@lib/markdown-composer';
import { filterPaletteCommands, formatShortcut } from '@lib/command-palette';
import { githubUserUrl, githubLabelUrl, uniqueLogins, uniqueReviewsByAuthor, buildStackStrip } from '@lib/ui-polish';
import { takeCommitsForTimeline, takeVisibleTreeNodes } from '@lib/aside-lists';
import { buildConversationTimeline, pageTimelineItems } from '@lib/conversation-timeline';
import { snippetForComment } from '@lib/diff-snippet';
import { buildNestedFileTree, flattenVisibleTree } from '@lib/file-tree';
import { isPathViewed, filterFilesByQuery, countReviewThreadsByPath, groupReviewThreads, toggleViewedPath } from '@lib/review-threads';
import {
  beginLineSelection, extendLineSelection, normalizeSelection, selectionToCommentPayload,
  finalizeSelection, selectionGestureMode, isRowInSelection, isSelectableDiffRow, selectionBlockRole,
} from '@lib/line-selection';
import { calculateVisibleRange } from '@lib/virtual-range';
import { languageFromPath } from '@lib/diff-rows';
import { pendingReviewCount } from '@lib/pending-review';
import { InlineThread } from '../diff/InlineThread';
import { MarkdownView as Md } from '@common/MarkdownView';

export function CommandPalette({ open, query, onQuery, commands, onRun, onClose }: any) {
  if (!open) return null;
  const filtered =
    typeof filterPaletteCommands === 'function'
      ? filterPaletteCommands(commands, query)
      : commands || [];
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
  return (
    <div className="prp-cmd-layer" role="presentation">
      <div className="prp-cmd-backdrop" onClick={onClose} />
      <div className="prp-cmd-panel" role="dialog" aria-label="Command palette">
        <input
          className="prp-cmd-input"
          autoFocus
          placeholder="Type a command…"
          value={query}
          onChange={(e) => onQuery?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onClose?.();
            } else if (e.key === 'Enter' && filtered[0]) {
              e.preventDefault();
              onRun?.(filtered[0]);
            }
          }}
        />
        <ul className="prp-cmd-list">
          {filtered.length === 0 ? (
            <li className="prp-cmd-empty prp-muted">No matching commands</li>
          ) : (
            filtered.map((c) => (
              <li key={c.id}>
                <button type="button" className="prp-cmd-item" onClick={() => onRun?.(c)}>
                  <span className="prp-cmd-item__section">{c.section}</span>
                  <span className="prp-cmd-item__title">{c.title}</span>
                  {c.shortcut ? (
                    <kbd className="prp-cmd-item__kbd">
                      {typeof formatShortcut === 'function'
                        ? formatShortcut(c.shortcut, isMac)
                        : c.shortcut}
                    </kbd>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="prp-cmd-foot prp-muted">⌘K open · ↑↓ / Enter run · Esc close</div>
      </div>
    </div>
  );
}

