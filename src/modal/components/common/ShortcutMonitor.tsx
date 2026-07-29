import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  type ShortcutMonitorFire,
  SHORTCUT_MONITOR_DISMISS_MS,
  formatOptHeldLabel,
  isOptAloneHeld,
  isShortcutMonitorFireActive,
} from '@lib/shortcut-monitor';
import {
  getShortcutMonitorFire,
  subscribeShortcutMonitorFire,
  clearShortcutMonitorFire,
} from '@lib/shortcut-monitor-bus';

const FADE_MS = 200;

/**
 * Bottom-center floating HUD (single line).
 * Fade-in on show, fade-out before unmount.
 */
export function ShortcutMonitor({
  enabled = true,
  /** none | small (1×) | medium (2×) | large (3×) — none also via enabled=false */
  size = 'small',
  isMac = true,
  dismissMs = SHORTCUT_MONITOR_DISMISS_MS,
}: {
  enabled?: boolean;
  size?: 'none' | 'small' | 'medium' | 'large' | string;
  isMac?: boolean;
  dismissMs?: number;
}) {
  const sizeClass = (() => {
    const v = String(size || 'small')
      .trim()
      .toLowerCase();
    if (v === 'medium' || v === 'md' || v === '2x') return 'medium';
    if (v === 'large' || v === 'lg' || v === '3x') return 'large';
    return 'small';
  })();
  const [fire, setFire] = useState<ShortcutMonitorFire | null>(() =>
    getShortcutMonitorFire()
  );
  const [optAloneHeld, setOptAloneHeld] = useState(false);
  /** Keep last visible text/mode while fading out */
  const [display, setDisplay] = useState<{
    text: string;
    mode: 'fire' | 'held';
  } | null>(null);
  const [phase, setPhase] = useState<'hidden' | 'in' | 'out'>('hidden');
  const dismissTimerRef = useRef(0);
  const fadeTimerRef = useRef(0);
  const aloneRef = useRef(false);
  const lineRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    if (!enabled) {
      setFire(null);
      setOptAloneHeld(false);
      aloneRef.current = false;
      return undefined;
    }
    return subscribeShortcutMonitorFire(() => {
      setFire(getShortcutMonitorFire());
    });
  }, [enabled]);

  useEffect(() => {
    if (dismissTimerRef.current) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = 0;
    }
    if (!enabled || !fire) return undefined;
    const at = Number(fire.at) || Date.now();
    const remaining = Math.max(0, dismissMs - (Date.now() - at));
    dismissTimerRef.current = window.setTimeout(() => {
      dismissTimerRef.current = 0;
      if (getShortcutMonitorFire()?.at === fire.at) {
        clearShortcutMonitorFire();
      }
      setFire((prev) => (prev && prev.at === fire.at ? null : prev));
    }, remaining + 16);
    return () => {
      if (dismissTimerRef.current) {
        window.clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = 0;
      }
    };
  }, [enabled, fire, fire?.at, dismissMs]);

  useEffect(() => {
    if (!enabled) {
      aloneRef.current = false;
      setOptAloneHeld(false);
      return undefined;
    }
    const sync = (e: KeyboardEvent) => {
      const next =
        typeof isOptAloneHeld === 'function'
          ? isOptAloneHeld({
              alt: Boolean(e.altKey),
              shift: Boolean(e.shiftKey),
              mod: Boolean(e.metaKey || e.ctrlKey),
              meta: Boolean(e.metaKey),
              ctrl: Boolean(e.ctrlKey),
            })
          : Boolean(e.altKey) && !e.shiftKey && !e.metaKey && !e.ctrlKey;
      if (next === aloneRef.current) return;
      aloneRef.current = next;
      setOptAloneHeld(next);
    };
    const clear = () => {
      if (!aloneRef.current) return;
      aloneRef.current = false;
      setOptAloneHeld(false);
    };
    window.addEventListener('keydown', sync, true);
    window.addEventListener('keyup', sync, true);
    window.addEventListener('blur', clear);
    const onVis = () => {
      if (document.hidden) clear();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('keydown', sync, true);
      window.removeEventListener('keyup', sync, true);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled]);

  const fireStill =
    Boolean(fire) && isShortcutMonitorFireActive(fire, Date.now(), dismissMs);
  const liveText =
    fireStill && fire
      ? fire.text
      : optAloneHeld
        ? formatOptHeldLabel(isMac)
        : '';
  const liveMode: 'fire' | 'held' | 'hidden' =
    fireStill && fire ? 'fire' : optAloneHeld ? 'held' : 'hidden';

  // Drive phase: show / update / fade-out
  useEffect(() => {
    if (fadeTimerRef.current) {
      window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = 0;
    }
    if (!enabled) {
      setPhase('hidden');
      setDisplay(null);
      return undefined;
    }
    if (liveMode !== 'hidden' && liveText) {
      setDisplay({ text: liveText, mode: liveMode });
      // Force reflow path: out → in when re-firing
      setPhase((p) => (p === 'in' ? 'in' : 'in'));
      // Double-rAF ensures --in transition runs after mount from hidden/out
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase('in'));
      });
      return undefined;
    }
    // Become hidden: fade out if currently visible
    if (phaseRef.current === 'in' || phaseRef.current === 'out') {
      setPhase('out');
      fadeTimerRef.current = window.setTimeout(() => {
        fadeTimerRef.current = 0;
        setPhase('hidden');
        setDisplay(null);
      }, FADE_MS);
      return () => {
        if (fadeTimerRef.current) {
          window.clearTimeout(fadeTimerRef.current);
          fadeTimerRef.current = 0;
        }
      };
    }
    setPhase('hidden');
    setDisplay(null);
    return undefined;
  }, [enabled, liveMode, liveText]);

  useLayoutEffect(() => {
    const el = lineRef.current;
    if (el && display?.text) el.textContent = display.text;
  }, [display?.text]);

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
    };
  }, []);

  if (!enabled || phase === 'hidden' || !display) return null;

  return (
    <div
      className={`prp-shortcut-monitor prp-shortcut-monitor--size-${sizeClass} prp-shortcut-monitor--${display.mode} prp-shortcut-monitor--${phase}`}
      role="status"
      aria-live="polite"
      data-mode={display.mode}
      data-phase={phase}
      data-size={sizeClass}
    >
      <div ref={lineRef} className="prp-shortcut-monitor__line">
        {display.text}
      </div>
    </div>
  );
}

export default React.memo(ShortcutMonitor);
