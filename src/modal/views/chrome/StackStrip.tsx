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

export function StackStrip({ items, onOpenPr }: any) {
  if (!items?.length || items.length < 2) return null;
  return (
    <div className="prp-stack-strip" role="navigation" aria-label="Stacked pull requests">
      <span className="prp-stack-strip__label">Stack</span>
      {items.map((it, i) => (
        <React.Fragment key={it.number}>
          {i > 0 ? <span className="prp-stack-strip__sep">→</span> : null}
          {it.current ? (
            <span
              className="prp-stack-strip__item prp-stack-strip__item--current"
              title={it.title || `#${it.number}`}
            >
              <span className="prp-stack-strip__num">#{it.number}</span>
              <span className="prp-stack-strip__title">
                {it.title ? String(it.title).slice(0, 28) : it.headRef || 'current'}
              </span>
            </span>
          ) : (
            <a
              className="prp-stack-strip__item"
              href={it.htmlUrl || '#'}
              title={it.title || `#${it.number}`}
              onClick={(e) => {
                if (onOpenPr) {
                  e.preventDefault();
                  onOpenPr(it.number);
                }
              }}
            >
              <span className="prp-stack-strip__num">#{it.number}</span>
              <span className="prp-stack-strip__title">
                {it.title ? String(it.title).slice(0, 28) : it.headRef || `PR ${it.number}`}
              </span>
            </a>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
