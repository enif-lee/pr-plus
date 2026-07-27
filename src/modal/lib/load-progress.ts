/**
 * Pure helpers for percent-based PR open load stages + counter tween.
 */

export const LOAD_STAGE_WEIGHTS = {
  /** Shell opened / cache paint */
  start: 5,
  /** Core PR metadata + files/diff + commits (fetchPrDetail) */
  core: 40,
  /** Review threads (newest window / revalidate) */
  threads: 40,
  /** Final settle */
  done: 15,
} as const;

export type LoadStagePhase =
  | 'start'
  | 'core'
  | 'revalidate'
  | 'threads'
  | 'refresh'
  | 'done'
  | string
  | null
  | undefined;

/** Cumulative weight completed when `phase` is the current busy phase (in progress). */
export function completedWeightForPhase(phase: LoadStagePhase): number {
  const p = String(phase || '');
  if (!p || p === 'start') return 0;
  if (p === 'core' || p === 'core-full' || p === 'revalidate') {
    return LOAD_STAGE_WEIGHTS.start;
  }
  if (p === 'threads' || p.startsWith('threads') || p === 'refresh') {
    return LOAD_STAGE_WEIGHTS.start + LOAD_STAGE_WEIGHTS.core;
  }
  if (p === 'done' || p === 'complete') {
    return (
      LOAD_STAGE_WEIGHTS.start +
      LOAD_STAGE_WEIGHTS.core +
      LOAD_STAGE_WEIGHTS.threads +
      LOAD_STAGE_WEIGHTS.done
    );
  }
  // Unknown busy phase — treat like mid core
  return LOAD_STAGE_WEIGHTS.start;
}

/** Weight finished after a phase completes (transition to next). */
export function finishedWeightAfterPhase(phase: LoadStagePhase): number {
  const p = String(phase || '');
  if (p === 'start') return LOAD_STAGE_WEIGHTS.start;
  if (p === 'core' || p === 'core-full' || p === 'revalidate') {
    return LOAD_STAGE_WEIGHTS.start + LOAD_STAGE_WEIGHTS.core;
  }
  if (p === 'threads' || p.startsWith('threads') || p === 'refresh') {
    return (
      LOAD_STAGE_WEIGHTS.start +
      LOAD_STAGE_WEIGHTS.core +
      LOAD_STAGE_WEIGHTS.threads
    );
  }
  return (
    LOAD_STAGE_WEIGHTS.start +
    LOAD_STAGE_WEIGHTS.core +
    LOAD_STAGE_WEIGHTS.threads +
    LOAD_STAGE_WEIGHTS.done
  );
}

export function totalLoadWeight(): number {
  return (
    LOAD_STAGE_WEIGHTS.start +
    LOAD_STAGE_WEIGHTS.core +
    LOAD_STAGE_WEIGHTS.threads +
    LOAD_STAGE_WEIGHTS.done
  );
}

/**
 * Map completed weight → integer percent 0–100.
 * While a phase is busy, include half of that phase’s weight for soft progress.
 */
export function percentFromStageProgress(opts: {
  phase?: LoadStagePhase;
  busy?: boolean;
  /** Override absolute completed weight */
  completedWeight?: number;
  /** Optional extra 0–1 progress within current phase */
  phaseFraction?: number;
}): number {
  const total = totalLoadWeight();
  if (Number.isFinite(opts.completedWeight)) {
    return clampPercent(Math.round((Number(opts.completedWeight) / total) * 100));
  }
  const phase = opts.phase;
  const busy = opts.busy !== false;
  let done = completedWeightForPhase(phase);
  if (busy && phase) {
    const after = finishedWeightAfterPhase(phase);
    const span = Math.max(0, after - done);
    const frac =
      Number.isFinite(opts.phaseFraction) && opts.phaseFraction != null
        ? Math.min(1, Math.max(0, Number(opts.phaseFraction)))
        : 0.35;
    done += span * frac;
  } else if (!busy && phase) {
    done = finishedWeightAfterPhase(phase);
  }
  if (!busy && (!phase || phase === 'done')) {
    return 100;
  }
  return clampPercent(Math.round((done / total) * 100));
}

export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Linear interpolate integer display values. t in [0,1]. */
export function easeCounter(from: number, to: number, t: number): number {
  const a = Number(from) || 0;
  const b = Number(to) || 0;
  const u = Math.min(1, Math.max(0, Number(t) || 0));
  // ease-out cubic
  const e = 1 - Math.pow(1 - u, 3);
  return Math.round(a + (b - a) * e);
}

/**
 * Produce intermediate counter samples from a→b over steps (for tests / rAF).
 */
export function tweenCounterSamples(
  from: number,
  to: number,
  steps = 8
): number[] {
  const n = Math.max(2, Math.floor(steps));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    out.push(easeCounter(from, to, i / n));
  }
  // Guarantee last is exact target
  out[out.length - 1] = Math.round(to);
  return out;
}

/**
 * Default unit weights for open/refresh parallel fetches.
 * Each completing promise should call `complete(key, weight)` so the bar
 * advances when that request lands (order-independent).
 *
 * Open path keys sum to 100:
 *   start + core + threadsNewest + threadsFollow
 *   + files + comments + reviews + commits + checks + development
 * refresh may use threadsVisible instead of threadsNewest+threadsFollow.
 */
export const FETCH_UNIT_WEIGHTS = {
  start: 4,
  core: 18,
  threadsNewest: 14,
  threadsFollow: 6,
  files: 12,
  comments: 10,
  reviews: 10,
  commits: 10,
  checks: 10,
  development: 6,
  /** refresh-only: visible bulk instead of newest page */
  threadsVisible: 20,
} as const;

/** Keys that must complete for open progress to reach Ready (100). */
export const OPEN_PROGRESS_KEYS = [
  'start',
  'core',
  'threadsNewest',
  'threadsFollow',
  'files',
  'comments',
  'reviews',
  'commits',
  'checks',
  'development',
] as const;

/**
 * Accumulating progress for concurrent fetches.
 * Completing the same key twice is a no-op (idempotent).
 */
export function createWeightProgress(options: {
  total?: number;
  initial?: number;
} = {}) {
  const total =
    Number.isFinite(options.total) && (options.total as number) > 0
      ? Number(options.total)
      : 100;
  let completed = Math.max(0, Number(options.initial) || 0);
  const doneKeys = new Set<string>();

  function percent(): number {
    return clampPercent(Math.round((completed / total) * 100));
  }

  /**
   * Mark a fetch unit done and return the new percent (0–100).
   * @returns {{ percent: number, added: boolean, completed: number }}
   */
  function complete(key: string, weight: number) {
    const k = String(key || '');
    if (!k || doneKeys.has(k)) {
      return { percent: percent(), added: false, completed };
    }
    doneKeys.add(k);
    const w = Math.max(0, Number(weight) || 0);
    completed = Math.min(total, completed + w);
    return { percent: percent(), added: true, completed };
  }

  function has(key: string): boolean {
    return doneKeys.has(String(key || ''));
  }

  return {
    total,
    complete,
    percent,
    has,
    getCompleted: () => completed,
    getKeys: () => [...doneKeys],
  };
}

export type WeightProgress = ReturnType<typeof createWeightProgress>;
