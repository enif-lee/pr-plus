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

export function AsideFilesTree({ files }: any) {
  const [expandedDirs, setExpandedDirs] = useState(() => new Set());
  const tree = useMemo(() => buildNestedFileTree(files || []), [files]);

  useEffect(() => {
    const dirs = new Set();
    for (const n of tree) {
      if (n.type === 'dir') dirs.add(n.path);
    }
    setExpandedDirs(dirs);
  }, [tree]);

  const visible = useMemo(
    () => flattenVisibleTree(tree, expandedDirs),
    [tree, expandedDirs]
  );
  const { nodes, truncated, total } = useMemo(
    () => takeVisibleTreeNodes(visible, 20),
    [visible]
  );

  if (!files?.length) {
    return <div className="prp-muted">No files</div>;
  }

  return (
    <>
      <ul className="prp-aside-tree">
        {nodes.map((node) => {
          if (node.type === 'dir') {
            const open = expandedDirs.has(node.path);
            return (
              <li key={`d-${node.path}`} className="prp-aside-tree__row" style={{ paddingLeft: 4 + node.depth * 12 }}>
                <button
                  type="button"
                  className="prp-aside-tree__item prp-aside-tree__dir"
                  onClick={() =>
                    setExpandedDirs((prev) => {
                      const n = new Set(prev);
                      if (n.has(node.path)) n.delete(node.path);
                      else n.add(node.path);
                      return n;
                    })
                  }
                >
                  <span className="prp-aside-tree__chev">{open ? '▼' : '▶'}</span>
                  <span className="prp-aside-tree__name">{node.name}/</span>
                </button>
              </li>
            );
          }
          const f = node.file || {};
          return (
            <li key={`f-${node.path}`} className="prp-aside-tree__row" style={{ paddingLeft: 4 + node.depth * 12 }}>
              <span className="prp-aside-tree__item">
                <span className="prp-aside-tree__name" title={node.path}>
                  {node.name}
                </span>
                <span className="prp-aside-tree__stat">
                  +{f.additions ?? 0}/−{f.deletions ?? 0}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {truncated > 0 ? (
        <div className="prp-aside-overflow">
          +{truncated} more nodes · {total} visible when expanded
        </div>
      ) : null}
    </>
  );
}
