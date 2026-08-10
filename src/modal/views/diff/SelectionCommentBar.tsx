import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@common/Button';
import { MarkdownComposer } from '@common/MarkdownComposer';
import { TipPopover } from '@common/TipPopover';
import { OptBtnHint } from '@common/OptBtnHint';
import { IconX } from '@common/icons';
import {
  extractSelectedCodeText,
  githubBlobLinePermalink,
  normalizeSelection,
  preferredOptHintPlacementForDock,
  resolveSelectionDockVerticalPlacement,
  selectionDockSideNeed,
  selectionHeadBlockRole,
  SELECTION_DOCK_GAP_EST,
} from '@lib/line-selection';
import { copyTextToClipboard } from '@lib/copy-to-clipboard';
import {
  canPublishImmediateReviewComment,
  pendingAttachCtaLabel,
} from '@lib/pending-review';
import { useModalStore } from '../../store/modal-store';

export type SelectionIslandPhase = 'actions' | 'comment';

/**
 * Clip rect for selection dock flip: Diff scroller when present, else viewport.
 */
function readSelectionDockClip(host: HTMLElement | null): {
  top: number;
  bottom: number;
} {
  if (typeof window === 'undefined') return { top: 0, bottom: 0 };
  try {
    const scroller =
      (host?.closest?.('.prp-vlist') as HTMLElement | null) ||
      (host?.closest?.('.prp-diff-pane') as HTMLElement | null) ||
      null;
    if (scroller) {
      const r = scroller.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    }
  } catch {
    /* ignore */
  }
  return { top: 0, bottom: window.innerHeight || 0 };
}

/**
 * Full multi-line selection extent in viewport coords (all painted selected
 * rows). Falls back to the dock host when nothing selected is measured.
 */
function readSelectionExtentRect(
  host: HTMLElement | null,
  scroller: HTMLElement | null
): { top: number; bottom: number } {
  const hostRect =
    host && typeof host.getBoundingClientRect === 'function'
      ? host.getBoundingClientRect()
      : null;
  const fallback = {
    top: hostRect?.top ?? 0,
    bottom: hostRect?.bottom ?? 0,
  };
  try {
    const root = scroller || host?.ownerDocument || document;
    const nodes = root.querySelectorAll?.(
      '.prp-vline--selected, .prp-vline--header-selected, [data-file-selected="1"]'
    );
    if (!nodes || !nodes.length) return fallback;
    let top = Infinity;
    let bottom = -Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i] as HTMLElement;
      if (!el || typeof el.getBoundingClientRect !== 'function') continue;
      // Prefer rows inside the same scroller when known
      if (scroller && !scroller.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 || r.height > 0)) continue;
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
    }
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) return fallback;
    return { top, bottom };
  } catch {
    return fallback;
  }
}

/**
 * Selection floating UI — actions group or comment composer.
 * Mounted under the selection-end row (or file header) so it scrolls
 * with the virtual list and unmounts when that row leaves the window.
 * Flips above the host when the Diff scroller has too little room below.
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
    /**
     * True when viewer has a PENDING review (server id and/or pending rows).
     * Must gate even when pendingCount === 0 (empty PENDING).
     */
    hasViewerPendingReview = false,
    leaving = false,
    onUploadFile,
    linkCtx,
    mentionCandidates = [],
    virtualRows = null,
    detail = null,
    phase: phaseProp = null,
    onPhaseChange = null,
    onCopyFeedback = null,
  } = props;

  // Prefer store so App need not re-render on every caret move
  const storeSelection = useModalStore((s) => s.lineSelection);
  const showOptHints = useModalStore((s) => s.optHintsActive);
  const selection = selectionProp ?? storeSelection;

  const [phaseLocal, setPhaseLocal] = useState<SelectionIslandPhase>('actions');
  // Must be unconditional (before phase === 'actions' early return) — Rules of Hooks.
  const [selComposerFocused, setSelComposerFocused] = useState(false);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const [dockPlacement, setDockPlacement] = useState<'below' | 'above'>('below');

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

  // Flip comment/actions dock above the selection when Diff scroller bottom is tight.
  // Multi-line: room uses full selection extent + Opt hint strip; head-at-start
  // prefers above (outward from the block).
  useLayoutEffect(() => {
    if (!selection) {
      setDockPlacement('below');
      return undefined;
    }
    const measure = () => {
      const dock = dockRef.current;
      if (!dock || typeof dock.getBoundingClientRect !== 'function') return;
      const host =
        (dock.closest?.('.prp-sel-dock-host') as HTMLElement | null) ||
        (dock.parentElement as HTMLElement | null);
      if (!host) return;
      const hostRect = host.getBoundingClientRect();
      const dockRect = dock.getBoundingClientRect();
      const clip = readSelectionDockClip(host);
      const scroller =
        (host.closest?.('.prp-vlist') as HTMLElement | null) ||
        (host.closest?.('.prp-diff-pane') as HTMLElement | null) ||
        null;
      const extent = readSelectionExtentRect(host, scroller);
      const measured = Math.max(0, dockRect.height || 0);
      const gap = phase === 'comment' ? 8 : SELECTION_DOCK_GAP_EST;
      const need =
        typeof selectionDockSideNeed === 'function'
          ? selectionDockSideNeed({
              dockHeight: measured,
              phase,
              // Always reserve Opt hint strip for actions (appear with Opt-hold)
              includeOptHints: phase !== 'comment',
              gap: 0,
            })
          : measured + (phase === 'comment' ? 0 : 26);
      const headRole =
        typeof selectionHeadBlockRole === 'function'
          ? selectionHeadBlockRole(selection)
          : null;
      const next =
        typeof resolveSelectionDockVerticalPlacement === 'function'
          ? resolveSelectionDockVerticalPlacement({
              hostTop: hostRect.top,
              hostBottom: hostRect.bottom,
              selectionTop: extent.top,
              selectionBottom: extent.bottom,
              dockHeight: measured,
              clipTop: clip.top,
              clipBottom: clip.bottom,
              gap,
              minBelow: need,
              phase,
              includeOptHints: phase !== 'comment',
              headBlockRole: headRole,
            })
          : 'below';
      setDockPlacement((prev) => (prev === next ? prev : next));
    };
    measure();
    // Second pass after composer rows paint (comment phase) + Opt hints layout
    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => measure())
        : 0;
    const raf2 =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => requestAnimationFrame(() => measure()))
        : 0;
    const scroller =
      (dockRef.current?.closest?.('.prp-vlist') as HTMLElement | null) || null;
    const onReposition = () => measure();
    try {
      scroller?.addEventListener?.('scroll', onReposition, { passive: true });
      window.addEventListener('resize', onReposition);
    } catch {
      /* ignore */
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (raf2) cancelAnimationFrame(raf2);
      try {
        scroller?.removeEventListener?.('scroll', onReposition);
        window.removeEventListener('resize', onReposition);
      } catch {
        /* ignore */
      }
    };
  }, [
    selection,
    phase,
    draft,
    leaving,
    pendingCount,
    hasViewerPendingReview,
    showOptHints,
    selection?.headRowIndex,
    selection?.anchorRowIndex,
    selection?.filePath,
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
  const placeClass =
    dockPlacement === 'above' ? ' prp-selection-dock--above' : '';
  // Dock above → hints further up; dock below → hints further down
  const optHintPlace =
    typeof preferredOptHintPlacementForDock === 'function'
      ? preferredOptHintPlacementForDock(dockPlacement)
      : dockPlacement === 'above'
        ? 'top'
        : 'bottom';

  if (phase === 'actions') {
    const kbdComment = `${opt}C`;
    const kbdCopyCode = `${mod}C`;
    const kbdCopyUrl = `${mod}${opt}C`;
    return (
      <div
        ref={dockRef}
        className={`prp-selection-dock prp-selection-group${
          leaving ? ' prp-selection-group--out' : ' prp-selection-group--in'
        }${showOptHints ? ' prp-selection-group--opt-hints' : ''}${
          isFileTarget ? ' prp-selection-group--file' : ''
        }${placeClass}`}
        role="toolbar"
        aria-label={isFileTarget ? 'File selection actions' : 'Selection actions'}
        data-phase="actions"
        data-file-target={isFileTarget ? '1' : '0'}
        data-dock-place={dockPlacement}
        data-opt-hint-place={optHintPlace}
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
            preferredPlacement={optHintPlace}
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
            preferredPlacement={optHintPlace}
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
            preferredPlacement={optHintPlace}
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
            preferredPlacement={optHintPlace}
          />
          <IconX size={14} />
          <TipPopover title="Dismiss" shortcut="Esc" />
        </button>
      </div>
    );
  }

  // ── Comment composer (file or line) ──
  // OptBtnHint always mounts; paints on Opt-hold (store) — same as FinishReview
  // / thread reply. Focus after ⌥C also arms composer-context chords (⌥C/I/S).
  // GitHub: with a PENDING review, only attach (Add comment) — no single Comment.
  const kbdFocus = `${opt}I`;
  const kbdSubmit = `${opt}C · ${mod}↵`;
  const kbdStartPending = `${opt}S`;
  /** Esc from comment phase returns to action chips (App Escape layering). */
  const kbdCancel = 'Esc';
  const canImmediate = canPublishImmediateReviewComment({
    pendingCount,
    hasServerPending: Boolean(hasViewerPendingReview),
  });
  const pendingLabel = pendingAttachCtaLabel({
    pendingCount,
    hasServerPending: Boolean(hasViewerPendingReview),
  });
  const submitPrimary = canImmediate ? onSubmitImmediate : onSubmitPending;
  const hintsLive = Boolean(showOptHints || selComposerFocused);

  return (
    <div
      ref={dockRef}
      className={`prp-selection-dock prp-selection-island prp-selection-island--comment${
        leaving ? ' prp-selection-island--out' : ' prp-selection-island--in'
      }${isFileTarget ? ' prp-selection-island--file' : ''}${
        hintsLive ? ' prp-selection-island--opt-hints' : ''
      }${placeClass}`}
      data-phase="comment"
      data-subject={norm.subjectType || 'line'}
      data-prp-composer-root="1"
      data-prp-composer-kind="selection"
      data-prp-pending-only={canImmediate ? undefined : '1'}
      data-dock-place={dockPlacement}
      data-opt-hint-place={optHintPlace}
      data-opt-hints={hintsLive ? '1' : undefined}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="prp-opt-hint-host prp-selection-island__composer-field">
        <OptBtnHint label={kbdFocus} preferredPlacement={optHintPlace} />
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
          onSubmitRequest={submitPrimary}
          onComposerFocusChange={setSelComposerFocused}
        />
      </div>
      <div className="prp-composer__row">
        {canImmediate ? (
          <span className="prp-opt-hint-host inline-flex">
            <OptBtnHint label={kbdSubmit} preferredPlacement={optHintPlace} />
            <Button
              size="sm"
              variant="primary"
              loading={Boolean(actionBusy)}
              disabled={!canSubmit}
              onClick={onSubmitImmediate}
              data-prp-composer-submit="1"
              title={`Comment (${kbdSubmit})`}
              shortcut={kbdSubmit}
              tipPlacement={optHintPlace}
            >
              {actionBusy ? 'Submitting…' : 'Comment'}
            </Button>
          </span>
        ) : null}
        <span className="prp-opt-hint-host inline-flex">
          <OptBtnHint
            label={canImmediate ? kbdStartPending : kbdSubmit}
            preferredPlacement={optHintPlace}
          />
          <Button
            size="sm"
            variant={canImmediate ? 'default' : 'primary'}
            loading={Boolean(actionBusy)}
            disabled={!canSubmit}
            onClick={onSubmitPending}
            data-prp-composer-start-review="1"
            data-prp-composer-submit={canImmediate ? undefined : '1'}
            title={
              canImmediate
                ? `Start review (${kbdStartPending})`
                : `Add comment to pending review (${kbdSubmit})`
            }
            shortcut={canImmediate ? kbdStartPending : kbdSubmit}
            tipPlacement={optHintPlace}
          >
            {actionBusy ? 'Working…' : pendingLabel}
          </Button>
        </span>
        <span className="prp-opt-hint-host inline-flex">
          {/* Esc → action chips (App layering); second Esc on actions dismisses. */}
          <OptBtnHint label={kbdCancel} preferredPlacement={optHintPlace} />
          <Button
            size="sm"
            disabled={actionBusy}
            onClick={() => setPhase('actions')}
            data-prp-selection-back="1"
            data-prp-selection-cancel="1"
            title={`Cancel comment (${kbdCancel})`}
            shortcut={kbdCancel}
            tipPlacement={optHintPlace}
          >
            Cancel
          </Button>
        </span>
      </div>
    </div>
  );
}

export default SelectionCommentBar;
