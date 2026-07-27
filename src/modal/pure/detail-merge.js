/**
 * Progressive PR detail merge — single canonical app-detail shape.
 *
 * Layers (list sketch → cache → core → side panels → threads) must not wipe
 * richer prior data with empty placeholders. Empty arrays only win when the
 * incoming snapshot is authoritative for that field (`_sideSettled` or
 * explicit meta patch / full network core for people meta).
 */
(function (global) {
  function samePrIdentity(a, b) {
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    return (
      String(a.owner || '').toLowerCase() === String(b.owner || '').toLowerCase() &&
      String(a.repo || '').toLowerCase() === String(b.repo || '').toLowerCase() &&
      Number(a.number) === Number(b.number)
    );
  }

  function asArray(v) {
    return Array.isArray(v) ? v : null;
  }

  /**
   * Prefer non-empty lists during progressive load.
   * @param {unknown} prev
   * @param {unknown} next
   * @param {{ trustEmpty?: boolean }} [opts]
   */
  function mergeListField(prev, next, opts = {}) {
    const n = asArray(next);
    const p = asArray(prev);
    if (n && n.length) return n;
    if (opts.trustEmpty && n) return n;
    if (p && p.length) return p;
    if (n) return n;
    if (p) return p;
    return [];
  }

  function hasCheckItems(checks) {
    if (!checks || typeof checks !== 'object') return false;
    const statuses = checks.statuses || [];
    const runs = checks.checkRuns || checks.check_runs || [];
    return (
      (Array.isArray(statuses) && statuses.length > 0) ||
      (Array.isArray(runs) && runs.length > 0)
    );
  }

  function settledMap(detail) {
    const s = detail && detail._sideSettled;
    return s && typeof s === 'object' ? { ...s } : {};
  }

  /**
   * Merge progressive detail snapshots into one app-detail object.
   * @param {object|null|undefined} prev currently painted detail
   * @param {object|null|undefined} next incoming layer
   * @param {{ trustMetaEmpty?: boolean }} [opts]
   *   trustMetaEmpty — next is authoritative for people meta even when empty
   *   (e.g. explicit user edit patch, or completed full revalidate).
   */
  function mergeDetailProgressive(prev, next, opts = {}) {
    if (!next || typeof next !== 'object') return prev || next;
    if (!prev || typeof prev !== 'object' || !samePrIdentity(prev, next)) {
      return next;
    }

    const trustMetaEmpty = Boolean(opts.trustMetaEmpty);
    // Full network core (not sketch) may clear meta when empty — but only when
    // caller opts in. Default: protect progressive sketch → core handoff.
    const nextIsSketch = Boolean(next._sketch) || next._source === 'list';
    const prevIsSketch = Boolean(prev._sketch) || prev._source === 'list';
    const protectMeta =
      !trustMetaEmpty && (prevIsSketch || nextIsSketch || !next._source);

    const prevSettled = settledMap(prev);
    const nextSettled = settledMap(next);
    const settled = { ...prevSettled, ...nextSettled };

    const out = {
      ...prev,
      ...next,
      _sideSettled: settled,
    };

    // ── People / labels meta ─────────────────────────────────────────
    out.assignees = mergeListField(prev.assignees, next.assignees, {
      trustEmpty: trustMetaEmpty || (!protectMeta && Array.isArray(next.assignees)),
    });
    out.requestedReviewers = mergeListField(
      prev.requestedReviewers,
      next.requestedReviewers,
      {
        trustEmpty:
          trustMetaEmpty ||
          (!protectMeta && Array.isArray(next.requestedReviewers)),
      }
    );
    out.requestedTeams = mergeListField(prev.requestedTeams, next.requestedTeams, {
      trustEmpty:
        trustMetaEmpty || (!protectMeta && Array.isArray(next.requestedTeams)),
    });
    out.labels = mergeListField(prev.labels, next.labels, {
      trustEmpty: trustMetaEmpty || (!protectMeta && Array.isArray(next.labels)),
    });

    // Milestone: don't let sketch null wipe a real one; explicit null after
    // network/core with trustMetaEmpty is allowed.
    if (Object.prototype.hasOwnProperty.call(next, 'milestone')) {
      if (next.milestone != null) {
        out.milestone = next.milestone;
      } else if (protectMeta && prev.milestone) {
        out.milestone = prev.milestone;
      } else {
        out.milestone = next.milestone;
      }
    } else if (prev.milestone) {
      out.milestone = prev.milestone;
    }

    // Avatar map: union
    out.avatarUrls = {
      ...(prev.avatarUrls && typeof prev.avatarUrls === 'object'
        ? prev.avatarUrls
        : {}),
      ...(next.avatarUrls && typeof next.avatarUrls === 'object'
        ? next.avatarUrls
        : {}),
    };

    // ── Independent side panels ──────────────────────────────────────
    for (const key of ['files', 'commits', 'comments', 'reviews']) {
      if (nextSettled[key] && Object.prototype.hasOwnProperty.call(next, key)) {
        out[key] = asArray(next[key]) || [];
        continue;
      }
      out[key] = mergeListField(prev[key], next[key], {
        trustEmpty: Boolean(nextSettled[key]),
      });
    }

    // checks
    if (nextSettled.checks && next.checks) {
      out.checks = next.checks;
    } else if (hasCheckItems(next.checks)) {
      out.checks = next.checks;
    } else if (hasCheckItems(prev.checks)) {
      out.checks = prev.checks;
    } else if (next.checks) {
      out.checks = next.checks;
    } else {
      out.checks = prev.checks;
    }

    // development / projects
    if (nextSettled.development) {
      if (Object.prototype.hasOwnProperty.call(next, 'developmentIssues')) {
        out.developmentIssues = asArray(next.developmentIssues) || [];
      }
      if (Object.prototype.hasOwnProperty.call(next, 'linkedIssues')) {
        out.linkedIssues = asArray(next.linkedIssues) || [];
      }
      if (Object.prototype.hasOwnProperty.call(next, 'projects')) {
        out.projects = asArray(next.projects) || [];
      }
    } else {
      out.developmentIssues = mergeListField(
        prev.developmentIssues,
        next.developmentIssues,
        { trustEmpty: false }
      );
      out.linkedIssues = mergeListField(prev.linkedIssues, next.linkedIssues, {
        trustEmpty: false,
      });
      out.projects = mergeListField(prev.projects, next.projects, {
        trustEmpty: false,
      });
    }

    // Threads: prefer longer / non-empty when not settled via side map
    out.reviewThreads = mergeListField(prev.reviewThreads, next.reviewThreads, {
      trustEmpty: false,
    });
    out.reviewComments = mergeListField(
      prev.reviewComments,
      next.reviewComments,
      { trustEmpty: false }
    );
    if (next.reviewThreadsMeta) out.reviewThreadsMeta = next.reviewThreadsMeta;
    else if (prev.reviewThreadsMeta) out.reviewThreadsMeta = prev.reviewThreadsMeta;

    // Drop sketch flag once we have a non-sketch network layer
    if (!next._sketch && next._source && next._source !== 'list') {
      out._sketch = undefined;
    }
    if (next._source) out._source = next._source;
    else if (prev._source && out._sketch) out._source = prev._source;

    return out;
  }

  const api = {
    samePrIdentity,
    mergeListField,
    mergeDetailProgressive,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.PRModalDetailMerge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
