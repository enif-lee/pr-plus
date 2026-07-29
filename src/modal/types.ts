/** Shared domain types for the PR modal. */

export type LayoutMode = 'centered' | 'diff';

export type DiffMode = 'unified' | 'split';

export type LeaveReviewKind = 'comment' | 'approve' | 'request_changes';

export type PickerType = 'base' | 'reviewer' | 'assignee' | 'label' | null;

export interface SelectOption {
  id: string | number;
  label: string;
  keywords?: string[];
  disabled?: boolean;
  meta?: Record<string, any>;
  [key: string]: any;
}

export interface PickerState {
  type: PickerType | string;
  title?: string;
  options: SelectOption[];
  query: string;
  allowFreeText?: boolean;
  placeholder?: string;
  onPick?: (opt: SelectOption) => void;
}

export interface LineSelection {
  /**
   * `file` = file-level comment target (header caret).
   * `thread` = Diff review-thread caret (plain ↑↓ only).
   * default / `line` = body line range.
   */
  kind?: 'line' | 'file' | 'thread' | 'inline-comment';
  subjectType?: 'line' | 'file' | 'thread';
  filePath?: string;
  /** Review thread root id when kind is thread */
  commentId?: string | number | null;
  startLine?: number;
  endLine?: number;
  startSide?: string;
  endSide?: string;
  multi?: boolean;
  anchorLine?: number;
  headLine?: number;
  anchorSide?: string;
  headSide?: string;
  anchorRowIndex?: number;
  headRowIndex?: number;
  [key: string]: unknown;
}

export interface PendingReviewBatch {
  comments: Array<Record<string, unknown>>;
  body: string;
}

export interface ReviewComment {
  id: number | string;
  author?: string;
  body?: string;
  path?: string;
  line?: number | null;
  startLine?: number | null;
  side?: string;
  inReplyToId?: number | string | null;
  threadNodeId?: string | null;
  resolved?: boolean;
  createdAt?: string | null;
  [key: string]: unknown;
}

export interface PrDetail {
  owner: string;
  repo: string;
  number: number;
  title?: string;
  body?: string;
  state?: string;
  draft?: boolean;
  merged?: boolean;
  mergeable?: boolean | null;
  mergeableState?: string | null;
  /** GraphQL mergeStateStatus (BEHIND / CLEAN / BLOCKED / …). */
  mergeStateStatus?: string | null;
  /** Base commits the head is behind (0 = current). Gates "Update branch". */
  behindBy?: number | null;
  /** Dual-modified paths (conflict candidates) when mergeable_state is dirty. */
  conflictFiles?: string[];
  baseRef?: string;
  headRef?: string;
  baseSha?: string;
  baseOwner?: string;
  baseRepo?: string;
  headOwner?: string;
  headRepo?: string;
  headSha?: string;
  author?: string;
  viewerLogin?: string;
  htmlUrl?: string;
  labels?: Array<{ name: string; color?: string } | string>;
  assignees?: string[];
  requestedReviewers?: string[];
  reviews?: Array<{ id?: number | string; author?: string; state?: string; body?: string }>;
  comments?: Array<Record<string, unknown>>;
  reviewComments?: ReviewComment[];
  files?: Array<Record<string, unknown>>;
  commits?: Array<Record<string, unknown>>;
  checks?: { state?: string; contexts?: unknown[] };
  linkedIssues?: number[];
  /** Issues/PRs linked for Development (closing refs / body #N). */
  developmentIssues?: Array<{
    number: number;
    title?: string;
    url?: string;
    state?: string;
    /** 'issue' | 'pull' when resolved via GraphQL. */
    kind?: string;
    source?: string;
  }>;
  /** ProjectV2 boards this PR is on. */
  projects?: Array<{
    id?: string;
    title?: string;
    number?: number | null;
    url?: string;
  }>;
  milestone?: { title?: string; number?: number } | null;
  subscribed?: boolean | null;
  magicLinks?: unknown[];
  nodeId?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  gitattributesText?: string;
  [key: string]: unknown;
}

export interface PrModalHostProps {
  open: boolean;
  loading?: boolean;
  error?: string | null;
  detail?: PrDetail | null;
  openPulls?: Array<Record<string, unknown>>;
  onClose?: () => void;
  onRefresh?: () => void | Promise<void>;
  /** Stack PR hop; pass page to keep Diff/Conversation. */
  onOpenStackPr?: (
    n: number,
    opts?: { page?: 'diff' | 'conversation' | null }
  ) => void;
  /** GitHub compare files for a commit / range (base...head). */
  onFetchCompareFiles?: (
    base: string,
    head: string,
    options?: { gitattributesText?: string }
  ) => Promise<{ files: Array<Record<string, unknown>>; [k: string]: unknown }>;
}
