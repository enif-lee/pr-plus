import React, { useEffect, useMemo, useRef, useState, memo, useCallback } from 'react';
import { Button } from '@common/Button';
import { Badge } from '@common/Badge';
import { Card } from '@common/Card';
import { AsideSection } from '@common/AsideSection';
import { MarkdownComposer } from '@common/MarkdownComposer';
import { MarkdownView } from '@common/MarkdownView';
import { TipPopover } from '@common/TipPopover';
import { UserLink } from '@common/UserLink';
import { LabelLink } from '@common/LabelLink';
import { formatWhen } from '@common/utils';
import { Avatar } from '@common/Avatar';
import {
  IconChevronLeft,
  IconChevronRight,
  IconDisclosure,
  IconFileDiff,
  IconLinkExternal,
  IconMergeStatus,
  IconPencil,
  IconTrash,
} from '@common/icons';
import { buildUnifiedReviewerRows, isBotAccount } from '@lib/searchable-select';
import {
  conversationAsideWidthPx,
  loadAsidePref,
  resolveAsideStorage,
  saveAsidePref,
  toggleAsideCollapsed,
} from '@lib/aside-layout';
import { sidePanelShortcutLabel } from '@lib/shortcut-policy';
import { AsideCompactRail } from './AsideCompactRail';
import {
  buildConversationTimeline,
  partitionTimelineWithThreadGap,
} from '@lib/conversation-timeline';
import { snippetForComment } from '@lib/diff-snippet';
import {
  buildMergeBoxStatus,
  mergeMethodButtonLabel,
  MERGE_METHODS,
  normalizeMergeMethod,
  type MergeMethod,
} from '@lib/merge-box-status';
import { BodyEditor } from '../composers/BodyEditor';
import { MetaList } from './MetaList';
import { AsideCommitsTimeline } from './AsideCommitsTimeline';
import { AsideTagsList } from './AsideTagsList';
import {
  mayHaveMoreCommits,
  mayHaveMoreFiles,
} from '@lib/aside-lists';
import { AsideFilesTree } from './AsideFilesTree';
import { ChecksPanel, hasChecksData } from './ChecksPanel';
import { MergeBoxChecks } from './MergeBoxChecks';
import { LoadingSkeleton } from '../chrome/LoadingSkeleton';
import { VirtualConversationList } from './VirtualConversationList';
import { InlineThread } from '../diff/InlineThread';
import { FloatingScrollbar } from '../../components/common/FloatingScrollbar';
import {
  applyEmbedWheelScroll,
  isEmbedPresentation,
} from '@lib/page-embed';
import { resolveDevelopmentMainOpen } from '@lib/command-palette';
import { canSubmitReviewVerdict } from '@lib/pr-edit-api';
import { OptBtnHint } from '@common/OptBtnHint';
import { useModalStore } from '../../store/modal-store';
import {
  focusContextThreadReplyAfterPaint,
  isContextThreadReplyFocused,
  queryContextThreadHost,
} from '@lib/context-thread-dom';
import {
  ConversationKbFocusClassName,
  ConversationKbEnterExpand,
  ConversationKbFocusHost,
  ConversationKbFocusScroller,
  useIsConversationKbFocused,
} from '@common/ConversationKbFocus';

/** Group path-row fold control — ⌥F tip only when this thread is context-focused. */
function GroupThreadFoldBtn({
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
      className={`prp-review-group__row-btn${focused ? ' prp-opt-hint-host' : ''}`}
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
      <span className="prp-review-group__chev" aria-hidden="true">
        <IconDisclosure open={open} size={16} />
      </span>
      <span className="prp-mono prp-review-group__path" title={fileLoc || ''}>
        {fileLoc || path || 'thread'}
      </span>
      {pendingBadge}
      {outdatedBadge}
      {resolvedBadge}
    </button>
  );
}

/** Group jump-to-diff control — ⌥D tip only when context-focused. */
function GroupThreadJumpBtn({
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
      className={`prp-icon-btn prp-review-group__jump${
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

function ConversationViewImpl(props: any) {
  const {
    detail,
    commentText,
    setCommentText,
    actionBusy,
    actionMsg,
    onLeaveReviewAction,
    onDiscardPending = null,
    sectionLoading,
    /** 'embed' enables global-then-panel wheel chaining */
    presentation = 'modal',
    onDeleteIssueComment,
    onDeleteReviewComment,
    editingBody,
    onStartEditBody,
    onCancelEditBody,
    onSaveBody,
    editingComment,
    onStartEditComment,
    onCancelEditComment,
    onSaveEditComment,
    pendingCount,
    onAddReviewer,
    onRemoveReviewer,
    onAddAssignee,
    onRemoveAssignee,
    onAddLabel,
    onRemoveLabel,
    onApplySuggestion,
    onRegisterApply,
    onRegisterEditorSave,
    onSetMilestone,
    onOpenMilestonePicker,
    onClearMilestone,
    onEnsureAllCommits = null,
    onEnsureAllFiles = null,
    commitsLoading = false,
    filesLoading = false,
    /** Side panels loading without cache: { commits, checks, development } */
    sidePending = null,
    prTags = null,
    prTagsLoading = false,
    prTagsError = null,
    onRerequestReviewer = null,
    onMergePr,
    onUpdateBranch,
    onSetDraftStage,
    onClosePr,
    onReopenPr,
    /** Open another PR in-modal/sheet (Development links). */
    onOpenLinkedPr = null,
    /** Known open PR numbers (same repo) for Development in-modal routing. */
    knownPullNumbers = null,
    /** App registers toggle so ⌥B can collapse the metadata rail */
    onRegisterAsideToggle = null,
    /**
     * Context-thread shortcuts (⌥F/D/C · ⌥⌃R). Conversation registers
     * fold/goto/comment/resolve for the focused review thread unit.
     */
    onRegisterContextThreadActions = null,
    commentBoxRef,
    onUploadFile,
    reviewerAddRef,
    assigneeAddRef,
    labelAddRef,
    milestoneAddRef,
    onReplyToThread = null,
    onResolveThread = null,
    onLoadMoreReviewThreads = null,
    /** Open Diff and scroll to this review thread (file:line / comment id). */
    onJumpToReviewThread = null,
    /** Visible review-thread GraphQL ids (PRRT_…) for targeted refresh */
    onVisibleThreadNodeIds = null,
    /** When true: composer → merge box → conversation (latest first). */
    reverseComments = true,
    reviewThreadsMeta = null,
    searchQuery = '',
    searchHits = null,
    searchHitIndex = -1,
    activeSearchHit = null,
    mentionCandidates = [],
  } = props;

  const embedScrollChain = isEmbedPresentation(presentation);
  const convRootRef = useRef<HTMLDivElement | null>(null);
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>('merge');
  const [mergeMenuOpen, setMergeMenuOpen] = useState(false);
  const mergeMenuRef = useRef<HTMLDivElement | null>(null);
  const asideScrollRef = useRef<HTMLAsideElement | null>(null);
