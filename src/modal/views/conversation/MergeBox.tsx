/**
 * Conversation merge status box + method menu + secondary PR stage actions.
 * Residual CSS: ./MergeBox.css (tone tokens + split CTA only).
 * Layout/spacing/typography: Tailwind utilities on this file.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@common/Button';
import { IconCheck, IconFileDiff, IconMergeStatus } from '@common/icons';
import { OptBtnHint } from '@common/OptBtnHint';
import { MergeBoxChecks } from './MergeBoxChecks';
import { hasChecksData } from './ChecksPanel';
import {
  defaultMergeMethod,
  mergeMethodsForUi,
  normalizeMergeMethod,
  resolveMergePrimaryAction,
  type MergeMethod,
} from '@lib/merge-box-status';
import {
  localizeDeleteHeadBranchLabel,
  localizeMergeButtonLabel,
  localizeMergeChecksLine,
  localizeMergeMethodRow,
  mergeBoxLocalizedCopy,
} from '@lib/merge-box-i18n';
import { shouldShowDeleteHeadBranch } from '@lib/delete-head-branch';
import { useT } from '@lib/locale-context';
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
  const t = useT();
  const methods = useMemo(() => {
    const base = mergeMethodsForUi(detail);
    return base.map((m) => localizeMergeMethodRow(m.id, detail, t));
  }, [detail, t]);
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>(() =>
    defaultMergeMethod(detail)
  );
  const [mergeMenuOpen, setMergeMenuOpen] = useState(false);
  /** GitHub-style admin bypass opt-in (default off). */
  const [bypassRulesAccepted, setBypassRulesAccepted] = useState(false);
  const mergeMenuRef = useRef<HTMLDivElement | null>(null);

  const statusCopy = useMemo(() => mergeBoxLocalizedCopy(ms, t), [ms, t]);
  const checksLine = useMemo(
    () => localizeMergeChecksLine(ms?.checksLine, t),
    [ms?.checksLine, t]
  );

  // Keep selection valid when repo settings load / change.
  useEffect(() => {
    setMergeMethod((cur) => defaultMergeMethod(detail, cur));
  }, [
    detail?.allowMergeCommit,
    detail?.allowSquashMerge,
    detail?.allowRebaseMerge,
    detail?.number,
  ]);

  // Always clear opt-in on PR switch (and when bypass is no longer offered).
  // Switching between two blocked+admin PRs must not keep a prior check.
  useEffect(() => {
    setBypassRulesAccepted(false);
  }, [detail?.number, ms?.offerBypassRules]);

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

  const primaryAction = useMemo(() => {
    const base =
      typeof resolveMergePrimaryAction === 'function'
        ? resolveMergePrimaryAction(ms, { bypassRulesAccepted })
        : null;
    const force = Boolean(base?.forceWording ?? ms?.forceMerge);
    const bypass = Boolean(base?.bypassWording);
    return {
      showBypassCheckbox: Boolean(base?.showBypassCheckbox),
      bypassCheckboxLabel: t('merge_bypass_checkbox'),
      mergeEnabled: base
        ? Boolean(base.mergeEnabled)
        : Boolean(ms?.canMerge),
      forceWording: force,
      bypassWording: bypass,
      ctaVariant: base?.ctaVariant || ms?.ctaVariant || 'default',
      buttonLabel: (method: MergeMethod) =>
        localizeMergeButtonLabel(method, { force, bypass }, t),
    };
  }, [ms, bypassRulesAccepted, t]);

  return (
    <div
      className={`prp-merge-box prp-merge-box--${boxTone} my-3 mb-1 flex flex-col gap-3.5 rounded-xl px-[18px] py-4`}
      data-merge-kind={ms.kind}
      role="region"
      aria-label={t('merge_aria_status')}
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
            {statusCopy.headline}
          </h3>
          <p className="prp-merge-box__helper m-0 text-[13px] leading-snug text-[var(--prp-fg-muted)]">
            {ms.kind === 'conflicts' ? (
              <>
                {t('merge_conflicts_use')}{' '}
                {resolveUrl ? (
                  <a href={resolveUrl} target="_blank" rel="noopener noreferrer">
                    {t('merge_conflicts_web_editor')}
                  </a>
                ) : (
                  t('merge_conflicts_web_editor')
                )}{' '}
                {t('merge_conflicts_or_cli')}
                {statusCopy.conflictsFilesNote
                  ? ` ${statusCopy.conflictsFilesNote}`
                  : null}
              </>
            ) : (
              statusCopy.helper
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
            {t('cta_resolve_conflicts')}
          </a>
        ) : null}
      </div>

      {ms.kind === 'conflicts' && conflictFiles.length > 0 ? (
        <ul
          className="prp-merge-box__conflict-files m-0 flex list-none flex-col gap-1.5 p-0"
          aria-label={t('merge_aria_conflict_files')}
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
      ) : checksLine ? (
        <p className="prp-merge-box__checks-line prp-muted m-0 mt-1.5 text-xs">
          {checksLine}
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
            title={t('merge_delete_branch_title')}
          >
            {localizeDeleteHeadBranchLabel(detail, t)}
          </Button>
        </div>
      ) : null}

      {detail.state === 'open' && !detail.merged ? (
        <div className="prp-merge-box__actions flex flex-col items-stretch gap-2.5">
          {primaryAction.showBypassCheckbox ? (
            <label
              className="prp-merge-bypass flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--prp-border-muted)] bg-[var(--prp-bg-muted)] px-3 py-2.5"
              data-prp-bypass-rules="1"
            >
              <input
                type="checkbox"
                className="prp-merge-bypass__input mt-0.5 h-4 w-4 shrink-0 accent-[var(--prp-danger)]"
                checked={bypassRulesAccepted}
                disabled={actionBusy}
                onChange={(e) => setBypassRulesAccepted(Boolean(e.target.checked))}
                data-prp-bypass-rules-check="1"
              />
              <span
                className={`prp-merge-bypass__label text-[13px] font-semibold leading-snug${
                  bypassRulesAccepted ? ' text-[var(--prp-danger)]' : ' text-[var(--prp-fg)]'
                }`}
              >
                {primaryAction.bypassCheckboxLabel}
              </span>
            </label>
          ) : null}

          <div className="prp-merge-box__actions-row flex flex-wrap items-center gap-2">
          {ms.showMerge && methods.length > 0 ? (
            <div
              className={`prp-merge-method prp-merge-method--${primaryAction.ctaVariant || 'default'} relative inline-flex flex-col items-stretch${
                primaryAction.bypassWording || primaryAction.forceWording
                  ? ' prp-merge-method--force'
                  : ''
              }${mergeMenuOpen ? ' prp-merge-method--menu-open' : ''}`}
              ref={mergeMenuRef}
              data-cta-variant={primaryAction.ctaVariant || 'default'}
              data-force-merge={
                primaryAction.forceWording || primaryAction.bypassWording
                  ? '1'
                  : '0'
              }
              data-can-merge={primaryAction.mergeEnabled ? '1' : '0'}
              data-bypass-offer={primaryAction.showBypassCheckbox ? '1' : '0'}
              data-bypass-accepted={bypassRulesAccepted ? '1' : '0'}
              data-method-count={methods.length}
              data-menu-open={mergeMenuOpen ? '1' : '0'}
            >
              <div className="prp-merge-method__split prp-opt-hint-host inline-flex items-stretch overflow-hidden rounded-lg">
                <OptBtnHint label="⌥⇧M" />
                <Button
                  className={`prp-merge-method__primary prp-merge-method__primary--${
                    primaryAction.ctaVariant || 'default'
                  } font-semibold`}
                  variant={
                    primaryAction.ctaVariant ||
                    (primaryAction.mergeEnabled ? 'ok' : 'default')
                  }
                  disabled={actionBusy || !primaryAction.mergeEnabled}
                  onClick={() => onMergePr?.(normalizeMergeMethod(mergeMethod))}
                  title={
                    primaryAction.bypassWording
                      ? t('cta_bypass_rules')
                      : activeMethodMeta?.description || t('cta_merge_pr')
                  }
                  shortcut="⌥⇧M"
                  data-prp-merge-primary="1"
                >
                  {primaryAction.buttonLabel(mergeMethod)}
                </Button>
                {showMethodMenu ? (
                  <button
                    type="button"
                    className={`prp-merge-method__caret prp-merge-method__caret--${
                      primaryAction.ctaVariant || 'default'
                    } inline-flex min-w-[34px] items-center justify-center px-2.5 text-xs font-inherit rounded-tr-lg rounded-br-lg`}
                    disabled={actionBusy}
                    aria-haspopup="menu"
                    aria-expanded={mergeMenuOpen}
                    aria-label={t('cta_select_merge_method')}
                    title={t('cta_select_merge_method')}
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
                  aria-label={t('merge_aria_method')}
                >
                  {methods.map((m) => {
                    const active = mergeMethod === m.id;
                    return (
                      <li key={m.id} role="none">
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          className={`prp-merge-method__item flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left${
                            active ? ' prp-merge-method__item--active' : ''
                          }`}
                          onClick={() => {
                            setMergeMethod(m.id);
                            setMergeMenuOpen(false);
                          }
                          }
                        >
                          <span
                            className="prp-merge-method__item-check mt-0.5 inline-flex h-[1.1em] w-[1.1em] shrink-0 items-center justify-center"
                            aria-hidden="true"
                          >
                            {active ? <IconCheck size={14} /> : null}
                          </span>
                          <span className="prp-merge-method__item-body flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="prp-merge-method__item-label text-[13px] font-semibold leading-snug">
                              {m.label}
                            </span>
                            <span className="prp-merge-method__item-desc prp-muted text-xs leading-snug">
                              {m.description}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}

          {ms.showUpdateBranch ? (
            <span className="prp-opt-hint-host">
              <OptBtnHint label="⌥⇧U" />
              <Button size="sm" disabled={actionBusy} onClick={onUpdateBranch} shortcut="⌥⇧U">
                {t('cta_update_branch')}
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
                {t('cta_ready_review')}
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
                {t('cta_convert_draft')}
              </Button>
            </span>
          ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
