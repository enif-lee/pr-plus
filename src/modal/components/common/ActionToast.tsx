import React, { useEffect, useRef, useState } from 'react';
import { useModalStore } from '../../store/modal-store';
import { copyTextToClipboard } from '../../lib/copy-to-clipboard';
import { useT } from '../../lib/locale-context';
import { IconCheck, IconCopy } from './icons';
import './ActionToast.css';

export type ActionToastTone = 'ok' | 'error' | 'neutral';

/**
 * Infer pill tone from result copy (success / error / neutral).
 * Pure — exported for tests.
 */
export function actionToastTone(message: string): ActionToastTone {
  const m = String(message || '');
  if (!m.trim()) return 'neutral';
  // GitHub API errors often include the word "requested" ("cannot be requested")
  // which used to match the success regex. Status prefixes always win.
  if (
    /github api\s+\d{3}|\bunprocessable\b|\b422\b|\b4\d\d\b|\b5\d\d\b|fail|error|could not|cannot|can not|can't|may not|may only|must not|not allowed|not a collaborator|required|unavailable|denied|rejected|invalid/i.test(
      m
    )
  ) {
    return 'error';
  }
  if (
    /copied|posted|updated|added|started|discarded|applied|changed|requested review from|removed|unassigned|saved|closed|reopened|merged|success|done/i.test(
      m
    )
  ) {
    return 'ok';
  }
  return 'neutral';
}

/**
 * Top-center pill toast for short action results ("Code copied", errors, …).
 * Parent should be a positioned container (modal shell).
 */
export function ActionToast({
  message,
  onDismiss,
  durationMs = 2400,
}: {
  message?: string | null;
  /** Called after exit animation (or immediately when cleared). */
  onDismiss?: () => void;
  durationMs?: number;
}) {
  const storeMsg = useModalStore((s) => s.actionMsg);
  const text = String((message == null || message === '' ? storeMsg : message) || '').trim();
  const t = useT();
  const [shown, setShown] = useState('');
  const [phase, setPhase] = useState<'hidden' | 'in' | 'out'>('hidden');
  const [copied, setCopied] = useState(false);
  const leaveTimer = useRef(0);
  const hideTimer = useRef(0);
  const tokenRef = useRef(0);
  const hoverRef = useRef(false);
  const shownRef = useRef('');
  shownRef.current = shown;

  useEffect(() => {
    return () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  function clearLeaveTimers() {
    if (leaveTimer.current) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = 0;
    }
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = 0;
    }
  }

  function scheduleLeave(token: number, holdMs: number) {
    clearLeaveTimers();
    leaveTimer.current = window.setTimeout(() => {
      if (token !== tokenRef.current) return;
      if (hoverRef.current) return;
      setPhase('out');
      hideTimer.current = window.setTimeout(() => {
        if (token !== tokenRef.current) return;
        setShown('');
        setCopied(false);
        setPhase('hidden');
        onDismiss?.();
      }, 180);
    }, holdMs);
  }

  function holdMsFor(message: string) {
    const base = Math.max(1200, Number(durationMs) || 2400);
    return actionToastTone(message) === 'error' ? Math.max(4800, base) : base;
  }

  useEffect(() => {
    clearLeaveTimers();

    if (!text) {
      if (phase === 'in' || shown) {
        setPhase('out');
        hideTimer.current = window.setTimeout(() => {
          setShown('');
          setCopied(false);
          setPhase('hidden');
          onDismiss?.();
        }, 180);
      }
      return;
    }

    const token = ++tokenRef.current;
    setShown(text);
    setCopied(false);
    setPhase('in');
    scheduleLeave(token, holdMsFor(text));
  }, [text, durationMs]); // eslint-disable-line react-hooks/exhaustive-deps -- onDismiss via parent clear

  if (phase === 'hidden' || !shown) return null;

  const tone = actionToastTone(shown);
  const showCopy = tone === 'error';

  async function onCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const value = shownRef.current;
    if (!value) return;
    const ok = await copyTextToClipboard(value);
    setCopied(ok);
    try {
      const root = document.documentElement;
      root.setAttribute('data-prp-last-copied-action-msg', value);
      root.setAttribute('data-prp-last-copy-action-msg-ok', ok ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={`prp-action-toast prp-action-toast--${tone} prp-action-toast--${phase}${
        showCopy ? ' prp-action-toast--copyable' : ''
      }`}
      role="status"
      aria-live="polite"
      data-tone={tone}
      onMouseEnter={() => {
        hoverRef.current = true;
        clearLeaveTimers();
      }}
      onMouseLeave={() => {
        hoverRef.current = false;
        scheduleLeave(tokenRef.current, 1600);
      }}
    >
      <span className="prp-action-toast__text">{shown}</span>
      {showCopy ? (
        <button
          type="button"
          className="prp-action-toast__copy"
          aria-label={copied ? t('toast_text_copied') : t('toast_copy_error')}
          title={copied ? t('toast_text_copied') : t('toast_copy_error')}
          data-prp-action-toast-copy="1"
          onClick={onCopy}
        >
          {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
        </button>
      ) : null}
    </div>
  );
}

export default ActionToast;
