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

export function AsideCommitsTimeline({ commits }: any) {
  const { items, truncated, total } = useMemo(
    () => takeCommitsForTimeline(commits, 12),
    [commits]
  );
  if (!items.length) {
    return <div className="prp-muted">No commits</div>;
  }
  return (
    <>
      {/* Scroll on outer wrapper so the rail (::before) spans full content height */}
      <div className="prp-commit-timeline-scroll">
        <ol className="prp-commit-timeline">
          {items.map((c, idx) => (
            <li
              key={c.key}
              className={`prp-commit-timeline__item${
                idx === items.length - 1 ? ' prp-commit-timeline__item--last' : ''
              }`}
            >
              <span className="prp-commit-timeline__dot" aria-hidden="true" />
              <div className="prp-commit-timeline__body">
                <div className="prp-commit-timeline__msg" title={c.fullMessage || c.message}>
                  {c.message}
                </div>
                <div className="prp-commit-timeline__meta">
                  <code className="prp-commit-timeline__sha">{c.shortSha}</code>
                  {c.author ? <span>{c.author}</span> : null}
                  {c.at ? <span>{formatWhen(c.at)}</span> : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
      {truncated > 0 ? (
        <div className="prp-aside-overflow">
          +{truncated} more · {total} commits total
        </div>
      ) : null}
    </>
  );
}
