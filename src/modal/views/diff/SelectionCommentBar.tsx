import React, { useEffect, useState } from 'react';
import { Button } from '@common/Button';
import { MarkdownComposer } from '@common/MarkdownComposer';
import { TipPopover } from '@common/TipPopover';
import { OptBtnHint } from '@common/OptBtnHint';
import { IconX } from '@common/icons';
import {
  extractSelectedCodeText,
  githubBlobLinePermalink,
  normalizeSelection,
} from '@lib/line-selection';
import { copyTextToClipboard } from '@lib/copy-to-clipboard';
import { useModalStore } from '../../store/modal-store';

export type SelectionIslandPhase = 'actions' | 'comment';

/**
 * Selection floating UI — actions group or comment composer.
 * Mounted under the selection-end row (or file header) so it scrolls
 * with the virtual list and unmounts when that row leaves the window.
 */
export function SelectionCommentBar(props: any) {
  const {
    selection: selectionProp = null,
    draft,
    onDraft,
    onSubmitImmediate,
    onSubmitPending,
    onCancel,
    actionBusy,
    pendingCount,
    leaving = false,
    onUploadFile,
    linkCtx,
    mentionCandidates = [],
    virtualRows = null,
    detail = null,
    phase: phaseProp = null,
    onPhaseChange = null,
    onCopyFeedback = null,
    /** Opt-hold: show shortcut badges on action buttons */

  } = props;

  // Prefer store so App need not re-render on every caret move
  const storeSelection = useModalStore((s) => s.lineSelection);
  const showOptHints = useModalStore((s) => s.optHintsActive);
  const selection = selectionProp ?? storeSelection;

  const [phaseLocal, setPhaseLocal] = useState<SelectionIslandPhase>('actions');
  // Must be unconditional (before phase === 'actions' early return) — Rules of Hooks.
  const [selComposerFocused, setSelComposerFocused] = useState(false);

  const isFileTarget =
    selection?.kind === 'file' || selection?.subjectType === 'file';

  // File header selection uses the same action-group island as line selection
  // (Comment / Copy code / Copy URL / Dismiss) — not comment-only.
  const phase: SelectionIslandPhase =
    phaseProp === 'comment' || phaseProp === 'actions'
      ? phaseProp
      : phaseLocal;

  function setPhase(next: SelectionIslandPhase) {
    if (typeof onPhaseChange === 'function') onPhaseChange(next);
    else setPhaseLocal(next);
  }

  useEffect(() => {
    if (phaseProp == null) setPhaseLocal('actions');
  }, [
    selection?.anchorLine,
    selection?.headLine,
    selection?.filePath,
    selection?.kind,
    selection?.subjectType,
    selection?.anchorRowIndex,
    selection?.headRowIndex,
    phaseProp,
  ]);

  if (!selection || typeof normalizeSelection !== 'function') return null;
  const norm = normalizeSelection(selection);
  if (!norm) return null;
  const canSubmit = !actionBusy && !!String(draft || '').trim();

  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.platform || '');
  const mod = isMac ? '⌘' : 'Ctrl';
  const opt = isMac ? '⌥' : 'Alt';

  function flash(msg: string) {
    onCopyFeedback?.(msg);
  }

  async function copyCode() {
    const text =
      typeof extractSelectedCodeText === 'function'
        ? extractSelectedCodeText(virtualRows, selection)
        : '';
    if (!text) {
      flash('No code in selection');
      return;
    }
    const ok = await copyTextToClipboard(text);
    flash(ok ? 'Code copied' : 'Copy failed');
  }

  async function copyUrl() {
    if (norm.subjectType === 'file') {
      const owner = detail?.owner || linkCtx?.owner;
      const repo = detail?.repo || linkCtx?.repo;
      const ref = detail?.headSha || detail?.headRef;
      if (!owner || !repo || !norm.filePath || !ref) {
        flash('Could not build URL');
        return;
      }
      const encPath = String(norm.filePath)
        .replace(/^\/+/, '')
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/');
      const url = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${encodeURIComponent(ref)}/${encPath}`;
      const ok = await copyTextToClipboard(url);
      flash(ok ? 'URL copied' : 'Copy failed');
      return;
    }
    const url =
      typeof githubBlobLinePermalink === 'function'
        ? githubBlobLinePermalink({
            owner: detail?.owner || linkCtx?.owner,
            repo: detail?.repo || linkCtx?.repo,
            path: norm.filePath,
            startLine: norm.startLine,
            endLine: norm.endLine,
            side: norm.endSide,
            headSha: detail?.headSha,
            headRef: detail?.headRef,
            baseSha: detail?.baseSha,
            baseRef: detail?.baseRef,
          })
        : '';
    if (!url) {
      flash('Could not build URL');
      return;
    }
    const ok = await copyTextToClipboard(url);
    flash(ok ? 'URL copied' : 'Copy failed');
  }

  // ── Actions: floating segmented group (line + file header targets) ──
  if (phase === 'actions') {
    const kbdComment = `${opt}C`;
    const kbdCopyCode = `${mod}C`;
    const kbdCopyUrl = `${mod}${opt}C`;
    return (
      <div
        className={`prp-selection-dock prp-selection-group${
          leaving ? ' prp-selection-group--out' : ' prp-selection-group--in'
        }${showOptHints ? ' prp-selection-group--opt-hints' : ''}${
          isFileTarget ? ' prp-selection-group--file' : ''
        }`}
        role="toolbar"
        aria-label={isFileTarget ? 'File selection actions' : 'Selection actions'}
        data-phase="actions"
        data-file-target={isFileTarget ? '1' : '0'}
        data-opt-hints={showOptHints ? '1' : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="prp-selection-group__btn prp-has-tip prp-opt-hint-host"
          disabled={actionBusy}
          onClick={() => setPhase('comment')}
        >
          <OptBtnHint
            label={kbdComment}
            preferredPlacement="top"
          />
          Comment
          <TipPopover
            title={
              isFileTarget
                ? 'Add file-level review comment'
                : 'Add review comment'
            }
            shortcut={kbdComment}
          />
        </button>
        <button
          type="button"
          className="prp-selection-group__btn prp-has-tip prp-opt-hint-host"
          disabled={actionBusy}
          onClick={() => void copyCode()}
        >
          <OptBtnHint
            label={kbdCopyCode}
            preferredPlacement="top"
          />
          Copy code
          <TipPopover
            title={
              isFileTarget ? 'Copy entire file code' : 'Copy selected code'
            }
            shortcut={kbdCopyCode}
          />
        </button>
        <button
          type="button"
          className="prp-selection-group__btn prp-has-tip prp-opt-hint-host"
          disabled={actionBusy}
          onClick={() => void copyUrl()}
        >
          <OptBtnHint
            label={kbdCopyUrl}
            preferredPlacement="top"
          />
          Copy URL
          <TipPopover
            title={
              isFileTarget ? 'Copy GitHub file link' : 'Copy GitHub line link'
            }
            shortcut={kbdCopyUrl}
          />
        </button>
        <button
          type="button"
          className="prp-selection-group__btn prp-selection-group__btn--icon prp-has-tip prp-opt-hint-host"
          disabled={actionBusy}
          onClick={onCancel}
          aria-label="Dismiss selection"
        >
          <OptBtnHint
            label="Esc"
            preferredPlacement="top"
          />
          <IconX size={14} />
          <TipPopover title="Dismiss" shortcut="Esc" />
        </button>
      </div>
    );
  }

  // ── Comment composer (file or line) ──
  return (
    <div
      className={`prp-selection-dock prp-selection-island prp-selection-island--comment${
        leaving ? ' prp-selection-island--out' : ' prp-selection-island--in'
      }${isFileTarget ? ' prp-selection-island--file' : ''}`}
      data-phase="comment"
      data-subject={norm.subjectType || 'line'}
      data-prp-composer-root="1"
      data-prp-composer-kind="selection"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="prp-opt-hint-host prp-selection-island__composer-field">
        {selComposerFocused ? (
          <>
            <OptBtnHint label="⌥E" preferredPlacement="top" />
            <OptBtnHint label="⌥I" preferredPlacement="top" />
          </>
        ) : null}
        <MarkdownComposer
          value={draft}
          onChange={onDraft}
          placeholder={
            isFileTarget
              ? 'Write a file-level review comment…'
              : 'Write a review comment…'
          }
          forceOpen
          compact={false}
          rows={3}
          disabled={actionBusy}
          showTabs
          onUploadFile={onUploadFile}
          linkCtx={linkCtx}
          mentionCandidates={mentionCandidates}
          onSubmitRequest={onSubmitImmediate}
          onComposerFocusChange={setSelComposerFocused}
        />
      </div>
      <div className="prp-composer__row">
        <span className="prp-opt-hint-host inline-flex">
          {selComposerFocused ? (
            <OptBtnHint label="⌥C · ⌘↵" preferredPlacement="top" />
          ) : null}
          <Button
            size="sm"
            variant="primary"
            loading={Boolean(actionBusy)}
            disabled={!canSubmit}
            onClick={onSubmitImmediate}
            data-prp-composer-submit="1"
            title="Comment (⌥C · ⌘↵)"
          >
            {actionBusy ? 'Submitting…' : 'Comment'}
          </Button>
        </span>
        <Button
          size="sm"
          loading={Boolean(actionBusy)}
          disabled={!canSubmit}
          onClick={onSubmitPending}
        >
          {actionBusy
            ? 'Working…'
            : pendingCount > 0
              ? 'Add comment'
              : 'Start review'}
        </Button>
        <Button
          size="sm"
          disabled={actionBusy}
          onClick={() => setPhase('actions')}
          data-prp-selection-back="1"
        >
          Back
        </Button>
        <Button size="sm" disabled={actionBusy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default SelectionCommentBar;
