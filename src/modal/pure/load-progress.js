/**
 * Pure helpers for percent-based PR open load stages + counter tween.
 */
(function () {
  const LOAD_STAGE_WEIGHTS = {
    start: 5,
    core: 40,
    threads: 40,
    done: 15,
  };

  function totalLoadWeight() {
    return (
      LOAD_STAGE_WEIGHTS.start +
      LOAD_STAGE_WEIGHTS.core +
      LOAD_STAGE_WEIGHTS.threads +
      LOAD_STAGE_WEIGHTS.done
    );
  }

  function clampPercent(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.min(100, Math.max(0, Math.round(n)));
  }

  function completedWeightForPhase(phase) {
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
    return LOAD_STAGE_WEIGHTS.start;
  }

  function finishedWeightAfterPhase(phase) {
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

  function percentFromStageProgress(opts = {}) {
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

  function easeCounter(from, to, t) {
    const a = Number(from) || 0;
    const b = Number(to) || 0;
    const u = Math.min(1, Math.max(0, Number(t) || 0));
    const e = 1 - Math.pow(1 - u, 3);
    return Math.round(a + (b - a) * e);
  }

  function tweenCounterSamples(from, to, steps = 8) {
    const n = Math.max(2, Math.floor(steps));
    const out = [];
    for (let i = 0; i <= n; i++) {
      out.push(easeCounter(from, to, i / n));
    }
    out[out.length - 1] = Math.round(to);
    return out;
  }

  const FETCH_UNIT_WEIGHTS = {
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
    /** refresh-only alternate */
    threadsVisible: 20,
  };

  const OPEN_PROGRESS_KEYS = [
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
  ];

  /**
   * Accumulating progress for concurrent fetches (order-independent).
   * Each resolved promise should call complete(key, weight).
   */
  function createWeightProgress(options = {}) {
    const total =
      Number.isFinite(options.total) && options.total > 0
        ? Number(options.total)
        : 100;
    let completed = Math.max(0, Number(options.initial) || 0);
    const doneKeys = new Set();

    function percent() {
      return clampPercent(Math.round((completed / total) * 100));
    }

    function complete(key, weight) {
      const k = String(key || '');
      if (!k || doneKeys.has(k)) {
        return { percent: percent(), added: false, completed };
      }
      doneKeys.add(k);
      const w = Math.max(0, Number(weight) || 0);
      completed = Math.min(total, completed + w);
      return { percent: percent(), added: true, completed };
    }

    function has(key) {
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

  const api = {
    LOAD_STAGE_WEIGHTS,
    FETCH_UNIT_WEIGHTS,
    OPEN_PROGRESS_KEYS,
    totalLoadWeight,
    clampPercent,
    completedWeightForPhase,
    finishedWeightAfterPhase,
    percentFromStageProgress,
    easeCounter,
    tweenCounterSamples,
    createWeightProgress,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.PRModalLoadProgress = api;
})();
