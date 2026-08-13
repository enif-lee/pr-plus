import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@common/Button';
import { MarkdownComposer } from '@common/MarkdownComposer';
import { ShortcutHint } from '@common/ShortcutHint';
import { canSubmitReviewVerdict } from '@lib/pr-edit-api';
import { useT } from '@lib/locale-context';
import './FinishReview.css';

export type FinishReviewEvent = 'comment' | 'approve' | 'request_changes';

export type FinishReviewModalProps = {
  open: boolean;
  /** Anchor element (Submit review button) for popover placement. */
  anchorRef?: React.RefObject<HTMLElement | null> | null;
  pendingCount?: number;
  detail?: { author?: unknown; viewerLogin?: unknown } | null;
  actionBusy?: boolean;
  /** Match modal shell theme when portaled to body. */
  colorMode?: 'light' | 'dark' | string | null;
  /** Kept for API compat (shortcuts may preselect); unused for button layout. */
  initialEvent?: FinishReviewEvent;
  onClose?: () => void;
  /** Submit selected event + optional body. */
  onSubmit?: (kind: FinishReviewEvent, body: string) => void | Promise<void>;
  /** Discard pending review (only shown when pendingCount > 0). */
  onDiscard?: (() => void | Promise<void>) | null;
  /** Attachment upload (same as Conversation / selection composers). */
  onUploadFile?: ((meta: any) => Promise<string | null>) | null;
  mentionCandidates?: string[];
  linkCtx?: { owner?: string; repo?: string; magicLinks?: any[] } | null;
};

/** Default width; CSS uses 1.5× prior 360px popover. */
const PANEL_WIDTH_FALLBACK = 540;

/**
 * Finish-your-review popover: shared MarkdownComposer (Write/Preview) +
 * bottom action buttons with contextual Opt shortcuts (same as leave-review).
 *
 *   Esc (input focused) → blur input only
 *   Esc (form focused)  → Cancel / close finish form (not PR shell)
 *   ⌥I                  → focus comment input
 *   ⌥↵                  → Comment
 *   ⌥⇧↵                 → Approve
 *   ⌥⇧X                 → Request changes
 *
 * Opt-held shows ShortcutHint badges on CTAs (class `prp-opt-btn-hint--finish`
 * so background page hints stay suppressed while this dialog is open).
 */
export function FinishReviewModal({
  open,
  anchorRef = null,
  pendingCount = 0,
  detail = null,
  actionBusy = false,
  colorMode = null,
  onClose,
  onSubmit,
  onDiscard = null,
  onUploadFile = null,
  mentionCandidates = [],
  linkCtx = null,
}: FinishReviewModalProps) {
  const t = useT();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [body, setBody] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const bodyRef = useRef(body);
  const actionBusyRef = useRef(actionBusy);
  const onCloseRef = useRef(onClose);
  const onSubmitRef = useRef(onSubmit);
  bodyRef.current = body;
  actionBusyRef.current = actionBusy;
  onCloseRef.current = onClose;
  onSubmitRef.current = onSubmit;

  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.platform || '');
  const scComment = isMac ? '⌥↵' : 'Alt+Enter';
  const scApprove = isMac ? '⌥⇧↵' : 'Alt+Shift+Enter';
  const scChanges = isMac ? '⌥⇧X' : 'Alt+Shift+X';
  const scEsc = 'Esc';
  const scFocusInput = isMac ? '⌥I' : 'Alt+I';

  const showVerdict =
    typeof canSubmitReviewVerdict === 'function'
      ? canSubmitReviewVerdict(detail)
      : true;
  const showVerdictRef = useRef(showVerdict);
  showVerdictRef.current = showVerdict;

  // Reset form when opened
  useEffect(() => {
    if (!open) return;
    setBody('');
  }, [open]);

  // Position under anchor (or top-right fallback)
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    function place() {
      const el = anchorRef?.current;
      const panel = panelRef.current;
      const panelW = panel?.offsetWidth || PANEL_WIDTH_FALLBACK;
      const margin = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (el) {
        const r = el.getBoundingClientRect();
        let left = r.right - panelW;
        if (left < margin) left = margin;
        if (left + panelW > vw - margin) left = Math.max(margin, vw - panelW - margin);
        let top = r.bottom + 6;
        const panelH = panel?.offsetHeight || 320;
        if (top + panelH > vh - margin && r.top - panelH - 6 > margin) {
          top = r.top - panelH - 6;
        }
        setPos({ top, left });
        return;
      }
      setPos({ top: 72, left: Math.max(margin, vw - panelW - 24) });
    }
    place();
    const t = window.setTimeout(place, 0);
    // Reposition when composer expands (Write/Preview, content)
    const ro =
      typeof ResizeObserver !== 'undefined' && panelRef.current
        ? new ResizeObserver(() => place())
        : null;
    if (ro && panelRef.current) ro.observe(panelRef.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.clearTimeout(t);
      ro?.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchorRef]);

  // Contextual shortcuts while open (capture; stopImmediate so App shell Esc
  // never wins). Esc layering: blur finish input → close form only.
  useEffect(() => {
    if (!open) return undefined;

    const stop = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    function isFinishInputFocused(): boolean {
      const panel = panelRef.current;
      const ae =
        typeof document !== 'undefined'
          ? (document.activeElement as HTMLElement | null)
          : null;
      if (!panel || !ae) return false;
      if (!panel.contains(ae)) return false;
      if (ae.isContentEditable) return true;
      const tag = String(ae.tagName || '').toUpperCase();
      return tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT';
    }

    function focusFinishInput(): boolean {
      const panel = panelRef.current;
      if (!panel) return false;
      const ta =
        (panel.querySelector(
          'textarea.prp-mdc__ta, textarea[data-prp-composer-input], [data-prp-composer-input]'
        ) as HTMLTextAreaElement | null) ||
        (panel.querySelector('textarea') as HTMLTextAreaElement | null);
      if (!ta || ta.disabled) return false;
      try {
        ta.focus({ preventScroll: true } as FocusOptions);
      } catch {
        try {
          ta.focus();
        } catch {
          return false;
        }
      }
      try {
        const len = String(ta.value || '').length;
        ta.setSelectionRange?.(len, len);
      } catch {
        /* ignore */
      }
      return true;
    }

    async function submit(kind: FinishReviewEvent) {
      if (actionBusyRef.current) return;
      const text = String(bodyRef.current || '').trim();
      const pendingN = Number(
        panelRef.current?.getAttribute('data-pending-count') || 0
      );
      // No pending threads and empty body → nothing to submit
      if (!text && pendingN === 0) return;
      if (kind === 'approve' || kind === 'request_changes') {
        if (!showVerdictRef.current) return;
      }
      await onSubmitRef.current?.(kind, bodyRef.current);
    }

    const onKey = (e: KeyboardEvent) => {
      // Esc → blur finish input first; then close form (never PR shell here)
      if (e.key === 'Escape') {
        stop(e);
        if (actionBusyRef.current) return;
        if (isFinishInputFocused()) {
          try {
            (document.activeElement as HTMLElement | null)?.blur?.();
          } catch {
            /* ignore */
          }
          return;
        }
        onCloseRef.current?.();
        return;
      }

      // Leave-review Opt chords (same as PR_MODAL_OPT_ACTIONS)
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      const code = String(e.code || '');
      const shift = Boolean(e.shiftKey);
      const keyLower = String(e.key || '').toLowerCase();

      // ⌥I → focus comment input (physical KeyI; macOS may emit dead-key glyphs)
      if (
        !shift &&
        (code === 'KeyI' || keyLower === 'i' || keyLower === 'ˆ')
      ) {
        stop(e);
        focusFinishInput();
        return;
      }

      // ⌥↵ → Comment
      if (
        !shift &&
        (code === 'Enter' || code === 'NumpadEnter' || e.key === 'Enter')
      ) {
        stop(e);
        void submit('comment');
        return;
      }
      // ⌥⇧↵ → Approve
      if (
        shift &&
        (code === 'Enter' || code === 'NumpadEnter' || e.key === 'Enter')
      ) {
        stop(e);
        void submit('approve');
        return;
      }
      // ⌥⇧X → Request changes
      if (shift && (code === 'KeyX' || keyLower === 'x')) {
        stop(e);
        void submit('request_changes');
      }
    };

    const onPointer = (e: MouseEvent) => {
      const panel = panelRef.current;
      const anchor = anchorRef?.current;
      const t = e.target as Node | null;
      if (!t) return;
      if (panel?.contains(t) || anchor?.contains(t)) return;
      if (!actionBusyRef.current) onCloseRef.current?.();
    };

    // Capture phase + high priority: intercept before App leaveReview can submit.
    window.addEventListener('keydown', onKey, true);
    // Capture outside click after open (avoid closing on the open click)
    const clickT = window.setTimeout(() => {
      window.addEventListener('mousedown', onPointer, true);
    }, 0);
    return () => {
      window.clearTimeout(clickT);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onPointer, true);
    };
  }, [open, anchorRef]);

  if (!open) return null;

  const mode =
    String(colorMode || '').toLowerCase() === 'dark' ? 'dark' : 'light';
  const themeCls = mode === 'dark' ? ' prp-theme-dark' : ' prp-theme-light';
  const pending = Number(pendingCount) || 0;
  const bodyTrim = String(body || '').trim();
  /** Need body or pending line comments before any leave-review submit. */
  const canSubmit = Boolean(bodyTrim || pending > 0);
  const submitBlockedTitle =
    'Write a comment or add pending review comments before submitting';

  async function handleSubmit(kind: FinishReviewEvent) {
    if (actionBusy || !canSubmit) return;
    if (kind === 'approve' || kind === 'request_changes') {
      if (!showVerdict) return;
    }
    await onSubmit?.(kind, body);
  }

  const sub =
    pending > 0
      ? `Submit your ${pending} pending comment${
          pending === 1 ? '' : 's'
        } and other feedback. Summary comment is optional.`
      : 'Write a comment to submit a review (required when there are no pending comments).';

  const layer = (
    <div
      className={`prp-finish-review-layer${themeCls}`}
      role="presentation"
      data-prp-finish-review="1"
      data-prp-color-mode={mode}
    >
      <div
        ref={panelRef}
        className="prp-finish-review"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-desc`}
        data-pending-count={pending}
        style={
          pos
            ? { top: pos.top, left: pos.left, visibility: 'visible' }
            : { top: 0, left: 0, visibility: 'hidden' }
        }
      >
        <header className="prp-finish-review__head">
          <h2 id={titleId} className="prp-finish-review__title">
            {t('cta_finish_review_title')}
          </h2>
          <p id={`${titleId}-desc`} className="prp-finish-review__sub">
            {sub}
          </p>
        </header>

        <div
          className="prp-finish-review__composer prp-opt-hint-host"
          data-prp-finish-composer="1"
        >
          <ShortcutHint
            label={scFocusInput}
            preferredPlacement="top"
            className="prp-opt-btn-hint--finish"
          />
          <MarkdownComposer
            value={body}
            onChange={setBody}
            placeholder={t('cta_write_comment')}
            forceOpen
            compact={false}
            rows={4}
            disabled={actionBusy}
            showTabs
            onUploadFile={onUploadFile || undefined}
            linkCtx={linkCtx || undefined}
            mentionCandidates={mentionCandidates}
          />
        </div>

        <footer className="prp-finish-review__actions">
          <div className="prp-finish-review__actions-start">
            {pending > 0 && typeof onDiscard === 'function' ? (
              <Button
                size="sm"
                variant="danger"
                disabled={actionBusy}
                onClick={(): any => void onDiscard?.()}
                title={t('cta_discard_pending')}
                tipPlacement="top"
              >
                {t('cta_discard')}
              </Button>
            ) : null}
            <span className="prp-opt-hint-host" data-prp-finish-cancel="1">
              <ShortcutHint
                label={scEsc}
                preferredPlacement="top"
                className="prp-opt-btn-hint--finish"
              />
              <Button
                size="sm"
                variant="default"
                disabled={actionBusy}
                onClick={() => onClose?.()}
                title={t('cta_cancel')}
                shortcut={scEsc}
                tipPlacement="top"
              >
                {t('cta_cancel')}
              </Button>
            </span>
          </div>
          <div
            className="prp-finish-review__actions-end"
            role="group"
            aria-label={t('cta_submit_review')}
          >
            <span className="prp-opt-hint-host">
              <ShortcutHint
                label={scComment}
                preferredPlacement="top"
                className="prp-opt-btn-hint--finish"
              />
              <Button
                size="sm"
                variant="primary"
                loading={Boolean(actionBusy)}
                disabled={!canSubmit}
                onClick={(): any => void handleSubmit('comment')}
                title={canSubmit ? t('cta_submit_review_comment') : submitBlockedTitle}
                shortcut={scComment}
                tipPlacement="top"
              >
                {actionBusy ? t('cta_submitting') : t('cta_comment_verb')}
              </Button>
            </span>
            {showVerdict ? (
              <span className="prp-opt-hint-host">
                <ShortcutHint
                  label={scApprove}
                  preferredPlacement="top"
                  className="prp-opt-btn-hint--finish"
                />
                <Button
                  size="sm"
                  variant="ok"
                  loading={Boolean(actionBusy)}
                  disabled={!canSubmit}
                  onClick={(): any => void handleSubmit('approve')}
                  title={canSubmit ? t('cta_approve_pr') : submitBlockedTitle}
                  shortcut={scApprove}
                  tipPlacement="top"
                >
                  {actionBusy ? t('cta_working') : t('cta_approve')}
                </Button>
              </span>
            ) : null}
            {showVerdict ? (
              <span className="prp-opt-hint-host">
                <ShortcutHint
                  label={scChanges}
                  preferredPlacement="top"
                  className="prp-opt-btn-hint--finish"
                />
                <Button
                  size="sm"
                  variant="warn"
                  loading={Boolean(actionBusy)}
                  disabled={!canSubmit}
                  onClick={(): any => void handleSubmit('request_changes')}
                  title={
                    canSubmit ? t('cta_request_changes') : submitBlockedTitle
                  }
                  shortcut={scChanges}
                  tipPlacement="top"
                >
                  {actionBusy ? t('cta_working') : t('cta_request_changes')}
                </Button>
              </span>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  );

  // Prefer .prp-overlay (same stacking context as the shell). When forced to
  // body, CSS z-index must beat #prp-page-embed (100000) — see ConfirmDialog.
  if (typeof document === 'undefined') return layer;
  const portalRoot =
    (document.querySelector('.prp-overlay') as HTMLElement | null) ||
    document.body;
  return portalRoot ? createPortal(layer, portalRoot) : layer;
}

export default FinishReviewModal;
