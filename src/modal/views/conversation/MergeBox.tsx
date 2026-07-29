/**
 * Conversation merge status box + method menu + secondary PR stage actions.
 * Residual CSS: ./MergeBox.css (tone tokens + split CTA only).
 * Layout/spacing/typography: Tailwind utilities on this file.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@common/Button';
import { IconFileDiff, IconMergeStatus } from '@common/icons';
import { OptBtnHint } from '@common/OptBtnHint';
import { MergeBoxChecks } from './MergeBoxChecks';
import { hasChecksData } from './ChecksPanel';
import {
  defaultMergeMethod,
  mergeMethodButtonLabel,
  mergeMethodsForUi,
  normalizeMergeMethod,
  type MergeMethod,
} from '@lib/merge-box-status';
import {
  shouldShowDeleteHeadBranch,
  deleteHeadBranchButtonLabel,
} from '@lib/delete-head-branch';
import './MergeBox.css';

export function MergeBox({
  detail,
  ms,
  boxTone,
  actionBusy,
  onMergePr,
  onUpdateBranch,
  onDeleteHeadBranch,
  onSetDraftStage,
}: {
  detail: any;
  ms: any;
  boxTone: string;
  actionBusy?: boolean;
  onMergePr?: (method: MergeMethod) => void;
  onUpdateBranch?: () => void;
  onDeleteHeadBranch?: (() => void) | null;
  onSetDraftStage?: (stage: string) => void;
}) {
  const methods = useMemo(() => mergeMethodsForUi(detail), [detail]);
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>(() =>
    defaultMergeMethod(detail)
  );
  const [mergeMenuOpen, setMergeMenuOpen] = useState(false);
  const mergeMenuRef = useRef<HTMLDivElement | null>(null);

  // Keep selection valid when repo settings load / change.
  useEffect(() => {
    setMergeMethod((cur) => defaultMergeMethod(detail, cur));
  }, [
    detail?.allowMergeCommit,
    detail?.allowSquashMerge,
    detail?.allowRebaseMerge,
    detail?.number,
  ]);

  useEffect(() => {
    if (!mergeMenuOpen) return undefined;
    const onDoc = (e: MouseEvent) => {
      const el = mergeMenuRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setMergeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [mergeMenuOpen]);

  const conflictFiles = Array.isArray(ms.conflictFiles) ? ms.conflictFiles : [];
  const resolveUrl = ms.resolveConflictsUrl || null;
  const activeMethodMeta =
    methods.find((m) => m.id === mergeMethod) || methods[0] || null;
  const showMethodMenu = methods.length > 1;
  const showDeleteBranch =
    typeof shouldShowDeleteHeadBranch === 'function'
      ? shouldShowDeleteHeadBranch(detail)
      : Boolean(detail?.merged && detail?.headRef && !detail?.headBranchDeleted);

  return (
    <div
      className={`prp-merge-box prp-merge-box--${boxTone} my-3 mb-1 flex flex-col gap-3.5 rounded-xl px-[18px] py-4`}
      data-merge-kind={ms.kind}
      role="region"
      aria-label="Merge status"
    >
      <div className="prp-merge-box__status-block flex min-w-0 items-start gap-3">
        <span
          className={`prp-merge-box__icon prp-merge-box__icon--${ms.tone} mt-px inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold`}
          aria-hidden="true"
        >
          <IconMergeStatus kind={ms.kind} size={16} />
        </span>
        <div className="prp-merge-box__copy min-w-0 flex-1">
          <h3 className="prp-merge-box__headline m-0 mb-1 text-sm font-semibold leading-snug">
            {ms.headline}
          </h3>
          <p className="prp-merge-box__helper m-0 text-[13px] leading-snug text-[var(--prp-fg-muted)]">
            {ms.kind === 'conflicts' ? (
              <>
                Use the{' '}
                {resolveUrl ? (
                  <a href={resolveUrl} target="_blank" rel="noopener noreferrer">
                    web editor
                  </a>
                ) : (
                  'web editor'
                )}{' '}
                or the command line to resolve conflicts before continuing.
              </>
            ) : (
              ms.helper
            )}
          </p>
        </div>
        {ms.showResolveConflicts && resolveUrl ? (
          <a
            className="prp-btn prp-btn--default prp-merge-box__resolve ml-auto shrink-0 self-start whitespace-nowrap no-underline"
            href={resolveUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Resolve conflicts
          </a>
        ) : null}
      </div>

      {ms.kind === 'conflicts' && conflictFiles.length > 0 ? (
        <ul
          className="prp-merge-box__conflict-files m-0 flex list-none flex-col gap-1.5 p-0"
          aria-label="Conflicting files"
        >
          {conflictFiles.map((path: string) => (
            <li
              key={path}
              className="prp-merge-box__conflict-file flex min-w-0 items-center gap-2 text-[13px] leading-snug"
            >
              <IconFileDiff size={14} aria-hidden="true" className="prp-octicon shrink-0" />
              <span
                className="prp-merge-box__conflict-path min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                title={path}
              >
                {path}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {hasChecksData(detail.checks) ? (
        <MergeBoxChecks checks={detail.checks} />
      ) : ms.checksLine ? (
        <p className="prp-merge-box__checks-line prp-muted m-0 mt-1.5 text-xs">
          {ms.checksLine}
        </p>
      ) : null}

      {showDeleteBranch ? (
        <div className="prp-merge-box__actions flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="danger"
            disabled={actionBusy}
            onClick={() => onDeleteHeadBranch?.()}
            data-prp-delete-head-branch="1"
            title="Delete the pull request head branch from the repository"
          >
            {deleteHeadBranchButtonLabel(detail)}
          </Button>
        </div>
      ) : null}

      {detail.state === 'open' && !detail.merged ? (
        <div className="prp-merge-box__actions flex flex-wrap items-center gap-2">
          {ms.showMerge && methods.length > 0 ? (
            <div
              className={`prp-merge-method prp-merge-method--${ms.ctaVariant || 'default'} relative inline-flex flex-col items-stretch${
                ms.forceMerge ? ' prp-merge-method--force' : ''
              }`}
              ref={mergeMenuRef}
              data-cta-variant={ms.ctaVariant || 'default'}
              data-force-merge={ms.forceMerge ? '1' : '0'}
              data-can-merge={ms.canMerge ? '1' : '0'}
              data-method-count={methods.length}
            >
              <div className="prp-merge-method__split prp-opt-hint-host inline-flex items-stretch overflow-hidden rounded-lg">
                <OptBtnHint label="⌥⇧M" />
                <Button
                  className={`prp-merge-method__primary prp-merge-method__primary--${
                    ms.ctaVariant || 'default'
                  } font-semibold`}
                  variant={ms.ctaVariant || (ms.canMerge ? 'ok' : 'default')}
                  disabled={actionBusy || !ms.canMerge}
                  onClick={() => onMergePr?.(normalizeMergeMethod(mergeMethod))}
                  title={
                    ms.forceMerge
                      ? 'Force merge — bypasses failing checks / branch protection if your token has permission'
                      : activeMethodMeta?.description || 'Merge pull request'
                  }
                  shortcut="⌥⇧M"
                >
                  {mergeMethodButtonLabel(mergeMethod, {
                    force: Boolean(ms.forceMerge),
                  })}
                </Button>
                {showMethodMenu ? (
                  <button
                    type="button"
                    className={`prp-merge-method__caret prp-merge-method__caret--${
                      ms.ctaVariant || 'default'
                    } inline-flex min-w-[34px] items-center justify-center px-2.5 text-xs font-inherit rounded-tr-lg rounded-br-lg`}
                    disabled={actionBusy || !ms.canMerge}
                    aria-haspopup="menu"
                    aria-expanded={mergeMenuOpen}
                    aria-label="Select merge method"
                    title="Select merge method"
                    onClick={() => setMergeMenuOpen((o) => !o)}
                  >
                    ▾
                  </button>
                ) : null}
              </div>
              {mergeMenuOpen && showMethodMenu ? (
                <ul
                  className="prp-merge-method__menu m-0 list-none rounded-[10px] p-1.5"
                  role="menu"
                >
                  {methods.map((m) => (
                    <li key={m.id} role="none">
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={mergeMethod === m.id}
                        className={`prp-merge-method__item flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left${
                          mergeMethod === m.id ? ' prp-merge-method__item--active' : ''
                        }`}
                        onClick={() => {
                          setMergeMethod(m.id);
                          setMergeMenuOpen(false);
                        }}
                      >
                        <span className="prp-merge-method__item-label text-[13px] font-semibold">
                          {m.label}
                        </span>
                        <span className="prp-merge-method__item-desc prp-muted text-xs leading-snug">
                          {m.description}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {ms.showUpdateBranch ? (
            <span className="prp-opt-hint-host">
              <OptBtnHint label="⌥⇧U" />
              <Button size="sm" disabled={actionBusy} onClick={onUpdateBranch} shortcut="⌥⇧U">
                Update branch
              </Button>
            </span>
          ) : null}

          {ms.draftToggle === 'ready' ? (
            <span className="prp-opt-hint-host">
              <OptBtnHint label="⌥⇧D" />
              <Button
                size="sm"
                variant="primary"
                disabled={actionBusy}
                onClick={() => onSetDraftStage?.('ready')}
                shortcut="⌥⇧D"
              >
                Ready for review
              </Button>
            </span>
          ) : null}
          {ms.draftToggle === 'draft' ? (
            <span className="prp-opt-hint-host">
              <OptBtnHint label="⌥⇧D" />
              <Button
                size="sm"
                disabled={actionBusy}
                onClick={() => onSetDraftStage?.('draft')}
                shortcut="⌥⇧D"
              >
                Convert to draft
              </Button>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
