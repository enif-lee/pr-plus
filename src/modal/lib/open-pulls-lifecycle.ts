/**
 * Pure open-PR list lifecycle helpers.
 * Host / list bootstrap call these so merge·draft·close·refresh stay consistent.
 */

export type OpenPullLike = {
  number?: number | string;
  draft?: boolean;
  state?: string;
  merged?: boolean;
  title?: string;
  [k: string]: unknown;
};

export type LifecycleListPatch = {
  draft?: boolean;
  state?: string;
  merged?: boolean;
  title?: string;
  [k: string]: unknown;
};

/**
 * Default max age for host open-list SWR (ms).
 * Force always bypasses.
 */
export const OPEN_PULLS_DEFAULT_MAX_AGE_MS = 30_000;

/**
 * Whether ensureOpenPullsForStack may skip network.
 * force → always refetch; missing/expired fetchedAt → refetch.
 */
export function shouldRefetchOpenPulls(opts: {
  force?: boolean;
  fetchedAt?: number | null;
  maxAgeMs?: number;
  now?: number;
} = {}): boolean {
  if (opts.force) return true;
  const now = Number.isFinite(opts.now as number)
    ? Number(opts.now)
    : Date.now();
  const fetchedAt = Number(opts.fetchedAt);
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return true;
  const maxAge =
    Number.isFinite(opts.maxAgeMs as number) && Number(opts.maxAgeMs) >= 0
      ? Number(opts.maxAgeMs)
      : OPEN_PULLS_DEFAULT_MAX_AGE_MS;
  return now - fetchedAt > maxAge;
}

/**
 * Patch a single PR row in an open-list array by number (immutable).
 */
export function patchPrInOpenList(
  prs: OpenPullLike[] | null | undefined,
  number: number | string,
  patch: LifecycleListPatch | null | undefined
): OpenPullLike[] {
  const list = Array.isArray(prs) ? prs : [];
  const n = Number(number);
  if (!Number.isFinite(n) || n <= 0 || !patch || typeof patch !== 'object') {
    return list.slice();
  }
  let hit = false;
  const out = list.map((p) => {
    if (!p || Number(p.number) !== n) return p;
    hit = true;
    return { ...p, ...patch, number: n };
  });
  return hit ? out : list.slice();
}

/**
 * Remove a PR number from the open list (merge/close). Immutable.
 */
export function removePrFromOpenList(
  prs: OpenPullLike[] | null | undefined,
  number: number | string
): OpenPullLike[] {
  const list = Array.isArray(prs) ? prs : [];
  const n = Number(number);
  if (!Number.isFinite(n) || n <= 0) return list.slice();
  return list.filter((p) => !p || Number(p.number) !== n);
}

/**
 * Apply lifecycle outcome to an open-PR list snapshot.
 * - merged or closed → remove from open list
 * - draft/state open fields → patch in place
 * Returns { prs, removed } so callers can rebuild forest / redecorate.
 */
export function applyLifecycleToOpenPulls(
  prs: OpenPullLike[] | null | undefined,
  number: number | string,
  patch: LifecycleListPatch | null | undefined
): { prs: OpenPullLike[]; removed: boolean; patched: boolean } {
  const list = Array.isArray(prs) ? prs : [];
  const n = Number(number);
  if (!Number.isFinite(n) || n <= 0) {
    return { prs: list.slice(), removed: false, patched: false };
  }
  const p = patch && typeof patch === 'object' ? patch : {};
  const merged = p.merged === true;
  const state = String(p.state || '').toLowerCase();
  const closed = state === 'closed';
  if (merged || closed) {
    const next = removePrFromOpenList(list, n);
    return {
      prs: next,
      removed: next.length !== list.length,
      patched: false,
    };
  }
  // Only patch fields that are defined
  const fieldPatch: LifecycleListPatch = {};
  if (typeof p.draft === 'boolean') fieldPatch.draft = p.draft;
  if (p.state != null && String(p.state).trim()) fieldPatch.state = String(p.state);
  if (typeof p.merged === 'boolean') fieldPatch.merged = p.merged;
  if (p.title != null) fieldPatch.title = p.title;
  if (Object.keys(fieldPatch).length === 0) {
    return { prs: list.slice(), removed: false, patched: false };
  }
  const next = patchPrInOpenList(list, n, fieldPatch);
  const changed = next.some((row, i) => row !== list[i]);
  return { prs: next, removed: false, patched: changed };
}

/**
 * Detect lifecycle keys in an onPatchDetail payload.
 */
export function isLifecycleDetailPatch(patch: unknown): boolean {
  if (!patch || typeof patch !== 'object') return false;
  const p = patch as Record<string, unknown>;
  return (
    'draft' in p ||
    'merged' in p ||
    'state' in p ||
    'mergeable' in p
  );
}

/** True when patch should remove the PR from the open list. */
export function lifecycleRemovesFromOpenList(
  patch: LifecycleListPatch | null | undefined
): boolean {
  if (!patch || typeof patch !== 'object') return false;
  if (patch.merged === true) return true;
  return String(patch.state || '').toLowerCase() === 'closed';
}

/** True when patch re-opens a PR (clear tombstone). */
export function lifecycleReopensInOpenList(
  patch: LifecycleListPatch | null | undefined
): boolean {
  if (!patch || typeof patch !== 'object') return false;
  if (patch.merged === true) return false;
  return String(patch.state || '').toLowerCase() === 'open';
}

/**
 * Update tombstone set after a lifecycle patch.
 * merged/closed → add number; open (not merged) → remove number.
 */
export function nextOpenPullTombstones(
  tombstones: Iterable<number> | null | undefined,
  number: number | string,
  patch: LifecycleListPatch | null | undefined
): Set<number> {
  const out = new Set<number>();
  for (const t of tombstones || []) {
    const n = Number(t);
    if (Number.isFinite(n) && n > 0) out.add(n);
  }
  const n = Number(number);
  if (!Number.isFinite(n) || n <= 0) return out;
  if (lifecycleRemovesFromOpenList(patch)) out.add(n);
  else if (lifecycleReopensInOpenList(patch)) out.delete(n);
  return out;
}

/**
 * Drop tombstoned numbers from a network open-list snapshot so a lagging
 * GitHub `state=open` response cannot resurrect a just-merged/closed PR.
 */
export function filterOpenPullsByTombstones(
  prs: OpenPullLike[] | null | undefined,
  tombstones: Iterable<number> | null | undefined
): OpenPullLike[] {
  const list = Array.isArray(prs) ? prs : [];
  const dead = new Set<number>();
  for (const t of tombstones || []) {
    const n = Number(t);
    if (Number.isFinite(n) && n > 0) dead.add(n);
  }
  if (!dead.size) return list.slice();
  return list.filter((p) => !p || !dead.has(Number(p.number)));
}

/**
 * Decide whether a completed open-list network fetch may commit.
 * Stale gen / abort → reject. On accept, tombstones are applied to prs.
 *
 * This is the host force-fetch policy under unit test (no resurrection).
 */
export function acceptOpenPullsNetworkResult(opts: {
  /** Generation when this fetch started */
  fetchGen: number;
  /** Current latest generation (bumped on newer force) */
  currentGen: number;
  aborted?: boolean;
  networkPrs?: OpenPullLike[] | null;
  tombstones?: Iterable<number> | null;
} = {}): { ok: boolean; prs: OpenPullLike[] } {
  if (opts.aborted) return { ok: false, prs: [] };
  const fetchGen = Number(opts.fetchGen);
  const currentGen = Number(opts.currentGen);
  if (
    !Number.isFinite(fetchGen) ||
    !Number.isFinite(currentGen) ||
    fetchGen !== currentGen
  ) {
    return { ok: false, prs: [] };
  }
  const raw = Array.isArray(opts.networkPrs) ? opts.networkPrs : [];
  return {
    ok: true,
    prs: filterOpenPullsByTombstones(raw, opts.tombstones),
  };
}
