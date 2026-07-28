import React, { useEffect, useRef, useState } from 'react';
import './ActionToast.css';

export type ActionToastTone = 'ok' | 'error' | 'neutral';

/**
 * Infer pill tone from result copy (success / error / neutral).
 * Pure — exported for tests.
 */
export function actionToastTone(message: string): ActionToastTone {
  const m = String(message || '');
  if (!m.trim()) return 'neutral';
  if (
    /fail|error|could not|cannot|can't|required|unavailable|denied|rejected|invalid/i.test(
      m
    )
  ) {
    return 'error';
  }
  if (
    /copied|posted|updated|added|started|discarded|applied|changed|requested|removed|unassigned|saved|closed|reopened|merged|success|done/i.test(
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
  const text = String(message || '').trim();
  const [shown, setShown] = useState('');
  const [phase, setPhase] = useState<'hidden' | 'in' | 'out'>('hidden');
  const leaveTimer = useRef(0);
  const hideTimer = useRef(0);
  const tokenRef = useRef(0);

  useEffect(() => {
    return () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    if (leaveTimer.current) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = 0;
    }
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = 0;
    }

    if (!text) {
      // External clear — animate out if something is visible
      if (phase === 'in' || shown) {
        setPhase('out');
        hideTimer.current = window.setTimeout(() => {
          setShown('');
          setPhase('hidden');
          onDismiss?.();
        }, 180);
      }
      return;
    }

    const token = ++tokenRef.current;
    setShown(text);
    setPhase('in');

    const hold = Math.max(1200, Number(durationMs) || 2400);
    leaveTimer.current = window.setTimeout(() => {
      if (token !== tokenRef.current) return;
      setPhase('out');
      hideTimer.current = window.setTimeout(() => {
        if (token !== tokenRef.current) return;
        setShown('');
        setPhase('hidden');
        onDismiss?.();
      }, 180);
    }, hold);
  }, [text, durationMs]); // eslint-disable-line react-hooks/exhaustive-deps -- onDismiss stable enough via parent clear

  if (phase === 'hidden' || !shown) return null;

  const tone = actionToastTone(shown);

  return (
    <div
      className={`prp-action-toast prp-action-toast--${tone} prp-action-toast--${phase}`}
      role="status"
      aria-live="polite"
      data-tone={tone}
    >
      <span className="prp-action-toast__text">{shown}</span>
    </div>
  );
}

export default ActionToast;
