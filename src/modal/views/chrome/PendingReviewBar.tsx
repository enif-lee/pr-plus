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
import { useDomainDetail } from '../../app/domain-detail-context';
import { InlineThread } from '../diff/InlineThread';
import { MarkdownView as Md } from '@common/MarkdownView';

export function PendingReviewBar({
  batch,
  onDiscard,
  onLeaveReviewAction,
  actionBusy,
  /** When false, hide Approve / Request changes (own PR). Default true. */
  canSubmitReviewVerdict = true,
}: any) {
  const domain = useDomainDetail();
  const countFromBatch =
    typeof pendingReviewCount === 'function' ? pendingReviewCount(batch) : 0;
  const countFromDomain = Array.isArray(domain?.reviewComments)
    ? domain.reviewComments.filter((c: any) => c && c.pending).length
    : 0;
  const count = Math.max(Number(countFromBatch) || 0, Number(countFromDomain) || 0);
  if (!count) return null;
  const showVerdict = canSubmitReviewVerdict !== false;
  return (
    <div className="prp-pending-bar">
      <span>
        <strong>{count}</strong> pending review comment{count === 1 ? '' : 's'} — submit with the
        conversation form actions
      </span>
      <div className="prp-composer__row">
        <Button
          size="sm"
          variant="primary"
          disabled={actionBusy}
          onClick={() => onLeaveReviewAction?.('comment')}
        >
          Submit as comment
        </Button>
        {showVerdict ? (
          <Button
            size="sm"
            variant="ok"
            disabled={actionBusy}
            onClick={() => onLeaveReviewAction?.('approve')}
          >
            Approve
          </Button>
        ) : null}
        {showVerdict ? (
          <Button
            size="sm"
            variant="warn"
            disabled={actionBusy}
            onClick={() => onLeaveReviewAction?.('request_changes')}
          >
            Request changes
          </Button>
        ) : null}
        <Button size="sm" variant="danger" disabled={actionBusy} onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}
