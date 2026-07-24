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

  /**
   * GitHub merge-box bucket for one check item.
   * @returns {'failure'|'pending'|'skipped'|'success'}
   */
  function classifyCheckOutcome(item) {
    if (!item || typeof item !== 'object') return 'pending';
    if (item.kind === 'status' || item.state != null) {
      const st = String(item.state || '').toLowerCase();
      if (st === 'failure' || st === 'error') return 'failure';
      if (st === 'success') return 'success';
      if (st === 'pending') return 'pending';
      // expected / unknown → pending
      return 'pending';
    }
    const conclusion = String(item.conclusion || '').toLowerCase();
    const status = String(item.status || '').toLowerCase();
    if (
      conclusion === 'failure' ||
      conclusion === 'timed_out' ||
      conclusion === 'startup_failure' ||
      conclusion === 'cancelled'
    ) {
      return 'failure';
    }
    if (conclusion === 'skipped') return 'skipped';
    if (conclusion === 'success' || conclusion === 'neutral') return 'success';
    if (
      status === 'queued' ||
      status === 'in_progress' ||
      status === 'waiting' ||
      status === 'requested' ||
      status === 'pending' ||
      conclusion === '' ||
      conclusion === 'null' ||
      conclusion === 'action_required'
    ) {
      return 'pending';
    }
    return 'pending';
  }

  /** Compact duration: 9m, 22s, 1h 2m */
  function formatDurationMs(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n < 0) return '';
    if (n < 1000) return '<1s';
    const sec = Math.round(n / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const remSec = sec % 60;
    if (min < 60) return remSec ? `${min}m ${remSec}s` : `${min}m`;
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    return remMin ? `${hr}h ${remMin}m` : `${hr}h`;
  }

  /** Relative time for “Skipped 20 minutes ago” */
  function formatRelativeAgo(iso, nowMs) {
    const t = parseTime(iso);
    if (!t) return '';
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    let sec = Math.max(0, Math.round((now - t) / 1000));
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
    const hr = Math.floor(min / 60);
    if (hr < 48) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
    const day = Math.floor(hr / 24);
    return `${day} day${day === 1 ? '' : 's'} ago`;
  }

  /**
   * Human summary next to the check name (GitHub merge-box style).
   * @param {{ outcome: string, description?: string, startedAt?: string, completedAt?: string, updatedAt?: string }} item
   * @param {number} [nowMs]
   */
  function formatCheckSummary(item, nowMs) {
    if (!item) return '';
    const desc = String(item.description || '').trim();
    const start = parseTime(item.startedAt);
    const end = parseTime(item.completedAt) || parseTime(item.updatedAt);
    const duration =
      start && end && end >= start
        ? formatDurationMs(end - start)
        : start && !end
          ? formatDurationMs((Number.isFinite(nowMs) ? nowMs : Date.now()) - start)
          : '';
    const outcome = item.outcome || classifyCheckOutcome(item);

    if (outcome === 'failure') {
      if (duration) return `Failing after ${duration}`;
      return desc || 'Failing';
    }
    if (outcome === 'success') {
      if (duration) return `Successful in ${duration}`;
      return desc || 'Successful';
    }
    if (outcome === 'skipped') {
      const when = formatRelativeAgo(item.completedAt || item.updatedAt, nowMs);
      if (when) return `Skipped ${when}`;
      return desc || 'Skipped';
    }
    // pending
    if (statusIsInProgress(item)) {
      return duration ? `In progress — ${duration}` : desc || 'In progress';
    }
    return desc || 'Expected — Waiting for status to be reported';
  }

  function statusIsInProgress(item) {
    const status = String(item?.status || '').toLowerCase();
    return status === 'in_progress' || status === 'queued' || status === 'waiting';
  }

  /**
   * Flatten statuses + check runs into display rows for the merge box.
   * @param {object|null|undefined} checks
   * @param {{ nowMs?: number }} [opts]
   * @returns {{ state: string, totalCount: number, groups: Array<{ key: string, label: string, outcome: string, items: Array }> }}
   */
  function buildMergeBoxCheckGroups(checks, opts) {
    const nowMs =
      opts && Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
    const n = normalizeChecks(checks);
    /** @type {Array<any>} */
    const rows = [];

    for (const s of n.statuses || []) {
      const outcome = classifyCheckOutcome({ kind: 'status', state: s.state });
      const row = {
        id: `status:${s.context || rows.length}`,
        kind: 'status',
        name: s.context || s.description || 'status',
        outcome,
        description: s.description || '',
        url: s.targetUrl || s.target_url || '',
        startedAt: s.createdAt || s.created_at || '',
        completedAt: s.updatedAt || s.updated_at || '',
        updatedAt: s.updatedAt || s.updated_at || '',
        required: Boolean(s.required),
      };
      row.summary = formatCheckSummary(row, nowMs);
      rows.push(row);
    }

    for (const r of n.checkRuns || []) {
      const outcome = classifyCheckOutcome(r);
      const app = String(r.appName || r.app?.name || '').trim();
      const name = String(r.name || 'check').trim() || 'check';
      // Prefer raw job name; app prefix only when it adds context (not already in name)
      const displayName =
        app && !name.toLowerCase().startsWith(app.toLowerCase())
          ? `${app} / ${name}`
          : name;
      const row = {
        id: `run:${r.id || name}`,
        kind: 'run',
        name: displayName,
        outcome,
        description: '',
        url: r.htmlUrl || r.html_url || r.detailsUrl || r.details_url || '',
        startedAt: r.startedAt || r.started_at || '',
        completedAt: r.completedAt || r.completed_at || '',
        updatedAt: r.completedAt || r.completed_at || r.startedAt || '',
        required: Boolean(r.required),
      };
      row.summary = formatCheckSummary(row, nowMs);
      rows.push(row);
    }

    const buckets = {
      failure: [],
      pending: [],
      skipped: [],
      success: [],
    };
    for (const row of rows) {
      const b = buckets[row.outcome] || buckets.pending;
      b.push(row);
    }

    /** @type {Array<{ key: string, label: string, outcome: string, items: Array }>} */
    const groups = [];
    const pushGroup = (key, outcome, singular, plural, items) => {
      if (!items.length) return;
      const label =
        items.length === 1 ? `1 ${singular}` : `${items.length} ${plural}`;
      groups.push({ key, label, outcome, items });
    };
    // GitHub order: failing → expected/pending → skipped → successful
    pushGroup('failure', 'failure', 'failing check', 'failing checks', buckets.failure);
    pushGroup('pending', 'pending', 'expected check', 'expected checks', buckets.pending);
    pushGroup('skipped', 'skipped', 'skipped check', 'skipped checks', buckets.skipped);
    pushGroup(
      'success',
      'success',
      'successful check',
      'successful checks',
      buckets.success
    );

    return {
      state: n.state,
      totalCount: rows.length,
      groups,
    };
  }

  /** Headline under merge-box checks section (GitHub copy). */
  function mergeBoxChecksHeadline(state, totalCount) {
    const st = String(state || '').toLowerCase();
    if (!totalCount) return null;
    if (st === 'failure' || st === 'error') return 'Some checks were not successful';
    if (st === 'pending') return 'Some checks haven’t completed yet';
    if (st === 'success') return 'All checks have passed';
    return 'Checks';
  }

  /**
   * Count outcomes over normalized statuses + check runs for summary icons/popover.
   * @param {object|null|undefined} checks
   * @returns {{ total: number, success: number, failure: number, pending: number, skipped: number, state: string }}
   */
  function summarizeCheckCounts(checks) {
    const n = normalizeChecks(checks);
    let success = 0;
    let failure = 0;
    let pending = 0;
    let skipped = 0;
    for (const s of n.statuses || []) {
      const o = classifyCheckOutcome({ kind: 'status', state: s?.state });
      if (o === 'failure') failure += 1;
      else if (o === 'success') success += 1;
      else if (o === 'skipped') skipped += 1;
      else pending += 1;
    }
    for (const r of n.checkRuns || []) {
      const o = classifyCheckOutcome(r);
      if (o === 'failure') failure += 1;
      else if (o === 'success') success += 1;
      else if (o === 'skipped') skipped += 1;
      else pending += 1;
    }
    const total = success + failure + pending + skipped;
    return {
      total,
      success,
      failure,
      pending,
      skipped,
      state: n.state || 'unknown',
    };
  }

  /**
   * Human popover / aria copy for check counts.
   * @param {{ total?: number, success?: number, failure?: number, pending?: number, skipped?: number, state?: string }|null|undefined} summary
   */
  function formatChecksCountLabel(summary) {
    const s = summary && typeof summary === 'object' ? summary : {};
    const total = Number(s.total) || 0;
    const success = Number(s.success) || 0;
    const failure = Number(s.failure) || 0;
    const pending = Number(s.pending) || 0;
    const skipped = Number(s.skipped) || 0;
    if (!total) {
      const st = String(s.state || 'unknown');
      return st && st !== 'unknown' ? `Checks: ${st}` : 'No checks';
    }
    const parts = [
      `${total} check${total === 1 ? '' : 's'}`,
      `${success} succeeded`,
      `${failure} failed`,
      `${pending} in progress`,
    ];
    if (skipped > 0) parts.push(`${skipped} skipped`);
    return parts.join(' · ');
  }

  /**
   * Names of individual checks bucketed by outcome (for stacked-icon tips).
   * @returns {{ failure: string[], pending: string[], success: string[], skipped: string[], state: string }}
   */
  function listCheckNamesByOutcome(checks) {
    const n = normalizeChecks(checks);
    /** @type {{ failure: string[], pending: string[], success: string[], skipped: string[] }} */
    const groups = { failure: [], pending: [], success: [], skipped: [] };
    for (const s of n.statuses || []) {
      const o = classifyCheckOutcome({ kind: 'status', state: s?.state });
      const name = String(s?.context || s?.description || 'status').trim() || 'status';
      const bucket = groups[o] || groups.pending;
      bucket.push(name);
    }
    for (const r of n.checkRuns || []) {
      const o = classifyCheckOutcome(r);
      const app = String(r?.appName || r?.app?.name || '').trim();
      const job = String(r?.name || 'check').trim() || 'check';
      const name =
        app && !job.toLowerCase().startsWith(app.toLowerCase())
          ? `${app} / ${job}`
          : job;
      const bucket = groups[o] || groups.pending;
      bucket.push(name);
    }
    return {
      failure: groups.failure,
      pending: groups.pending,
      success: groups.success,
      skipped: groups.skipped,
      state: n.state || 'unknown',
    };
  }

  /**
   * Popover text for one outcome group (e.g. failed checks).
   * @param {'failure'|'pending'|'success'|'skipped'} outcome
   * @param {string[]} names
   */
  function formatCheckGroupTip(outcome, names) {
    const list = Array.isArray(names) ? names.filter(Boolean) : [];
    const n = list.length;
    const headings = {
      failure: n === 1 ? '1 failed' : `${n} failed`,
      pending: n === 1 ? '1 in progress' : `${n} in progress`,
      success: n === 1 ? '1 succeeded' : `${n} succeeded`,
      skipped: n === 1 ? '1 skipped' : `${n} skipped`,
    };
    const head = headings[outcome] || `${n} checks`;
    if (!n) return head;
    // Cap long lists so tips stay readable
    const max = 12;
    const shown = list.slice(0, max);
    const more = n - shown.length;
    const body = shown.map((name) => `· ${name}`).join('\n');
    return more > 0 ? `${head}\n${body}\n· +${more} more` : `${head}\n${body}`;
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
    classifyCheckOutcome,
    formatDurationMs,
    formatRelativeAgo,
    formatCheckSummary,
    buildMergeBoxCheckGroups,
    mergeBoxChecksHeadline,
    summarizeCheckCounts,
    formatChecksCountLabel,
    listCheckNamesByOutcome,
    formatCheckGroupTip,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.PRModalChecks = api;
  }
})();
