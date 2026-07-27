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

  const isFileTarget =
    selection?.kind === 'file' || selection?.subjectType === 'file';

  const phase: SelectionIslandPhase = isFileTarget
    ? 'comment'
    : phaseProp === 'comment' || phaseProp === 'actions'
      ? phaseProp
      : phaseLocal;

  function setPhase(next: SelectionIslandPhase) {
    if (isFileTarget) return;
    if (typeof onPhaseChange === 'function') onPhaseChange(next);
    else setPhaseLocal(next);
  }

  useEffect(() => {
    if (isFileTarget) return;
    if (phaseProp == null) setPhaseLocal('actions');
  }, [
    selection?.anchorLine,
    selection?.headLine,
    selection?.filePath,
    selection?.kind,
    phaseProp,
    isFileTarget,
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

  // ── Actions: floating segmented group only (no card, no filename) ──
  if (phase === 'actions' && !isFileTarget) {
    const kbdComment = `${opt}C`;
    const kbdCopyCode = `${mod}C`;
    const kbdCopyUrl = `${mod}${opt}C`;
    return (
      <div
        className={`prp-selection-dock prp-selection-group${
          leaving ? ' prp-selection-group--out' : ' prp-selection-group--in'
        }${showOptHints ? ' prp-selection-group--opt-hints' : ''}`}
        role="toolbar"
        aria-label="Selection actions"
        data-phase="actions"
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
          <TipPopover title="Add review comment" shortcut={kbdComment} />
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
          <TipPopover title="Copy selected code" shortcut={kbdCopyCode} />
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
          <TipPopover title="Copy GitHub line link" shortcut={kbdCopyUrl} />
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
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
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
      />
      <div className="prp-composer__row">
        <Button size="sm" variant="primary" disabled={!canSubmit} onClick={onSubmitImmediate}>
          Comment
        </Button>
        <Button size="sm" disabled={!canSubmit} onClick={onSubmitPending}>
          {pendingCount > 0 ? 'Add comment' : 'Start review'}
        </Button>
        {!isFileTarget ? (
          <Button size="sm" disabled={actionBusy} onClick={() => setPhase('actions')}>
            Back
          </Button>
        ) : null}
        <Button size="sm" disabled={actionBusy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default SelectionCommentBar;
