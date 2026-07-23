/* sw-iife */
(function () {
  /**
   * Normalize GitHub commit checks: keep only the latest entry per identity.
   * Commit status contexts and Check Runs can accumulate re-runs / duplicates;
   * GitHub's PR UI surfaces the most recent action list only.
   */

  function parseTime(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const n = Date.parse(String(value));
    return Number.isFinite(n) ? n : 0;
  }

  function statusKey(s) {
    const ctx = String(s?.context || '')
      .trim()
      .toLowerCase();
    if (ctx) return ctx;
    const desc = String(s?.description || '')
      .trim()
      .toLowerCase();
    if (desc) return `desc:${desc}`;
    return '';
  }

  function statusTime(s) {
    return (
      parseTime(s?.updatedAt ?? s?.updated_at) ||
      parseTime(s?.createdAt ?? s?.created_at) ||
      0
    );
  }

  /**
   * Keep the latest status object per context.
   * @param {Array} statuses
   * @returns {Array}
   */
  function distinctStatuses(statuses) {
    const list = Array.isArray(statuses) ? statuses : [];
    /** @type {Map<string, any>} */
    const byKey = new Map();
    let anon = 0;
    for (const s of list) {
      if (!s || typeof s !== 'object') continue;
      let key = statusKey(s);
      if (!key) key = `__anon_status_${anon++}`;
      const prev = byKey.get(key);
      if (!prev || statusTime(s) >= statusTime(prev)) {
        byKey.set(key, s);
      }
    }
    return [...byKey.values()];
  }

  function checkRunKey(r) {
    const name = String(r?.name || '')
      .trim()
      .toLowerCase();
    const app = String(
      r?.appSlug || r?.app_slug || r?.app?.slug || r?.app?.name || ''
    )
      .trim()
      .toLowerCase();
    if (!name) return '';
    // Same-named jobs from different apps stay separate
    return app ? `${app}::${name}` : name;
  }

  function checkRunTime(r) {
    return (
      parseTime(r?.completedAt ?? r?.completed_at) ||
      parseTime(r?.startedAt ?? r?.started_at) ||
      // Prefer higher numeric id as recency proxy when timestamps missing
      (Number.isFinite(Number(r?.id)) ? Number(r.id) : 0)
    );
  }

  /**
   * Keep the latest check run per name (+ app).
   * @param {Array} runs
   * @returns {Array}
   */
  function distinctCheckRuns(runs) {
    const list = Array.isArray(runs) ? runs : [];
    /** @type {Map<string, any>} */
    const byKey = new Map();
    let anon = 0;
    for (const r of list) {
      if (!r || typeof r !== 'object') continue;
      let key = checkRunKey(r);
      if (!key) key = `__anon_run_${anon++}`;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, r);
        continue;
      }
      const tNew = checkRunTime(r);
      const tOld = checkRunTime(prev);
      if (
        tNew > tOld ||
        (tNew === tOld && Number(r.id || 0) > Number(prev.id || 0))
      ) {
        byKey.set(key, r);
      }
    }
    return [...byKey.values()];
  }

  /**
   * Derive overall state from statuses + check runs (after distinct).
   * @param {Array} statuses
   * @param {Array} checkRuns
   * @param {string} [fallback]
   */
  function deriveChecksState(statuses, checkRuns, fallback = 'unknown') {
    const st = Array.isArray(statuses) ? statuses : [];
    const runs = Array.isArray(checkRuns) ? checkRuns : [];
    const statusStates = st.map((s) => String(s?.state || '').toLowerCase());
    const conclusions = runs.map((r) => String(r?.conclusion || '').toLowerCase());
    const runStatuses = runs.map((r) => String(r?.status || '').toLowerCase());

    const anyFailure =
      statusStates.some((s) => s === 'failure' || s === 'error') ||
      conclusions.some(
        (c) =>
          c === 'failure' ||
          c === 'timed_out' ||
          c === 'startup_failure' ||
          c === 'cancelled'
      );
    if (anyFailure) return 'failure';

    const anyPending =
      statusStates.some((s) => s === 'pending') ||
      runStatuses.some(
        (s) => s === 'queued' || s === 'in_progress' || s === 'waiting'
      ) ||
      conclusions.some((c) => c === '' || c === 'null' || c === 'action_required');
    if (anyPending) return 'pending';

    if (st.length || runs.length) {
      const anySuccess =
        statusStates.some((s) => s === 'success') ||
        conclusions.some(
          (c) => c === 'success' || c === 'neutral' || c === 'skipped'
        );
      if (anySuccess) return 'success';
    }

    return fallback || 'unknown';
  }

  /**
   * Normalize a checks payload: distinct latest statuses + check runs, recompute counts/state.
   * @param {object|null|undefined} checks
   * @returns {{ state: string, totalCount: number, statuses: Array, checkRuns: Array }}
   */
  function normalizeChecks(checks) {
    const raw = checks && typeof checks === 'object' ? checks : {};
    const statuses = distinctStatuses(raw.statuses);
    const checkRuns = distinctCheckRuns(raw.checkRuns || raw.check_runs);
    const state = deriveChecksState(
      statuses,
      checkRuns,
      String(raw.state || 'unknown')
    );
    return {
      state,
      totalCount: statuses.length + checkRuns.length,
      statuses,
      checkRuns,
    };
  }

  const api = {
    parseTime,
    statusKey,
    statusTime,
    distinctStatuses,
    checkRunKey,
    checkRunTime,
    distinctCheckRuns,
    deriveChecksState,
    normalizeChecks,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.PRModalChecks = api;
  }
})();
