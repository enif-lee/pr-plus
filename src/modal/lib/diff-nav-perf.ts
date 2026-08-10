/**
 * Opt-in Diff keyboard-nav performance samples (modal vs embed).
 *
 * Enable any of:
 *   - localStorage `prp:diff-nav-perf` = `1` | `true` | `on`
 *   - `window.__PRP_DIFF_NAV_PERF_ENABLE__ = true`
 *   - URL query `?prp_diff_nav_perf=1`
 *
 * DevTools:
 *   window.__PRP_DIFF_NAV_PERF__.snapshot()
 *   window.__PRP_DIFF_NAV_PERF__.reset()
 *   Performance panel → measures named `prp-diff-nav`
 *
 * Zero cost when disabled (single boolean check per rAF flush).
 */

export const DIFF_NAV_PERF_STORAGE_KEY = 'prp:diff-nav-perf';
export const DIFF_NAV_PERF_QUERY = 'prp_diff_nav_perf';
export const DIFF_NAV_PERF_MARK_START = 'prp-diff-nav-start';
export const DIFF_NAV_PERF_MARK_END = 'prp-diff-nav-end';
export const DIFF_NAV_PERF_MEASURE = 'prp-diff-nav';
export const DIFF_NAV_PERF_MAX_SAMPLES = 200;

export type DiffNavPerfPresentation = 'modal' | 'embed';

export type DiffNavPerfSample = {
  ms: number;
  presentation: DiffNavPerfPresentation;
  delta: number;
  t: number;
};

export type DiffNavPerfSnapshot = {
  enabled: boolean;
  count: number;
  lastMs: number | null;
  meanMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
  byPresentation: {
    modal: { count: number; meanMs: number | null; p95Ms: number | null };
    embed: { count: number; meanMs: number | null; p95Ms: number | null };
  };
  samples: DiffNavPerfSample[];
};

type PerfStorage = {
  getItem?: (k: string) => string | null;
  setItem?: (k: string, v: string) => void;
  removeItem?: (k: string) => void;
};

type PerfGlobal = {
  localStorage?: PerfStorage;
  location?: { search?: string };
  performance?: {
    now?: () => number;
    mark?: (name: string) => void;
    measure?: (name: string, start?: string, end?: string) => void;
    clearMarks?: (name?: string) => void;
    clearMeasures?: (name?: string) => void;
  };
  __PRP_DIFF_NAV_PERF_ENABLE__?: boolean;
  __PRP_DIFF_NAV_PERF__?: DiffNavPerfApi;
};

export type DiffNavPerfApi = {
  enable: () => void;
  disable: () => void;
  reset: () => void;
  snapshot: () => DiffNavPerfSnapshot;
  isEnabled: () => boolean;
  samples: () => DiffNavPerfSample[];
};

const samples: DiffNavPerfSample[] = [];
let cachedEnabled: boolean | null = null;
let markSeq = 0;

function truthyFlag(v: unknown): boolean {
  if (v === true || v === 1) return true;
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  return s === '1' || s === 'true' || s === 'on' || s === 'yes';
}

export function resolveDiffNavPerfEnabled(
  g: PerfGlobal | null | undefined = typeof globalThis !== 'undefined'
    ? (globalThis as PerfGlobal)
    : null
): boolean {
  if (!g) return false;
  if (g.__PRP_DIFF_NAV_PERF_ENABLE__ === true) return true;
  if (g.__PRP_DIFF_NAV_PERF_ENABLE__ === false) return false;
  try {
    const q = String(g.location?.search || '');
    if (q) {
      const params = new URLSearchParams(q.startsWith('?') ? q.slice(1) : q);
      if (params.has(DIFF_NAV_PERF_QUERY)) {
        const raw = params.get(DIFF_NAV_PERF_QUERY);
        if (raw == null || raw === '') return true;
        return truthyFlag(raw);
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = g.localStorage?.getItem?.(DIFF_NAV_PERF_STORAGE_KEY);
    if (raw != null) return truthyFlag(raw);
  } catch {
    /* ignore */
  }
  return false;
}

/** Invalidate enable cache (after enable/disable or storage flip). */
export function invalidateDiffNavPerfEnabledCache(): void {
  cachedEnabled = null;
}

export function isDiffNavPerfEnabled(
  g: PerfGlobal | null | undefined = typeof globalThis !== 'undefined'
    ? (globalThis as PerfGlobal)
    : null
): boolean {
  if (cachedEnabled == null) {
    cachedEnabled = resolveDiffNavPerfEnabled(g);
  }
  return cachedEnabled;
}

export function setDiffNavPerfEnabled(
  on: boolean,
  g: PerfGlobal | null | undefined = typeof globalThis !== 'undefined'
    ? (globalThis as PerfGlobal)
    : null
): void {
  cachedEnabled = Boolean(on);
  if (!g) return;
  try {
    g.__PRP_DIFF_NAV_PERF_ENABLE__ = cachedEnabled;
  } catch {
    /* ignore */
  }
  try {
    if (cachedEnabled) {
      g.localStorage?.setItem?.(DIFF_NAV_PERF_STORAGE_KEY, '1');
    } else {
      g.localStorage?.removeItem?.(DIFF_NAV_PERF_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function nowMs(g: PerfGlobal | null | undefined): number {
  try {
    const n = g?.performance?.now?.();
    if (typeof n === 'number' && Number.isFinite(n)) return n;
  } catch {
    /* ignore */
  }
  return Date.now();
}

export type DiffNavPerfStart = { t0: number; id: number };

/**
 * Start a sample. Returns start token or null when disabled.
 */
export function beginDiffNavPerfSample(
  g: PerfGlobal | null | undefined = typeof globalThis !== 'undefined'
    ? (globalThis as PerfGlobal)
    : null
): DiffNavPerfStart | null {
  if (!isDiffNavPerfEnabled(g)) return null;
  const t0 = nowMs(g);
  markSeq += 1;
  const id = markSeq;
  try {
    g?.performance?.mark?.(`${DIFF_NAV_PERF_MARK_START}-${id}`);
  } catch {
    /* ignore */
  }
  return { t0, id };
}

export function percentileSorted(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const clamped = Math.min(1, Math.max(0, p));
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(clamped * sorted.length) - 1)
  );
  return sorted[idx];
}

export function summarizeMs(values: number[]): {
  count: number;
  meanMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
} {
  if (!values.length) {
    return {
      count: 0,
      meanMs: null,
      p50Ms: null,
      p95Ms: null,
      maxMs: null,
    };
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    meanMs: sum / sorted.length,
    p50Ms: percentileSorted(sorted, 0.5),
    p95Ms: percentileSorted(sorted, 0.95),
    maxMs: sorted[sorted.length - 1],
  };
}

/**
 * End sample and push into the ring buffer. No-op when disabled or start is null.
 */
export function endDiffNavPerfSample(
  start: DiffNavPerfStart | null | undefined,
  meta: {
    presentation: DiffNavPerfPresentation;
    delta?: number;
  },
  g: PerfGlobal | null | undefined = typeof globalThis !== 'undefined'
    ? (globalThis as PerfGlobal)
    : null
): DiffNavPerfSample | null {
  if (!start || !isDiffNavPerfEnabled(g)) return null;
  const t0 = Number(start.t0);
  const id = Number(start.id) || 0;
  if (!Number.isFinite(t0)) return null;
  const t1 = nowMs(g);
  const ms = Math.max(0, t1 - t0);
  if (id > 0) {
    const startName = `${DIFF_NAV_PERF_MARK_START}-${id}`;
    const endName = `${DIFF_NAV_PERF_MARK_END}-${id}`;
    try {
      g?.performance?.mark?.(endName);
      g?.performance?.measure?.(DIFF_NAV_PERF_MEASURE, startName, endName);
    } catch {
      /* ignore */
    }
    try {
      g?.performance?.clearMarks?.(startName);
      g?.performance?.clearMarks?.(endName);
    } catch {
      /* ignore */
    }
  }
  const sample: DiffNavPerfSample = {
    ms,
    presentation: meta.presentation === 'embed' ? 'embed' : 'modal',
    delta: Number(meta.delta) || 0,
    t: Date.now(),
  };
  samples.push(sample);
  while (samples.length > DIFF_NAV_PERF_MAX_SAMPLES) samples.shift();
  return sample;
}

export function resetDiffNavPerfSamples(): void {
  samples.length = 0;
}

export function getDiffNavPerfSamples(): DiffNavPerfSample[] {
  return samples.slice();
}

export function getDiffNavPerfSnapshot(
  g: PerfGlobal | null | undefined = typeof globalThis !== 'undefined'
    ? (globalThis as PerfGlobal)
    : null
): DiffNavPerfSnapshot {
  const all = samples.map((s) => s.ms);
  const modal = samples
    .filter((s) => s.presentation === 'modal')
    .map((s) => s.ms);
  const embed = samples
    .filter((s) => s.presentation === 'embed')
    .map((s) => s.ms);
  const allSum = summarizeMs(all);
  const modalSum = summarizeMs(modal);
  const embedSum = summarizeMs(embed);
  return {
    enabled: isDiffNavPerfEnabled(g),
    count: allSum.count,
    lastMs: all.length ? all[all.length - 1] : null,
    meanMs: allSum.meanMs,
    p50Ms: allSum.p50Ms,
    p95Ms: allSum.p95Ms,
    maxMs: allSum.maxMs,
    byPresentation: {
      modal: {
        count: modalSum.count,
        meanMs: modalSum.meanMs,
        p95Ms: modalSum.p95Ms,
      },
      embed: {
        count: embedSum.count,
        meanMs: embedSum.meanMs,
        p95Ms: embedSum.p95Ms,
      },
    },
    samples: getDiffNavPerfSamples(),
  };
}

/** Install `window.__PRP_DIFF_NAV_PERF__` API (idempotent). */
export function installDiffNavPerfGlobal(
  g: PerfGlobal | null | undefined = typeof globalThis !== 'undefined'
    ? (globalThis as PerfGlobal)
    : null
): DiffNavPerfApi | null {
  if (!g) return null;
  const api: DiffNavPerfApi = {
    enable: () => setDiffNavPerfEnabled(true, g),
    disable: () => setDiffNavPerfEnabled(false, g),
    reset: () => resetDiffNavPerfSamples(),
    snapshot: () => getDiffNavPerfSnapshot(g),
    isEnabled: () => isDiffNavPerfEnabled(g),
    samples: () => getDiffNavPerfSamples(),
  };
  try {
    g.__PRP_DIFF_NAV_PERF__ = api;
  } catch {
    /* ignore */
  }
  return api;
}
