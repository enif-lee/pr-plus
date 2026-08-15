/** @module modal/lib/shortcut-monitor-bus */
/**
 * Tiny pub/sub for shortcut-monitor fire payloads so the HUD can re-render
 * without setState on PrModalApp (avoids full modal tree cost on every chord).
 */

import type { ShortcutMonitorFire } from './shortcut-monitor';

type Listener = () => void;

let currentFire: ShortcutMonitorFire | null = null;
const listeners = new Set<Listener>();

export function getShortcutMonitorFire(): ShortcutMonitorFire | null {
  return currentFire;
}

export function publishShortcutMonitorFire(
  fire: ShortcutMonitorFire | null
): void {
  currentFire = fire;
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore subscriber errors */
    }
  });
}

export function clearShortcutMonitorFire(): void {
  if (currentFire == null) return;
  currentFire = null;
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeShortcutMonitorFire(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
