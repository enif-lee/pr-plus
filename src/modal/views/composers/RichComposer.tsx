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

export function RichComposer({
  value,
  onChange,
  placeholder,
  rows = 3,
  mentionCandidates = [],
  disabled,
  className = '',
}: any) {
  const taRef = useRef(null);
  const [menu, setMenu] = useState(null); // { kind:'mention'|'slash', items, trigger }

  function syncMenus(text, cursor) {
    if (typeof detectMentionTrigger !== 'function') {
      setMenu(null);
      return;
    }
    const mTrig = detectMentionTrigger(text, cursor);
    if (mTrig) {
      const items = filterMentions(mTrig.query, mentionCandidates);
      setMenu({ kind: 'mention', items, trigger: mTrig });
      return;
    }
    const sTrig = detectSlashTrigger(text, cursor);
    if (sTrig) {
      const items = filterSlashCommands(sTrig.query);
      setMenu({ kind: 'slash', items, trigger: sTrig });
      return;
    }
    setMenu(null);
  }

  function applyItem(item) {
    const ta = taRef.current;
    const cursor = ta ? ta.selectionStart : value.length;
    let next;
    if (menu?.kind === 'mention') {
      next = applyMentionInsertion(value, menu.trigger, item);
    } else if (menu?.kind === 'slash') {
      next = applySlashInsertion(value, menu.trigger, item);
    } else {
      return;
    }
    onChange(next.text);
    setMenu(null);
    requestAnimationFrame(() => {
      if (ta) {
        ta.focus();
        ta.setSelectionRange(next.cursor, next.cursor);
      }
    });
  }

  return (
    <div className={`prp-rich-composer ${className}`.trim()}>
      <textarea
        ref={taRef}
        className="prp-textarea"
        rows={rows}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          syncMenus(e.target.value, e.target.selectionStart);
        }}
        onKeyUp={(e) => syncMenus(e.currentTarget.value, e.currentTarget.selectionStart)}
        onClick={(e) => syncMenus(e.currentTarget.value, e.currentTarget.selectionStart)}
      />
      {menu?.items?.length ? (
        <ul className="prp-composer-menu" role="listbox">
          {menu.items.map((item) => {
            const label =
              menu.kind === 'mention'
                ? `@${item}`
                : item.label || item.id;
            const desc = menu.kind === 'slash' ? item.description : null;
            return (
              <li key={label}>
                <button type="button" className="prp-composer-menu__item" onClick={() => applyItem(item)}>
                  <strong>{label}</strong>
                  {desc ? <span className="prp-muted"> {desc}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="prp-composer-hint prp-muted">
        Markdown · mermaid fences · @mention · /commands ({(SLASH_COMMANDS || []).map((c) => c.label).join(' ')})
      </div>
    </div>
  );
}
