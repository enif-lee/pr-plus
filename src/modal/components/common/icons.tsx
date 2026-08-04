/**
 * GitHub Octicons (Primer) — shared icon set for the PR modal.
 * Prefer these over emoji/unicode so UI matches github.com.
 *
 * @see https://primer.style/foundations/icons
 */
import React from 'react';
import type { OcticonProps as PrimerOcticonProps } from '@primer/octicons-react';
import {
  ArrowLeftIcon,
  BellIcon,
  BellFillIcon,
  BellSlashIcon,
  CheckCircleFillIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleSlashIcon,
  CommentDiscussionIcon,
  CopyIcon,
  DotFillIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
  KebabHorizontalIcon,
  FileDiffIcon,
  LinkExternalIcon,
  LinkIcon,
  MarkGithubIcon,
  PencilIcon,
  ScreenFullIcon,
  ScreenNormalIcon,
  SidebarCollapseIcon,
  SidebarExpandIcon,
  SkipIcon,
  SyncIcon,
  ThreeBarsIcon,
  TrashIcon,
  XCircleFillIcon,
  XIcon,
} from '@primer/octicons-react';

export type OcticonProps = PrimerOcticonProps;

type Size = NonNullable<PrimerOcticonProps['size']>;

const DEFAULT_SIZE: Size = 16;

/** Normalize className + size for every octicon we ship. */
function wrap(
  Icon: React.ComponentType<PrimerOcticonProps>,
  extraClass = ''
): React.FC<OcticonProps> {
  const Comp: React.FC<OcticonProps> = ({
    className = '',
    size = DEFAULT_SIZE,
    ...rest
  }) => (
    <Icon
      size={size}
      className={['prp-octicon', extraClass, className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
  Comp.displayName = Icon.displayName || Icon.name || 'Octicon';
  return Comp;
}

/* ── Semantic / direct exports (GitHub names) ── */
export const IconPencil = wrap(PencilIcon, 'prp-pen-icon');
export const IconCheck = wrap(CheckIcon);
export const IconX = wrap(XIcon);
export const IconCopy = wrap(CopyIcon);
export const IconTrash = wrap(TrashIcon);
export const IconSync = wrap(SyncIcon);
/** Outline bell — not subscribed (invite to turn on notifications). */
export const IconBell = wrap(BellIcon);
/** Filled bell — optional emphasis when subscribed. */
export const IconBellFill = wrap(BellFillIcon);
/** Bell with slash — subscribed / click to mute (notifications off affordance). */
export const IconBellSlash = wrap(BellSlashIcon);
export const IconCircleSlash = wrap(CircleSlashIcon);
export const IconLinkExternal = wrap(LinkExternalIcon);
/** Hyperlink — copy PR page URL */
export const IconLink = wrap(LinkIcon);
/** GitHub mark — restore native PR UI from embed */
export const IconMarkGithub = wrap(MarkGithubIcon);
export const IconFileDiff = wrap(FileDiffIcon);
/** Conversation / discussion threads view */
export const IconConversation = wrap(CommentDiscussionIcon);
export const IconKebab = wrap(KebabHorizontalIcon);
export const IconChevronDown = wrap(ChevronDownIcon);
export const IconChevronUp = wrap(ChevronUpIcon);
export const IconChevronRight = wrap(ChevronRightIcon);
export const IconChevronLeft = wrap(ChevronLeftIcon);
export const IconArrowLeft = wrap(ArrowLeftIcon);
export const IconSidebarExpand = wrap(SidebarExpandIcon);
export const IconSidebarCollapse = wrap(SidebarCollapseIcon);
export const IconThreeBars = wrap(ThreeBarsIcon);
export const IconCheckCircleFill = wrap(CheckCircleFillIcon);
export const IconXCircleFill = wrap(XCircleFillIcon);
export const IconSkip = wrap(SkipIcon);
export const IconGitMerge = wrap(GitMergeIcon);
export const IconGitPullRequestDraft = wrap(GitPullRequestDraftIcon);
export const IconDotFill = wrap(DotFillIcon);

/** Collapse chevron: right when folded, down when open (GitHub tree / sections). */
export function IconDisclosure({
  open,
  size = 16,
  className = '',
}: {
  open: boolean;
  size?: Size;
  className?: string;
}) {
  const Icon = open ? ChevronDownIcon : ChevronRightIcon;
  return (
    <Icon
      size={size}
      className={['prp-octicon', 'prp-octicon--disclosure', className]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    />
  );
}

/** Shell layout toggle: sheet ↔ centered modal. */
export function IconShellMode({
  sheet,
  size = 16,
  className = '',
}: {
  sheet: boolean;
  size?: Size;
  className?: string;
}) {
  // Sheet active → collapse to modal; modal → expand to sheet
  const Icon = sheet ? SidebarCollapseIcon : SidebarExpandIcon;
  return (
    <Icon
      size={size}
      className={['prp-octicon', className].filter(Boolean).join(' ')}
      aria-hidden="true"
    />
  );
}

/** Fullscreen shell toggle: enter (full) ↔ exit (normal). */
export function IconFullscreen({
  active,
  size = 16,
  className = '',
}: {
  active: boolean;
  size?: Size;
  className?: string;
}) {
  const Icon = active ? ScreenNormalIcon : ScreenFullIcon;
  return (
    <Icon
      size={size}
      className={['prp-octicon', className].filter(Boolean).join(' ')}
      aria-hidden="true"
    />
  );
}

/** File-nav rail toggle on Diff toolbar. */
export function IconFileNavToggle({
  collapsed,
  size = 16,
  className = '',
}: {
  collapsed: boolean;
  size?: Size;
  className?: string;
}) {
  const Icon = collapsed ? ThreeBarsIcon : ChevronLeftIcon;
  return (
    <Icon
      size={size}
      className={['prp-octicon', className].filter(Boolean).join(' ')}
      aria-hidden="true"
    />
  );
}

/** Merge-box status glyph matching GitHub PR conversation. */
export function IconMergeStatus({
  kind,
  size = 16,
  className = '',
}: {
  kind: string;
  size?: Size;
  className?: string;
}) {
  const cls = ['prp-octicon', className].filter(Boolean).join(' ');
  if (kind === 'merged') return <GitMergeIcon size={size} className={cls} aria-hidden="true" />;
  if (kind === 'closed')
    return <GitPullRequestClosedIcon size={size} className={cls} aria-hidden="true" />;
  if (kind === 'clean')
    return <CheckCircleFillIcon size={size} className={cls} aria-hidden="true" />;
  if (kind === 'blocked' || kind === 'conflicts')
    return <XCircleFillIcon size={size} className={cls} aria-hidden="true" />;
  if (kind === 'draft')
    return <GitPullRequestDraftIcon size={size} className={cls} aria-hidden="true" />;
  return <DotFillIcon size={size} className={cls} aria-hidden="true" />;
}
