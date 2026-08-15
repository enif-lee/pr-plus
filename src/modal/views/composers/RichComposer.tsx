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
import {
  filterMentions,
  filterSlashCommands,
  filterEmojis,
  detectMentionTrigger,
  detectSlashTrigger,
  detectEmojiTrigger,
  applyMentionInsertion,
  applySlashInsertion,
  applyEmojiInsertion,
  emojiMenuLabel,
  SLASH_COMMANDS,
} from '@lib/markdown-composer';
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
  const [menu, setMenu] = useState(null); // { kind:'mention'|'slash'|'emoji', items, trigger }
  const [menuIndex, setMenuIndex] = useState(0);

  function syncMenus(text: any, cursor: any) {
    if (typeof detectMentionTrigger !== 'function') {
      setMenu(null);
      return;
    }
    const mTrig = detectMentionTrigger(text, cursor);
    if (mTrig) {
      const items = filterMentions(mTrig.query, mentionCandidates);
      setMenu({ kind: 'mention', items, trigger: mTrig });
      setMenuIndex(0);
      return;
    }
    if (typeof detectEmojiTrigger === 'function') {
      const eTrig = detectEmojiTrigger(text, cursor);
      if (eTrig) {
        const items =
          typeof filterEmojis === 'function' ? filterEmojis(eTrig.query, 12) : [];
        setMenu({ kind: 'emoji', items, trigger: eTrig });
        setMenuIndex(0);
        return;
      }
    }
    const sTrig = detectSlashTrigger(text, cursor);
    if (sTrig) {
      const items = filterSlashCommands(sTrig.query);
      setMenu({ kind: 'slash', items, trigger: sTrig });
      setMenuIndex(0);
      return;
    }
    setMenu(null);
  }

  function applyItem(item: any) {
    const ta = taRef.current;
    let next;
    if (menu?.kind === 'mention') {
      next = applyMentionInsertion(value, menu.trigger, item);
    } else if (menu?.kind === 'slash') {
      next = applySlashInsertion(value, menu.trigger, item);
    } else if (menu?.kind === 'emoji') {
      next = applyEmojiInsertion(value, menu.trigger, item);
    } else {
      return;
    }
    onChange(next.text);
    setMenu(null);
    setMenuIndex(0);
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
        onKeyUp={(e) => {
          if (
            e.key === 'ArrowDown' ||
            e.key === 'ArrowUp' ||
            e.key === 'Enter' ||
            e.key === 'Tab' ||
            e.key === 'Escape'
          ) {
            return;
          }
          syncMenus(e.currentTarget.value, e.currentTarget.selectionStart);
        }}
        onKeyDown={(e) => {
          if (!menu?.items?.length) return;
          const n = menu.items.length;
          if (e.key === 'Escape') {
            e.preventDefault();
            setMenu(null);
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setMenuIndex((i) => (i + 1) % n);
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setMenuIndex((i) => (i - 1 + n) % n);
            return;
          }
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            applyItem(menu.items[menuIndex] ?? menu.items[0]);
          }
        }}
        onClick={(e) => syncMenus(e.currentTarget.value, e.currentTarget.selectionStart)}
      />
      {menu?.items?.length ? (
        <ul
          className={`prp-composer-menu${
            menu.kind === 'emoji' ? ' prp-composer-menu--emoji' : ''
          }`}
          role="listbox"
        >
          {menu.items.map((item: any, idx: any) => {
            const isEmoji = menu.kind === 'emoji';
            const label = isEmoji
              ? emojiMenuLabel?.(item) || `:${item.name}:`
              : menu.kind === 'mention'
                ? `@${item}`
                : item.label || item.id;
            const desc = menu.kind === 'slash' ? item.description : null;
            return (
              <li key={String(isEmoji ? item.name : label)} role="option">
                <button
                  type="button"
                  className={`prp-composer-menu__item${
                    isEmoji ? ' prp-composer-menu__item--emoji' : ''
                  }${idx === menuIndex ? ' prp-composer-menu__item--active' : ''}`}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    applyItem(item);
                  }}
                  onMouseEnter={() => setMenuIndex(idx)}
                >
                  {isEmoji ? (
                    <>
                      <span className="prp-composer-menu__emoji" aria-hidden="true">
                        {item.emoji}
                      </span>
                      <span className="prp-composer-menu__emoji-name">{label}</span>
                    </>
                  ) : (
                    <>
                      <strong>{label}</strong>
                      {desc ? <span className="prp-muted"> {desc}</span> : null}
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="prp-composer-hint prp-muted">
        Markdown · @mention · :emoji · /commands (
        {(SLASH_COMMANDS || []).map((c) => c.label).join(' ')})
      </div>
    </div>
  );
}
