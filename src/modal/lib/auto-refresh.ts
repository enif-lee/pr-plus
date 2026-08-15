/**
 * Auto-refresh gate for open PR surfaces (modal overlay + full-page embed).
 * Poll only when the tab is visible and the user was active recently.
 */

export const AUTO_REFRESH_IDLE_MS = 10 * 60 * 1000;
export const AUTO_REFRESH_POLL_MS = 45 * 1000;
/** Throttle how often pointer/scroll bumps lastActionAt */
export const AUTO_REFRESH_ACTION_THROTTLE_MS = 1000;

export type AutoRefreshGateInput = {
  /** pr+ surface is showing a PR (modal, sheet, or embed) */
  surfaceOpen: boolean;
  hostEnabled?: boolean;
  owner?: string | null;
  repo?: string | null;
  number?: number | string | null;
  /** document.visibilityState */
  visibilityState?: string | null;
  /** epoch ms of last user action */
  lastActionAt?: number | null;
  /** epoch ms "now" (injectable for tests) */
  now?: number;
  /** skip while a load/refresh is already busy */
  loadBusy?: boolean;
  /** idle window; default 10 min */
  idleMs?: number;
};

/**
 * Whether a background auto-refresh tick is allowed.
 */
export function canAutoRefresh(input: AutoRefreshGateInput): boolean {
  if (input.hostEnabled === false) return false;
  if (!input.surfaceOpen) return false;
  const owner = String(input.owner || '').trim();
  const repo = String(input.repo || '').trim();
  const n = Number(input.number);
  if (!owner || !repo || !Number.isFinite(n) || n <= 0) return false;
  const vis = String(input.visibilityState || 'visible');
  if (vis !== 'visible') return false;
  if (input.loadBusy) return false;
  const now = Number.isFinite(input.now as number)
    ? Number(input.now)
    : Date.now();
  const last = Number(input.lastActionAt);
  if (!Number.isFinite(last)) return false;
  const idleMs =
    Number.isFinite(input.idleMs as number) && Number(input.idleMs) > 0
      ? Number(input.idleMs)
      : AUTO_REFRESH_IDLE_MS;
  if (now - last > idleMs) return false;
  return true;
}

/**
 * Throttled activity timestamp update.
 * @returns next lastActionAt (may be unchanged when throttled)
 */
export function nextActionAt(
  prevLastActionAt: number,
  now: number,
  opts: { force?: boolean; throttleMs?: number } = {}
): number {
  const throttle =
    Number.isFinite(opts.throttleMs as number) && Number(opts.throttleMs) >= 0
      ? Number(opts.throttleMs)
      : AUTO_REFRESH_ACTION_THROTTLE_MS;
  if (opts.force) return now;
  if (now - prevLastActionAt < throttle) return prevLastActionAt;
  return now;
}

/**
 * Whether a probe snapshot indicates the open detail is stale (head only).
 */
export function headProbeIndicatesStale(
  baselineHeadSha: string | null | undefined,
  probeHeadSha: string | null | undefined
): boolean {
  const a = String(baselineHeadSha || '').trim().toLowerCase();
  const b = String(probeHeadSha || '').trim().toLowerCase();
  if (!a || !b) return false;
  return a !== b;
}

/**
 * Whether a head probe indicates lifecycle or head drift vs open detail.
 * Compares headSha, draft, and state so draft↔ready / close / merge without
 * a new commit still trigger soft-refresh.
 *
 * @param baseline open detail (or partial { headSha, draft, state })
 * @param probe fetchPrHeadProbe result
 */
export function prProbeIndicatesStale(
  baseline: {
    headSha?: string | null;
    draft?: boolean | null;
    state?: string | null;
  } | null | undefined,
  probe: {
    headSha?: string | null;
    draft?: boolean | null;
    state?: string | null;
    updatedAt?: string | null;
  } | null | undefined
): boolean {
  if (!probe || typeof probe !== 'object') return false;
  const base = baseline && typeof baseline === 'object' ? baseline : {};
  const baseSha = String(base.headSha || '').trim().toLowerCase();
  const probeSha = String(probe.headSha || '').trim().toLowerCase();
  if (baseSha && probeSha && baseSha !== probeSha) return true;
  // Empty baseline SHA: any non-empty probe head is enough to revalidate once
  if (!baseSha && probeSha) return true;

  if (typeof probe.draft === 'boolean' && typeof base.draft === 'boolean') {
    if (Boolean(probe.draft) !== Boolean(base.draft)) return true;
  }

  const baseState = String(base.state || '')
    .trim()
    .toLowerCase();
  const probeState = String(probe.state || '')
    .trim()
    .toLowerCase();
  if (baseState && probeState && baseState !== probeState) return true;
  // Probe closed/merged while baseline still open
  if (
    baseState === 'open' &&
    (probeState === 'closed' || probeState === 'merged')
  ) {
    return true;
  }

  return false;
}
