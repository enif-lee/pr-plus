  // continued host module segment
  function pageEmbedApi() {
    return globalThis.PRModalPageEmbed || null;
  }

  function githubRouteApi() {
    return globalThis.PRModalGithubPrRoute || null;
  }

  function detailStoreApi() {
    return globalThis.PRModalDetailStore || null;
  }

  function mergeDetailProgressive(prev, next, opts = null) {
    const api = globalThis.PRModalDetailMerge;
    if (api && typeof api.mergeDetailProgressive === 'function') {
      return api.mergeDetailProgressive(prev, next, opts || undefined);
    }
    if (!next) return prev || next;
    if (!prev) return next;
    return { ...prev, ...next };
  }

  /**
   * True when files[] can paint Diff text (or are legitimately patchless).
   * Mirrors modal filesListHasUsableDiffBodies — kept local so host has no import.
   */
  function e2eFilesBodiesOk(files) {
    if (!Array.isArray(files) || files.length === 0) return false;
    let missingRequired = false;
    for (const f of files) {
      if (!f || typeof f !== 'object') continue;
      if (f._patchOmitted) {
        missingRequired = true;
        continue;
      }
      const patch = typeof f.patch === 'string' ? f.patch : '';
      if (patch.length > 0) continue;
      const st = String(f.status || f.changeType || '').toLowerCase();
      const binary = Boolean(f.binary || f.isBinary);
      const noChange =
        Number(f.changes) === 0 ||
        (Number(f.additions || 0) === 0 && Number(f.deletions || 0) === 0);
      if (
        !(
          binary ||
          st === 'renamed' ||
          st === 'removed' ||
          st === 'deleted' ||
          noChange
        )
      ) {
        missingRequired = true;
      }
    }
    return !missingRequired;
  }

  /**
   * Publish readiness for agent-browser e2e:
   * - window.__prpE2eLoad (poll)
   * - window event `prp-e2e-load` (push)
   * - host data-prp-load-* attributes
   *
   * Tests wait on this instead of fixed waitMs after open/layout.
   */
  function publishE2eLoadHook(reason = '') {
    try {
      const d = current.detail;
      const files = Array.isArray(d?.files) ? d.files : [];
      const filesBodiesOk = e2eFilesBodiesOk(files);
      const loadStage = current.loadStage || null;
      const loadBusy = Boolean(loadStage && loadStage.busy);
      const shellReady = Boolean(
        current.open &&
          d &&
          (d.title != null || d.number != null) &&
          !current.loading
      );
      // Meta "open settle": core painted and open progress bar cleared.
      const metaReady = Boolean(shellReady && !loadBusy);
      const snap = {
        seq: ++e2eLoadSeq,
        ts: Date.now(),
        reason: reason || null,
        open: Boolean(current.open),
        loading: Boolean(current.loading),
        owner: current.owner || null,
        repo: current.repo || null,
        number: current.number != null ? Number(current.number) : null,
        title: d?.title != null ? String(d.title).slice(0, 120) : null,
        loadStage: loadStage
          ? {
              phase: loadStage.phase || null,
              label: loadStage.label || null,
              busy: Boolean(loadStage.busy),
              percent:
                loadStage.percent != null ? Number(loadStage.percent) : null,
            }
          : null,
        loadBusy,
        sideSettled: { ...(current.sideSettled || {}) },
        sidePending: { ...(current.sidePending || {}) },
        filesCount: files.length,
        filesBodiesOk,
        filesReady: filesBodiesOk,
        shellReady,
        metaReady,
        // Full open progress done (bar cleared) + optional files for Diff.
        ready: metaReady,
        readyWithFiles: metaReady && filesBodiesOk,
      };
      // Content-script world is isolated from page eval (agent-browser).
      // Always stamp the **page DOM** so e2e can read readiness without CDP
      // world bridging. window.__prpE2eLoad is best-effort for same-world tools.
      try {
        (globalThis as any).__prpE2eLoad = snap;
        (globalThis as any).__prpE2eLoadSeq = snap.seq;
      } catch {
        /* ignore */
      }
      try {
        const host =
          document.getElementById('prp-page-embed') ||
          document.getElementById(HOST_ID);
        if (host) {
          host.setAttribute('data-prp-load-seq', String(snap.seq));
          host.setAttribute('data-prp-load-busy', loadBusy ? '1' : '0');
          host.setAttribute('data-prp-meta-ready', snap.metaReady ? '1' : '0');
          host.setAttribute('data-prp-files-ready', snap.filesReady ? '1' : '0');
          host.setAttribute(
            'data-prp-files-count',
            String(snap.filesCount || 0)
          );
          if (snap.number != null) {
            host.setAttribute('data-prp-load-number', String(snap.number));
          }
          // Host milestone truth for e2e / hard-reopen diagnostics.
          try {
            const ms = d?.milestone;
            host.setAttribute(
              'data-prp-milestone',
              ms == null
                ? 'null'
                : String(ms.title || ms.number || 'obj').slice(0, 80)
            );
          } catch {
            /* ignore */
          }
          // Compact JSON for probeLoad() — page-visible attribute.
          try {
            host.setAttribute(
              'data-prp-e2e-load',
              JSON.stringify({
                seq: snap.seq,
                number: snap.number,
                loading: snap.loading,
                loadBusy: snap.loadBusy,
                metaReady: snap.metaReady,
                filesReady: snap.filesReady,
                filesCount: snap.filesCount,
                ready: snap.ready,
                readyWithFiles: snap.readyWithFiles,
                phase: snap.loadStage?.phase || null,
                reason: snap.reason,
              })
            );
          } catch {
            /* ignore */
          }
        }
        // Also stamp documentElement so eval works even if host id changes
        try {
          document.documentElement.setAttribute(
            'data-prp-meta-ready',
            snap.metaReady ? '1' : '0'
          );
          document.documentElement.setAttribute(
            'data-prp-files-ready',
            snap.filesReady ? '1' : '0'
          );
          document.documentElement.setAttribute(
            'data-prp-load-busy',
            loadBusy ? '1' : '0'
          );
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }
      try {
        globalThis.dispatchEvent?.(
          new CustomEvent('prp-e2e-load', { detail: snap })
        );
      } catch {
        /* ignore */
      }
      return snap;
    } catch {
      return null;
    }
  }

  /** Project isolated store → flat detail for React / cache. */
  function publishDetailFromStore() {
    const S = detailStoreApi();
    if (!S || !current.detailStore) {
      return current.detail;
    }
    current.detail = S.toAppDetail(current.detailStore);
    // Mirror settled from store. Do NOT map !settled → pending:true —
    // files/commits are intentionally deferred (settled:false, idle) until
    // ensureAll*; treating them as pending made aside "Loading…" forever
    // every time another side published.
    const settled = S.sideSettledFlags(current.detailStore);
    current.sideSettled = { ...emptySideFlags(), ...settled };
    const prevPending = current.sidePending || emptySideFlags();
    current.sidePending = {
      commits: settled.commits ? false : Boolean(prevPending.commits),
      checks: settled.checks ? false : Boolean(prevPending.checks),
      development: settled.development
        ? false
        : Boolean(prevPending.development),
      files: settled.files ? false : Boolean(prevPending.files),
      comments: settled.comments ? false : Boolean(prevPending.comments),
      reviews: settled.reviews ? false : Boolean(prevPending.reviews),
    };
    try {
      publishE2eLoadHook('publishDetailFromStore');
    } catch {
      /* ignore */
    }
    return current.detail;
  }

  /** Ensure store exists; hydrate from flat seed when needed. */
  function ensureDetailStore(seedFlat = null) {
    const S = detailStoreApi();
    if (!S) return null;
    if (!current.detailStore) {
      current.detailStore = seedFlat
        ? S.fromAppDetail(seedFlat)
        : S.createEmptyStore();
    }
    return current.detailStore;
  }

  /**
   * Hydrate/replace store from a full flat snapshot (list sketch / cache open).
   * Isolation starts after this; subsequent writes are slice-only.
   */
  function resetDetailStoreFromFlat(flat) {
    const S = detailStoreApi();
    if (!S) {
      current.detail = flat;
      current.detailStore = null;
      return flat;
    }
    current.detailStore = S.fromAppDetail(flat);
    return publishDetailFromStore();
  }

  /**
   * Legacy progressive merge when store API missing; otherwise prefer isolation.
   */
  function setDetailProgressive(next, opts = null) {
    if (!next || typeof next !== 'object') {
      current.detail = next;
      return current.detail;
    }
    const S = detailStoreApi();
    if (S && current.detailStore) {
      // Ambiguous full-object write: only apply meta (+ optional threads)
      S.applyMeta(current.detailStore, S.pickMeta(next), {
        source: next._source,
        sketch: next._sketch ? true : false,
        trustEmpty: Boolean(opts?.trustMetaEmpty),
      });
      if (
        (Array.isArray(next.reviewThreads) && next.reviewThreads.length) ||
        (Array.isArray(next.reviewComments) && next.reviewComments.length)
      ) {
        S.applyThreadsFromMergedDetail(current.detailStore, next);
      }
      return publishDetailFromStore();
    }
    current.detail = mergeDetailProgressive(current.detail, next, opts);
    return current.detail;
  }

  /**
   * Record a confirmed App meta write so later open/revalidate core GETs cannot
   * clobber labels (etc.) while GitHub/cache is still stale.
   */
  function notePeopleMetaAuthority(patch, identity: any = null) {
    const S = detailStoreApi();
    const build =
      typeof S?.buildPeopleMetaAuthority === 'function'
        ? S.buildPeopleMetaAuthority
        : null;
    if (!build) {
      // Fallback: minimal stamp when pure module lags rebuild
      if (!patch || typeof patch !== 'object') return;
      const keys = ['labels', 'assignees', 'requestedReviewers', 'milestone'];
      const fields: any = {};
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) fields[k] = patch[k];
      }
      if (!Object.keys(fields).length) return;
      const owner = identity?.owner ?? current.owner;
      const repo = identity?.repo ?? current.repo;
      const number = identity?.number ?? current.number;
      const n = Number(number);
      if (!Number.isFinite(n) || n <= 0) return;
      lastPeopleMetaAuthority = {
        owner: String(owner || '').toLowerCase(),
        repo: String(repo || '').toLowerCase(),
        number: n,
        gen: metaRefreshGen,
        at: Date.now(),
        fields: {
          ...(lastPeopleMetaAuthority &&
          Number(lastPeopleMetaAuthority.number) === n
            ? lastPeopleMetaAuthority.fields
            : {}),
          ...fields,
        },
      };
      persistPeopleMetaAuthority(lastPeopleMetaAuthority);
      return;
    }
    const owner = identity?.owner ?? current.owner;
    const repo = identity?.repo ?? current.repo;
    const number = identity?.number ?? current.number;
    const base =
      lastPeopleMetaAuthority &&
      Number(lastPeopleMetaAuthority.number) === Number(number)
        ? { ...lastPeopleMetaAuthority.fields }
        : {};
    const nextPatch = { ...base, ...patch };
    const auth = build(
      { owner, repo, number },
      nextPatch,
      { gen: metaRefreshGen, at: Date.now() }
    );
    if (auth) {
      lastPeopleMetaAuthority = auth;
      persistPeopleMetaAuthority(auth);
    }
  }

  /** Prefer last write-through people meta over a stale core GET. */
  function withPeopleMetaAuthority(coreFlat) {
    // Hydrate from sessionStorage if memory was wiped (force-close without host
    // closeModal, or a new content-script world). Soft reopen e2e relies on this.
    if (!lastPeopleMetaAuthority) {
      lastPeopleMetaAuthority = loadPeopleMetaAuthorityFromSession();
    }
    const S = detailStoreApi();
    const apply =
      typeof S?.applyPeopleMetaAuthorityToCore === 'function'
        ? S.applyPeopleMetaAuthorityToCore
        : null;
    if (!apply || !lastPeopleMetaAuthority || !coreFlat) return coreFlat;
    const { flat, fullyMatched } = apply(
      coreFlat,
      lastPeopleMetaAuthority,
      {
        owner: current.owner,
        repo: current.repo,
        number: current.number,
      }
    );
    // Keep authority for a short window after network matches so a subsequent
    // lagging null core cannot wipe the just-set milestone (soft reopen).
    if (fullyMatched) {
      const age = Date.now() - Number(lastPeopleMetaAuthority.at || 0);
      if (age > 30_000) {
        lastPeopleMetaAuthority = null;
        persistPeopleMetaAuthority(null);
      }
    }
    return flat || coreFlat;
  }

  function applyCoreToStore(coreFlat, opts: any = null) {
    const S = detailStoreApi();
    const metaGenAtStart =
      opts && Number.isFinite(opts.metaGenAtStart)
        ? Number(opts.metaGenAtStart)
        : null;
    const skipSupersedeMeta =
      metaGenAtStart != null && metaGenAtStart !== metaRefreshGen;
    // Session write-through shield (labels flash-then-gone on list→detail).
    let core = withPeopleMetaAuthority(coreFlat);
    if (!S) {
      let progressive = core;
      if (skipSupersedeMeta) {
        const strip =
          globalThis.PRModalDetailStore?.stripSupersededMetaFields;
        progressive =
          typeof strip === 'function' ? strip(core) : core;
      }
      return setDetailProgressive(progressive);
    }
    ensureDetailStore(current.detail);
    S.applyCorePayload(current.detailStore, core, {
      skipSupersedeMeta,
    });
    // Re-assert people-meta authority after core apply. Lagging REST null
    // milestone/labels must not stick when App just write-through confirmed.
    try {
      if (
        lastPeopleMetaAuthority &&
        Number(lastPeopleMetaAuthority.number) === Number(current.number) &&
        lastPeopleMetaAuthority.fields &&
        typeof S.applyMeta === 'function'
      ) {
        const age = Date.now() - Number(lastPeopleMetaAuthority.at || 0);
        if (age >= 0 && age < 120_000) {
          S.applyMeta(current.detailStore, lastPeopleMetaAuthority.fields, {
            trustEmpty: true,
            source: 'people-meta-authority-reassert',
            sketch: false,
          });
        }
      }
    } catch {
      /* ignore */
    }
    return publishDetailFromStore();
  }

  function applySideToStore(key, payload) {
    const S = detailStoreApi();
    if (!S || !current.detailStore) {
      return setDetailProgressive({
        ...payload,
        _sideSettled: {
          ...(current.detail?._sideSettled || {}),
          [key]: true,
        },
      });
    }
    if (key === 'files') {
      S.applyFiles(current.detailStore, payload.files, {
        settled: true,
        gitattributesText: payload.gitattributesText,
      });
    } else if (key === 'commits') {
      S.applyCommits(current.detailStore, payload.commits, { settled: true });
    } else if (key === 'comments') {
      S.applyComments(current.detailStore, payload.comments, {
        settled: true,
        pageMeta: payload.commentsMeta,
        timelineEvents: payload.timelineEvents,
      });
    } else if (key === 'reviews') {
      S.applyReviews(current.detailStore, payload.reviews, { settled: true });
    } else if (key === 'checks') {
      S.applyChecks(current.detailStore, payload.checks, { settled: true });
    } else if (key === 'development') {
      S.applyDevelopment(current.detailStore, payload, { settled: true });
    }
    return publishDetailFromStore();
  }

  function applyThreadsToStore(mergedFlat) {
    const S = detailStoreApi();
    if (!S) {
      // No store API: merge threads fields only when possible
      if (current.detail && mergedFlat) {
        current.detail = {
          ...current.detail,
          reviewThreads: mergedFlat.reviewThreads,
          reviewComments: mergedFlat.reviewComments,
          reviewThreadsMeta: mergedFlat.reviewThreadsMeta,
          reviewCommentsMeta: mergedFlat.reviewCommentsMeta,
          viewerPendingReview:
            mergedFlat.viewerPendingReview !== undefined
              ? mergedFlat.viewerPendingReview
              : current.detail.viewerPendingReview,
        };
        return current.detail;
      }
      current.detail = mergedFlat;
      return current.detail;
    }
    ensureDetailStore(current.detail || mergedFlat);
    S.applyThreadsFromMergedDetail(current.detailStore, mergedFlat);
    return publishDetailFromStore();
  }

  /**
   * Structured open-session fetch timeline for performance analysis.
   * - console: `[pr-plus][tl +Nms] start|end name …`
   * - globalThis.__PRP_FETCH_TIMELINE__ (content world)
   * - #prp-modal-host[data-prp-tl] JSON for page-world agent-browser eval
   */
  let activeFetchTimeline = null;

