// TypeScript SoT — assembled by build scripts (classic runtime JS emit)

  function runOpenModalBody({
    owner,
    repo,
    number,
    page = null,
    position = null,
    presentation = null,
    commitSha = null,
    commitEndSha = null,
    filePath = null,
    fileKey = null,
    startLine = null,
    endLine = null,
    side = null,
  }) {

    if (!hostEnabled) return Promise.resolve({ ok: false, reason: 'disabled' });
    try {
      if (typeof closePullsPalette === 'function') closePullsPalette();
    } catch {
      /* ignore */
    }
    void refreshPrefs();
    ensurePrefsWatch();
    void ensureAssets();
    const key = detailKey(owner, repo, number);
    // without closeModal), restamp cache from live detail so soft reopen after
    // a milestone write does not fall back to a pre-write list sketch.
    try {
      if (
        current?.open &&
        Number(current.number) === Number(number) &&
        current.detail &&
        typeof current.detail === 'object'
      ) {
        detailCache.set(key, current.detail);
      }
    } catch {
      /* ignore */
    }
    const { gen, signal, metaGenAtStart } = beginOpenFetchSession();
    // Hydrate people-meta authority from sessionStorage before first paint.
    try {
      if (
        (!lastPeopleMetaAuthority ||
          Number(lastPeopleMetaAuthority.number) !== Number(number)) &&
        typeof loadPeopleMetaAuthorityFromSession === 'function'
      ) {
        const hydrated = loadPeopleMetaAuthorityFromSession();
        if (hydrated && Number(hydrated.number) === Number(number)) {
          lastPeopleMetaAuthority = hydrated;
        }
      }
    } catch {
      /* ignore */
    }
    // chrome.storage.session hydrate (async): hard reopen clears page
    // sessionStorage but keeps extension session write-through — reassert when
    // the bag arrives so first hard open paints modal-set milestone without
    // waiting on lagging REST.
    try {
      if (typeof loadPeopleMetaAuthorityFromChromeSession === 'function') {
        const openGenSnap = detailFetchGen;
        void loadPeopleMetaAuthorityFromChromeSession().then((chromeAuth) => {
          try {
            if (
              openGenSnap !== detailFetchGen ||
              !current.open ||
              Number(current.number) !== Number(number)
            ) {
              return;
            }
            if (
              !chromeAuth ||
              Number(chromeAuth.number) !== Number(number)
            ) {
              return;
            }
            lastPeopleMetaAuthority = chromeAuth;
            // Mirror into page sessionStorage for subsequent soft reopens.
            try {
              persistPeopleMetaAuthority(chromeAuth);
            } catch {
              /* ignore */
            }
            const S = detailStoreApi();
            const fields = chromeAuth.fields || {};
            if (
              S?.applyMeta &&
              current.detailStore &&
              fields &&
              Object.keys(fields).length
            ) {
              S.applyMeta(current.detailStore, fields, {
                trustEmpty: true,
                source: 'people-meta-authority-chrome-session',
                sketch: false,
              });
              publishDetailFromStore();
              render();
              console.log(
                `[pr-plus] openModal people-meta chrome.session hydrate ${owner}/${repo}#${number} ` +
                  `ms=${fields.milestone?.title || fields.milestone?.number || '—'}`
              );
            }
          } catch {
            /* ignore */
          }
        });
      }
    } catch {
      /* ignore */
    }
    // Drop people-meta clear shields on a fresh open so external re-assigns /
    // milestone restores (and reverse e2e) are not blocked by a recent clear.
    try {
      if (
        typeof lastPeopleMetaAuthority !== 'undefined' &&
        lastPeopleMetaAuthority &&
        Number(lastPeopleMetaAuthority.number) === Number(number)
      ) {
        const fields = lastPeopleMetaAuthority.fields || {};
        const nextFields: Record<string, unknown> = { ...fields };
        let changed = false;
        for (const k of Object.keys(nextFields)) {
          const v = nextFields[k];
          const empty =
            k === 'milestone'
              ? v == null
              : Array.isArray(v)
                ? v.length === 0
                : !v;
          // Keep non-empty write-throughs; drop empty clear shields on open.
          if (empty) {
            delete nextFields[k];
            changed = true;
          }
        }
        if (changed) {
          lastPeopleMetaAuthority = Object.keys(nextFields).length
            ? { ...lastPeopleMetaAuthority, fields: nextFields }
            : null;
          if (typeof persistPeopleMetaAuthority === 'function') {
            persistPeopleMetaAuthority(lastPeopleMetaAuthority);
          }
        }
      }
    } catch {
      /* ignore */
    }

    // Stack strip needs open PR list. List page has it cached; PR-page embed does
    // not — fetch in background so Stack/header parity matches fullscreen.
    void ensureOpenPullsForStack(owner, repo, { signal });

    // Resolve presentation: explicit > path-based embed > keep current if same PR > modal
    const pathTarget = parsePrPagePath(
      typeof location !== 'undefined' ? location.pathname : ''
    );
    let resolvedPresentation = 'modal';
    if (presentation === 'embed' || presentation === 'modal') {
      resolvedPresentation = presentation;
    } else if (
      pathTarget &&
      String(pathTarget.owner).toLowerCase() === String(owner).toLowerCase() &&
      String(pathTarget.repo).toLowerCase() === String(repo).toLowerCase() &&
      Number(pathTarget.number) === Number(number)
    ) {
      resolvedPresentation = 'embed';
    } else if (
      current.open &&
      isEmbedPresentation(current.presentation) &&
      String(current.owner).toLowerCase() === String(owner).toLowerCase() &&
      String(current.repo).toLowerCase() === String(repo).toLowerCase() &&
      Number(current.number) === Number(number)
    ) {
      resolvedPresentation = 'embed';
    }
    // Switching overlay ↔ embed needs a clean host + fresh React root
    if (
      current.open &&
      isEmbedPresentation(current.presentation) !==
        isEmbedPresentation(resolvedPresentation)
    ) {
      dropReactRoot();
      if (isEmbedPresentation(current.presentation)) restoreNativeMain();
    }
    current.presentation = resolvedPresentation;

    // Progressive sources (fast → slow):
    //   1) list sketch (pulls page cache — title/body already available)
    //   2) memory cache
    //   3) IDB (async, non-blocking)
    //   4) network core + threads
    const listPr = findListPr(owner, repo, number);
    const listSketch = detailSketchFromList(listPr, owner, repo, number);

    // 1) Sync memory paint first (never block on IDB).
    // Drop a warm memory entry when its title/body/milestone clearly lags a
    // list sketch from the live pulls page (external edit / reverse write).
    let peeked = peekDetailMemory(key);
    let cached = peeked.value || null;
    if (cached && listSketch) {
      try {
        const cTitle = String(cached.title || '').trim();
        const lTitle = String(listSketch.title || '').trim();
        const cMs = cached.milestone?.title || cached.milestone?.number || '';
        const lMs =
          listSketch.milestone?.title || listSketch.milestone?.number || '';
        if (
          (lTitle && cTitle && lTitle !== cTitle) ||
          (lMs && String(cMs) !== String(lMs))
        ) {
          try {
            if (typeof detailCache.invalidate === 'function') {
              detailCache.invalidate(key);
            } else if (typeof detailCache.delete === 'function') {
              detailCache.delete(key);
            }
          } catch {
            /* ignore */
          }
          cached = null;
          peeked = { value: null, fresh: false, stale: false, source: null };
        }
      } catch {
        /* ignore */
      }
    }
    let fromCache = Boolean(cached);
    const fromList = !fromCache && Boolean(listSketch);
    // Prefer real cache over list sketch; else sketch; else empty
    let initialDetail = cached || listSketch || null;
    // Overlay last confirmed people-meta write onto first paint. Soft reopen
    // after modal milestone/assignee set must not flash "No milestone" while
    // list-sketch/cache lag GitHub (session authority survives closeModal).
    try {
      if (
        typeof lastPeopleMetaAuthority !== 'undefined' &&
        lastPeopleMetaAuthority &&
        Number(lastPeopleMetaAuthority.number) === Number(number)
      ) {
        const fields = lastPeopleMetaAuthority.fields || {};
        if (fields && typeof fields === 'object' && Object.keys(fields).length) {
          if (!initialDetail) {
            // Authority seed only — empty title until network (no PR #N fake).
            initialDetail = {
              owner: String(owner || ''),
              repo: String(repo || ''),
              number: Number(number),
              title: '',
              body: '',
              labels: [],
              assignees: [],
              requestedReviewers: [],
              milestone: null,
              _sketch: true,
              _source: 'people-meta-authority',
              ...fields,
            };
          } else {
            initialDetail = {
              ...initialDetail,
              ...fields,
              _sketch: initialDetail._sketch,
            };
          }
        }
      }
    } catch {
      /* ignore */
    }

    // Explicit page (stack nav) > path tab (embed) > keep current view > default conversation
    const ghLoc =
      isEmbedPresentation(resolvedPresentation) ||
      (pathTarget &&
        String(pathTarget.owner).toLowerCase() === String(owner).toLowerCase() &&
        String(pathTarget.repo).toLowerCase() === String(repo).toLowerCase() &&
        Number(pathTarget.number) === Number(number))
        ? parseGithubLocation()
        : null;
    const resolvedPage =
      page === 'diff' || page === 'conversation'
        ? page
        : pathTarget &&
            isEmbedPresentation(resolvedPresentation) &&
            (pathTarget.page === 'diff' || pathTarget.page === 'conversation')
          ? pathTarget.page
          : current.open &&
              (current.routePage === 'diff' || current.routePage === 'conversation')
            ? current.routePage
            : page || null;

    const resolvedCommitSha =
      commitSha != null
        ? commitSha
        : ghLoc?.commitSha != null
          ? ghLoc.commitSha
          : pathTarget?.commitSha != null
            ? pathTarget.commitSha
            : null;
    const resolvedCommitEndSha =
      commitEndSha != null
        ? commitEndSha
        : ghLoc?.commitEndSha != null
          ? ghLoc.commitEndSha
          : pathTarget?.commitEndSha != null
            ? pathTarget.commitEndSha
            : null;
    const resolvedFilePath = filePath != null ? filePath : ghLoc?.filePath || null;
    const resolvedFileKey = fileKey != null ? fileKey : ghLoc?.fileKey || null;
    const resolvedStartLine =
      startLine != null ? startLine : ghLoc?.startLine ?? null;
    const resolvedEndLine = endLine != null ? endLine : ghLoc?.endLine ?? null;
    const resolvedSide = side != null ? side : ghLoc?.side || null;

    // Side panels: if we already have cached data, mark settled so revalidate
    // does not flash section skeletons over real content.
    const initialSideSettled = sideSettledFromDetail(initialDetail);
    const fetchTl = beginFetchTimeline(
      `open ${owner}/${repo}#${number}` +
        (fromCache ? ' cache' : fromList ? ' list' : ' cold')
    );
    fetchTl.mark('first-paint-source', 'mark', {
      note: fromCache
        ? `cache:${peeked?.source || 'memory'}`
        : fromList
          ? 'list-sketch'
          : 'empty',
      hasDetail: Boolean(initialDetail),
    });
    current = {
      open: true,
      // Only block whole UI when we have nothing to show yet
      loading: !initialDetail,
      error: null,
      detail: initialDetail,
      detailStore: null,
      owner,
      repo,
      number,
      routePage: resolvedPage,
      routePosition: position || null,
      routeCommitSha: resolvedCommitSha,
      routeCommitEndSha: resolvedCommitEndSha,
      routeFilePath: resolvedFilePath,
      routeFileKey: resolvedFileKey,
      routeStartLine: resolvedStartLine,
      routeEndLine: resolvedEndLine,
      routeSide: resolvedSide,
      presentation: resolvedPresentation,
      sidePending: emptySideFlags(),
      sideSettled: initialSideSettled,
      loadStage: {
        phase: fromCache ? 'revalidate' : fromList ? 'core' : 'core',
        label: fromCache
          ? loadStageLabel('revalidate')
          : fromList
            ? loadStageLabel('core-full')
            : loadStageLabel('core'),
        busy: true,
        // Start at unit weight floor; parallel fetches mark up as each resolves
        percent: fetchUnitWeights().start || 5,
      },
    };
    // Modal + full-page embed: reset activity clock and ensure head.sha poller
    try {
      armAutoRefreshForOpen();
    } catch {
      /* ignore */
    }
    // Isolated slice store — subsequent core/side/threads writes never clobber
    // other domains. Flat `detail` is a projection for React.
    if (initialDetail) {
      resetDetailStoreFromFlat(initialDetail);
      current.sideSettled = {
        ...emptySideFlags(),
        ...sideSettledFromDetail(current.detail),
      };
      current.sidePending = emptySideFlags();
      // Pending only for sides that auto-fetch on open. files/commits are lazy
      // (aside first-open / Diff ensureAll*) — do not spin "Loading…" while idle.
      const autoFetchSides = new Set([
        'comments',
        'reviews',
        'checks',
        'development',
      ]);
      for (const k of Object.keys(current.sideSettled)) {
        if (current.sideSettled[k]) {
          current.sidePending[k] = false;
        } else if (autoFetchSides.has(k)) {
          current.sidePending[k] = true;
        } else {
          current.sidePending[k] = false;
        }
      }
    }
    persistOpenModal(owner, repo, number, {
      page: resolvedPage,
      position,
    });
    writeUriRoute({
      page: resolvedPage || 'conversation',
      number,
      position,
      commitSha: resolvedCommitSha,
      commitEndSha: resolvedCommitEndSha,
      filePath: resolvedFilePath,
      fileKey: resolvedFileKey,
      startLine: resolvedStartLine,
      endLine: resolvedEndLine,
      side: resolvedSide,
    });
    render();

    if (fromCache) {
      console.log(
        `[pr-plus] openModal cache-hit ${owner}/${repo}#${number} ` +
          `source=${peeked.source || 'memory'} fresh=${Boolean(peeked.fresh)}`
      );
    } else if (fromList) {
      console.log(
        `[pr-plus] openModal list-sketch ${owner}/${repo}#${number} ` +
          `title=${JSON.stringify(String(listSketch.title || '').slice(0, 60))}`
      );
    }

    // ── First paint is done (list sketch / cache / empty skeleton). ──
    // Everything below upgrades asynchronously and must not delay click→visible.

    // 2) Background IDB hydrate (timeout) — only if memory miss
    //    Upgrades list-sketch → IDB snapshot; must not delay network.
    const idbHydrateP = !fromCache
      ? peekDetailIdb(key, 400).then((idbPeek) => {
          if (gen !== detailFetchGen) return null;
          if (
            !(
              current.open &&
              current.owner === owner &&
              current.repo === repo &&
              Number(current.number) === Number(number)
            )
          ) {
            return null;
          }
          const v = idbPeek?.value || null;
          if (!v) return null;
          const curRank = detailRank(current.detail);
          const idbRank = detailRank(v);
          // Network already delivered richer data — keep IDB only for thread preserve
          if (curRank >= 2 && !current.detail?._sketch) {
            return v;
          }
          // Upgrade empty / list-sketch → IDB
          if (idbRank > curRank || (current.detail?._sketch && idbRank >= 2)) {
            cached = v;
            fromCache = true;
            peeked = idbPeek;
            resetDetailStoreFromFlat(v);
            current.loading = false;
            current.error = null;
            setLoadStage('revalidate', loadStageLabel('revalidate'), true);
            render();
            console.log(
              `[pr-plus] openModal cache-hit ${owner}/${repo}#${number} source=idb (upgraded from ${
                curRank <= 1 ? 'list/empty' : 'partial'
              })`
            );
          }
          return v;
        })
      : Promise.resolve(cached);

    return (async () => {
    try {
      if (!globalThis.PRTreeFetch?.fetchPrDetail) {
        throw new Error('PR detail bridge unavailable');
      }

      function isAbortErr(err) {
        return (
          err?.name === 'AbortError' ||
          /aborted|AbortError/i.test(String(err?.message || err || ''))
        );
      }

      async function fetchDetailOnce(opts) {
        let lastErr;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (signal.aborted || gen !== detailFetchGen) {
            const e = new Error('The operation was aborted.');
            e.name = 'AbortError';
            throw e;
          }
          try {
            return await globalThis.PRTreeFetch.fetchPrDetail(owner, repo, number, {
              ...opts,
              signal,
            });
          } catch (err) {
            if (isAbortErr(err)) throw err;
            lastErr = err;
            const msg = String(err?.message || err || '');
            // Context invalidation cannot be fixed by retry — page refresh required
            if (
              /Extension context invalidated|Extension was reloaded/i.test(msg)
            ) {
              throw err;
            }
            if (
              attempt === 0 &&
              /message channel closed|Receiving end does not exist|Background worker offline/i.test(
                msg
              )
            ) {
              await new Promise((r) => setTimeout(r, 200));
              continue;
            }
            throw err;
          }
        }
        throw lastErr || new Error('Failed to fetch PR detail');
      }

      // Prefs may still be warming; do not re-await for first network phase
      if (!prefsReady) await refreshPrefs();
      ensurePrefsWatch();
      const fastReview = prefs.fastReview !== false;

      // Phase 1+2 kickoff: core + threads in parallel. Progress bar advances
      // inside each promise's completion (order-independent), not only at the end.
      const openStill = () =>
        gen === detailFetchGen &&
        current.open &&
        current.owner === owner &&
        current.repo === repo &&
        Number(current.number) === Number(number);
      const prog = beginFetchProgress(gen, openStill);
      const uw = prog.weights;
      const corePhase = fromCache ? 'revalidate' : 'core';
      const coreLabel = fromCache
        ? loadStageLabel('revalidate')
        : fromList
          ? loadStageLabel('core-full')
          : loadStageLabel('core');
      prog.mark('start', uw.start, corePhase, coreLabel);

      const tCore0 =
        typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now();
      // Let IDB finish (or time out) without blocking core fetch
      void idbHydrateP;

      const apiMax =
        Number(globalThis.PRModalReviewThreads?.REVIEW_THREADS_PAGE_SIZE) || 100;
      const canFetchThreads = Boolean(
        globalThis.PRTreeFetch.fetchReviewThreadsPage
      );
      const mergeFn =
        globalThis.PRTreeFetch.mergeReviewThreadsPageIntoDetail || null;
      /** @type {any} */
      let earlyThreadsPage = null;
      let corePainted = false;
      let threadsPaintedEarly = false;

      /** Merge SWR preserve fields from cache into network core detail. */
      function mergeCoreWithCache(raw, cacheSnap) {
        let detail = raw;
        const idb =
          typeof globalThis !== 'undefined'
            ? (globalThis as any).PRModalDetailIdb
            : null;
        const sameHead =
          typeof idb?.sameHeadSha === 'function'
            ? Boolean(idb.sameHeadSha(cacheSnap?.headSha, raw?.headSha))
            : (() => {
                const a = String(cacheSnap?.headSha || '')
                  .trim()
                  .toLowerCase();
                const b = String(raw?.headSha || '')
                  .trim()
                  .toLowerCase();
                return Boolean(a && b && a === b);
              })();
        const reuse =
          typeof idb?.mayReuseFilesCommitsDiff === 'function'
            ? idb.mayReuseFilesCommitsDiff(cacheSnap, raw)
            : {
                sameHead,
                reuseFiles: sameHead,
                reuseCommits: sameHead,
                reason: sameHead ? 'reuse' : 'head-mismatch',
              };

        if (
          cacheSnap &&
          Array.isArray(cacheSnap.reviewComments) &&
          cacheSnap.reviewComments.length &&
          (!Array.isArray(detail.reviewComments) || !detail.reviewComments.length)
        ) {
          detail = {
            ...detail,
            reviewComments: cacheSnap.reviewComments,
            reviewThreads: cacheSnap.reviewThreads || detail.reviewThreads,
            reviewThreadsMeta:
              cacheSnap.reviewThreadsMeta || detail.reviewThreadsMeta,
            reviewCommentsMeta:
              cacheSnap.reviewCommentsMeta || detail.reviewCommentsMeta,
            comments:
              Array.isArray(detail.comments) && detail.comments.length
                ? detail.comments
                : cacheSnap.comments || detail.comments,
          };
        }
        // Same headSha only: keep usable Diff bodies from cache when network
        // core is empty/slim. Different head → never re-attach stale patches.
        if (
          reuse.reuseFiles &&
          cacheSnap &&
          Array.isArray(cacheSnap.files) &&
          cacheSnap.files.length
        ) {
          const netFiles = Array.isArray(detail.files) ? detail.files : [];
          const cachedHasPatches = cacheSnap.files.some(
            (f) =>
              f &&
              typeof f.patch === 'string' &&
              f.patch.length > 0 &&
              !f._patchOmitted
          );
          const netHasPatches = netFiles.some(
            (f) =>
              f &&
              typeof f.patch === 'string' &&
              f.patch.length > 0 &&
              !f._patchOmitted
          );
          const netSlim =
            netFiles.length > 0 &&
            (netFiles.some((f) => f && f._patchOmitted) || !netHasPatches);
          if (cachedHasPatches && (netFiles.length === 0 || netSlim)) {
            detail = { ...detail, files: cacheSnap.files };
          }
        }
        if (
          reuse.reuseCommits &&
          cacheSnap &&
          Array.isArray(cacheSnap.commits) &&
          cacheSnap.commits.length &&
          (!Array.isArray(detail.commits) || !detail.commits.length)
        ) {
          detail = { ...detail, commits: cacheSnap.commits };
        }
        if (detail && typeof detail === 'object') {
          detail = {
            ...detail,
            _sketch: undefined,
            _source: 'network',
            _cacheReuse: {
              sameHead: Boolean(reuse.sameHead),
              reuseFiles: Boolean(reuse.reuseFiles),
              reuseCommits: Boolean(reuse.reuseCommits),
              reason: String(reuse.reason || ''),
            },
          };
        }
        return detail;
      }

      /** Immediate partial paint when core fetch resolves (do not wait for threads/IDB). */
      function paintCoreNow(raw) {
        if (!openStill() || !raw) return null;
        // Diagnostics: raw network milestone vs post-apply host detail.
        // Stamp both modal host and page-embed (viaUrl hard reopen uses embed).
        try {
          const rawMs = raw?.milestone;
          const label =
            rawMs == null
              ? 'null'
              : String(rawMs.title || rawMs.number || 'obj').slice(0, 80);
          const br = `${raw?.baseRef || '∅'}←${raw?.headRef || '∅'}`;
          for (const id of [HOST_ID, embedHostId()]) {
            try {
              const el = document.getElementById(id);
              el?.setAttribute?.('data-prp-raw-ms', label);
              el?.setAttribute?.('data-prp-raw-branches', br);
            } catch {
              /* ignore */
            }
          }
          document.documentElement?.setAttribute?.('data-prp-raw-ms', label);
          document.documentElement?.setAttribute?.('data-prp-raw-branches', br);
        } catch {
          /* ignore */
        }
        // Core writes meta slice only (via applyCorePayload) — never empties
        // files/commits/reviews that other fetches own.
        const fromNetwork = mergeCoreWithCache(raw, cached);
        // Capture reuse decision before applyCore (store flatten may drop _cacheReuse).
        const reuseMetaSnap = fromNetwork?._cacheReuse
          ? { ...fromNetwork._cacheReuse }
          : null;
        ensureDetailStore(current.detail);
        applyCoreToStore(fromNetwork, { metaGenAtStart });
        // Prefer network identity meta even when a warm cache/IDB shell painted
        // first with stale title/body/milestone (external GH edits, reverse e2e).
        // applyCorePayload already merges, but skipSupersedeMeta mid-open or a
        // residual people-meta clear can leave store behind REST truth.
        try {
          const S = detailStoreApi();
          if (S?.applyMeta && current.detailStore && raw) {
            const force: Record<string, unknown> = {};
            for (const k of [
              'title',
              'body',
              'milestone',
              'state',
              'draft',
              'merged',
              'labels',
              'assignees',
              'requestedReviewers',
              // Branch identity — must not stay "—" after network core paints.
              'baseRef',
              'headRef',
              'baseSha',
              'headSha',
              'baseOwner',
              'baseRepo',
              'headOwner',
              'headRepo',
            ] as const) {
              if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
              const v = (raw as any)[k];
              // Never force-null milestone/title over a richer shell — a lagging
              // REST payload must not erase a just-written meta field. Empty
              // labels/assignees still win (cleared on GitHub).
              if (
                (k === 'milestone' || k === 'title' || k === 'body') &&
                (v == null || v === '')
              ) {
                continue;
              }
              force[k] = v;
            }
            if (Object.keys(force).length) {
              S.applyMeta(current.detailStore, force, {
                trustEmpty: true,
                source: 'network-core-force',
                sketch: false,
              });
              publishDetailFromStore();
            }
            // Always re-stamp identity meta from REST after core paint. Stale
            // IDB/list-sketch can leave title/milestone/assignees behind GitHub
            // after modal writes + hard reload (MB3/MB7 reverse e2e).
            const identity: Record<string, unknown> = {};
            if (raw.title != null && String(raw.title).trim() !== '') {
              identity.title = raw.title;
            }
            if (raw.body != null) identity.body = raw.body;
            // Prefer non-null network milestone; do not force-null over a richer
            // shell (lagging REST). Non-null always wins over stale IDB/list.
            if (raw.milestone != null) {
              identity.milestone = raw.milestone;
            }
            if (Array.isArray(raw.assignees)) identity.assignees = raw.assignees;
            if (Array.isArray(raw.labels)) identity.labels = raw.labels;
            if (Array.isArray(raw.requestedReviewers)) {
              identity.requestedReviewers = raw.requestedReviewers;
            }
            // Always stamp branch refs from REST when present (list sketch often omits).
            for (const k of [
              'baseRef',
              'headRef',
              'baseSha',
              'headSha',
              'baseOwner',
              'baseRepo',
              'headOwner',
              'headRepo',
            ] as const) {
              const v = (raw as any)[k];
              if (v != null && String(v).trim() !== '') identity[k] = v;
            }
            if (Object.keys(identity).length) {
              S.applyMeta(current.detailStore, identity, {
                // Empty assignees/labels/milestone must win on revalidate —
                // they are authoritative REST fields on the PR object.
                trustEmpty: true,
                source: 'network-core-identity',
                sketch: false,
              });
              publishDetailFromStore();
            }
            // Re-assert session people-meta after network identity. A lagging
            // null milestone on pull REST must not stick when modal just set it
            // (soft reopen e2e: GH has board, aside flashed "No milestone").
            try {
              if (
                typeof lastPeopleMetaAuthority !== 'undefined' &&
                lastPeopleMetaAuthority &&
                Number(lastPeopleMetaAuthority.number) === Number(number) &&
                lastPeopleMetaAuthority.fields
              ) {
                const age =
                  Date.now() - Number(lastPeopleMetaAuthority.at || 0);
                if (age >= 0 && age < 120_000) {
                  const authFields = lastPeopleMetaAuthority.fields || {};
                  const reassert: Record<string, unknown> = {};
                  for (const k of Object.keys(authFields)) {
                    const v = authFields[k];
                    const empty =
                      k === 'milestone'
                        ? v == null
                        : Array.isArray(v)
                          ? v.length === 0
                          : !v;
                    // Only shield non-empty writes (never re-clear on reopen).
                    if (!empty) reassert[k] = v;
                  }
                  if (Object.keys(reassert).length) {
                    S.applyMeta(current.detailStore, reassert, {
                      trustEmpty: true,
                      source: 'people-meta-authority-core-paint',
                      sketch: false,
                    });
                    publishDetailFromStore();
                  }
                }
              }
            } catch {
              /* ignore reassert */
            }
          }
        } catch {
          /* ignore force meta */
        }
        current.loading = false;
        current.error = null;
        const detail = current.detail;
        detailCache.set(key, detail);
        corePainted = true;
        prog.mark('core', uw.core, corePhase, coreLabel);
        setLoadStage(
          'threads',
          fromCache || detailRank(cached) >= 3
            ? loadStageLabel('threads-update')
            : loadStageLabel('threads-load'),
          true,
          { percent: Math.min(99, prog.percent()) }
        );
        tryFinishOpenProgress(prog);
        render();
        console.log(
          `[pr-plus] openModal phase=core-paint ${owner}/${repo}#${number} ` +
            `(prior=${fromCache ? 'cache' : fromList ? 'list' : 'empty'}) pct=${prog.percent()}`
        );
        // Under-shell list row must track network meta (incl. empty labels).
        // Without this, a prior optimistic write-through leaves stale chips while
        // the aside shows authoritative No labels (list-row-resync pre-state).
        try {
          if (
            typeof applyOpenDetailToListRow === 'function' &&
            detail &&
            Array.isArray(detail.labels)
          ) {
            applyOpenDetailToListRow({
              number,
              detail,
              forceLabels: true,
            });
          }
        } catch {
          /* ignore list write-through */
        }
        // Head moved vs cache: drop settled files/commits so Diff re-fetches.
        try {
          const reuseMeta = reuseMetaSnap || detail?._cacheReuse || null;
          const cacheSha = String(cached?.headSha || '')
            .trim()
            .toLowerCase();
          const liveSha = String(detail?.headSha || raw?.headSha || '')
            .trim()
            .toLowerCase();
          const headMismatch =
            Boolean(cacheSha && liveSha && cacheSha !== liveSha) ||
            reuseMeta?.reason === 'head-mismatch';
          if (headMismatch) {
            try {
              current._sideKickStarted?.delete?.('files');
              current._sideKickStarted?.delete?.('commits');
            } catch {
              /* ignore */
            }
            setSideFlag('files', { pending: false, settled: false }, {
              render: false,
            });
            setSideFlag('commits', { pending: false, settled: false }, {
              render: false,
            });
            console.log(
              `[pr-plus] openModal cache-reuse head-mismatch ${owner}/${repo}#${number} ` +
                `cache=${cacheSha.slice(0, 7)} live=${liveSha.slice(0, 7)} — re-fetch files/commits`
            );
          }
          // E2e / diagnostics: stamp reuse decision on hosts + documentElement
          const stamp =
            reuseMeta?.reuseFiles || reuseMeta?.reuseCommits
              ? 'reuse'
              : headMismatch
                ? 'mismatch'
                : String(reuseMeta?.reason || 'none');
          console.log(
            `[pr-plus] openModal cache-reuse ${owner}/${repo}#${number} ` +
              `stamp=${stamp} reason=${reuseMeta?.reason || '?'} ` +
              `files=${reuseMeta?.reuseFiles ? 1 : 0} commits=${reuseMeta?.reuseCommits ? 1 : 0}`
          );
          for (const id of [HOST_ID, embedHostId()]) {
            try {
              const el = document.getElementById(id);
              if (!el) continue;
              el.setAttribute('data-prp-cache-files', stamp);
              if (liveSha) {
                el.setAttribute('data-prp-head-sha', liveSha.slice(0, 12));
              }
              if (reuseMeta?.reason) {
                el.setAttribute(
                  'data-prp-cache-reuse-reason',
                  String(reuseMeta.reason).slice(0, 40)
                );
              }
            } catch {
              /* ignore */
            }
          }
          try {
            document.documentElement?.setAttribute?.(
              'data-prp-cache-files',
              stamp
            );
            if (liveSha) {
              document.documentElement?.setAttribute?.(
                'data-prp-head-sha',
                liveSha.slice(0, 12)
              );
            }
            if (reuseMeta?.reason) {
              document.documentElement?.setAttribute?.(
                'data-prp-cache-reuse-reason',
                String(reuseMeta.reason).slice(0, 40)
              );
            }
          } catch {
            /* ignore */
          }
        } catch {
          /* ignore */
        }
        // Independent panels — do not block conversation/threads
        kickIndependentSideFetches({
          owner,
          repo,
          number,
          headSha: detail.headSha || null,
          body: detail.body || '',
          gen,
          stillOpenFn: openStill,
          signal,
        });
        // If threads already landed, merge immediately (partial progressive UI)
        if (earlyThreadsPage && typeof mergeFn === 'function') {
          paintThreadsNewestNow(earlyThreadsPage);
        }
        return detail;
      }

      /**
       * Immediate partial paint when newest threads resolve — works against
       * cache/list core already on screen, without waiting for network core.
       */
      function stampThreadsDiag(page, extra: any = {}) {
        try {
          const nT = Array.isArray(page?.threads) ? page.threads.length : 0;
          const nC = Array.isArray(page?.comments) ? page.comments.length : 0;
          const src = page?.source != null ? String(page.source) : '';
          const payload = JSON.stringify({
            threads: nT,
            comments: nC,
            source: src || null,
            ...extra,
          }).slice(0, 400);
          for (const id of [HOST_ID, embedHostId()]) {
            try {
              const el = document.getElementById(id);
              if (!el) continue;
              el.setAttribute('data-prp-threads-count', String(nT));
              el.setAttribute('data-prp-threads-comments', String(nC));
              if (src) el.setAttribute('data-prp-threads-source', src);
              el.setAttribute('data-prp-threads-diag', payload);
            } catch {
              /* ignore */
            }
          }
        } catch {
          /* ignore */
        }
      }

      function paintThreadsNewestNow(page) {
        if (!openStill() || !page || typeof mergeFn !== 'function') return false;
        const nT = Array.isArray(page?.threads) ? page.threads.length : 0;
        const nC = Array.isArray(page?.comments) ? page.comments.length : 0;
        // Empty network page must not wipe cache/store threads (GraphQL=0 races).
        if (nT === 0 && nC === 0) {
          stampThreadsDiag(page, { painted: false, reason: 'empty-page' });
          return false;
        }
        const base = current.detail;
        // Need a real detail shell (cache or core) — not empty
        if (!base || typeof base !== 'object') {
          stampThreadsDiag(page, { painted: false, reason: 'no-base' });
          return false;
        }
        // Allow merge into sketch only if it has identity; prefer non-empty host
        const next = mergeFn(base, page, 'newest');
        if (!next) {
          stampThreadsDiag(page, { painted: false, reason: 'merge-null' });
          return false;
        }
        current.loading = false;
        // Threads merge only touches threads slice (via applyThreadsToStore)
        applyThreadsToStore(next);
        detailCache.set(key, current.detail);
        threadsPaintedEarly = true;
        setLoadStage(
          'threads',
          fromCache || detailRank(cached) >= 3
            ? loadStageLabel('threads-update')
            : loadStageLabel('threads-load'),
          true,
          { percent: Math.min(99, prog.percent()) }
        );
        render();
        stampThreadsDiag(page, {
          painted: true,
          storeThreads: Array.isArray(current.detail?.reviewThreads)
            ? current.detail.reviewThreads.length
            : 0,
          storeComments: Array.isArray(current.detail?.reviewComments)
            ? current.detail.reviewComments.length
            : 0,
        });
        console.log(
          `[pr-plus] openModal phase=threads.last-early-paint ${owner}/${repo}#${number} ` +
            `(${nT} threads, ${nC} comments, source=${page?.source || '?'}) pct=${prog.percent()}`
        );
        return true;
      }

      const tl = getFetchTimeline();
      const span =
        tl && typeof tl.span === 'function'
          ? (name: any, p: any, meta: any = undefined) => tl.span(name, p, meta)
          : (_n: any, p: any, _m: any = undefined) => p;

      // GraphQL shell newest window (page size 100, PRRT always).
      // Await IDB hydrate (≤~400ms) so list/empty opens can use warm cache when
      // durable threads already exist — first paint already happened above.
      try {
        await idbHydrateP;
      } catch {
        /* ignore */
      }
      // Snapshot cache at kickoff so match does not race with partial paints.
      const threadsCacheSnap = cached || current.detail || null;
      const useWarmThreads =
        Boolean(fromCache || detailRank(cached) >= 3) &&
        Boolean(threadsCacheSnap) &&
        !threadsCacheSnap?._sketch &&
        (typeof globalThis.PRModalReviewThreads?.hasUsableReviewThreadsCache ===
        'function'
          ? globalThis.PRModalReviewThreads.hasUsableReviewThreadsCache(
              threadsCacheSnap
            )
          : Boolean(
              (Array.isArray(threadsCacheSnap.reviewThreads) &&
                threadsCacheSnap.reviewThreads.some((t) => t?.threadNodeId)) ||
                (Array.isArray(threadsCacheSnap.reviewComments) &&
                  threadsCacheSnap.reviewComments.some((c) => c?.threadNodeId))
            ));
      const warmOrCache = fromCache || detailRank(cached) >= 3;
      const wShell = uw.threadsShell ?? uw.threadsNewest ?? 8;
      const wComments = uw.threadsComments ?? uw.threadsRemaining ?? 8;
      const wReactions = uw.threadsReactions ?? uw.threadsEarlier ?? 4;
      /** Credit review-thread ladder stages (idempotent via prog.mark). */
      const markThreadStage = (stage, labelKind) => {
        if (stage === 'shell') {
          prog.mark(
            'threadsShell',
            wShell,
            'threads',
            loadStageLabel(labelKind || 'threads-shell')
          );
        } else if (stage === 'comments' || stage === 'comments-start') {
          if (stage === 'comments-start') {
            setLoadStage(
              'threads',
              loadStageLabel('threads-comments'),
              true,
              { percent: prog.percent() }
            );
            try {
              render();
            } catch {
              /* ignore */
            }
            return;
          }
          prog.mark(
            'threadsComments',
            wComments,
            'threads',
            loadStageLabel(labelKind || 'threads-comments')
          );
        } else if (stage === 'reactions') {
          prog.mark(
            'threadsReactions',
            wReactions,
            'threads',
            loadStageLabel(labelKind || 'threads-reactions')
          );
        }
      };
      // Always credit with per-stage labels (never one shared kind for all three).
      const creditAllThreadStages = () => {
        markThreadStage('shell', 'threads-shell');
        markThreadStage('comments', 'threads-comments');
        markThreadStage('reactions', 'threads-reactions');
      };

      // Start threads in parallel with core — paint as soon as *this* fetch lands.
      // onStage fires shell → comments → reactions so the open bar steps.
      // Outer bound: nested shell/byIds timeouts can still stall on rAF yields
      // or un-raced awaits; never leave openModal threads in-flight forever.
      const THREADS_ADAPTIVE_BUDGET_MS = 18_000;
      const threadsAdaptiveP = canFetchThreads
        ? Promise.race([
            fetchNewestReviewThreadsAdaptive(owner, repo, number, {
              signal,
              cacheDetail: useWarmThreads ? threadsCacheSnap : null,
              // Cold open: GraphQL shell (not nested comments first:100).
              forceFull: false,
              onStage: (stage) => {
                if (!openStill()) return;
                if (stage === 'shell') {
                  // First ladder step: long "review threads" copy (matches product).
                  markThreadStage(
                    'shell',
                    warmOrCache ? 'threads-update' : 'threads-load'
                  );
                } else if (stage === 'comments-start') {
                  markThreadStage('comments-start');
                } else if (stage === 'comments') {
                  markThreadStage('comments', 'threads-comments');
                } else if (stage === 'reactions') {
                  markThreadStage('reactions', 'threads-reactions');
                }
              },
            }),
            new Promise((_, reject) => {
              setTimeout(() => {
                const err: any = new Error(
                  `threads adaptive budget ${THREADS_ADAPTIVE_BUDGET_MS}ms`
                );
                err.status = 408;
                reject(err);
              }, THREADS_ADAPTIVE_BUDGET_MS);
            }),
          ])
        : Promise.resolve(null);
      const threadsKickoffP = canFetchThreads
        ? span(
            'fetch.threadsNewest',
            threadsAdaptiveP
              .then((res) => {
                const page = res?.page;
                // Ensure all three stages credited even if onStage was skipped
                // (re-credit is label-safe: prog.mark no-ops when key already done).
                creditAllThreadStages();
                earlyThreadsPage = page;
                if (page) paintThreadsNewestNow(page);
                tl?.mark?.('paint.threadsNewest', 'mark', {
                  note: `${page?.threads?.length || 0} threads` +
                    (res?.earlyExit
                      ? ' warm-probe-exit'
                      : res?.escalated
                        ? ' warm-escalated'
                        : res?.hostRestFallback
                          ? ' host-rest-fallback'
                          : '') +
                    (res?.eagerCommentCount != null
                      ? ` eager=${res.eagerCommentCount}`
                      : ''),
                });
                console.log(
                  `[pr-plus] openModal threads.newest adaptive ${owner}/${repo}#${number}: ` +
                    `pageSize=${res?.pageSize} warm=${res?.warm} earlyExit=${res?.earlyExit} escalated=${res?.escalated} ` +
                    `hostRest=${Boolean(res?.hostRestFallback)} source=${page?.source || '?'} ` +
                    `threads=${page?.threads?.length || 0} comments=${page?.comments?.length || 0}` +
                    (res?.eagerCommentCount != null
                      ? ` eager=${res.eagerCommentCount}`
                      : '')
                );
                return {
                  ok: true,
                  page,
                  paintedEarly: threadsPaintedEarly,
                  adaptive: res,
                };
              })
              .catch((err) => {
                creditAllThreadStages();
                try {
                  for (const id of [HOST_ID, embedHostId()]) {
                    document
                      .getElementById(id)
                      ?.setAttribute?.(
                        'data-prp-threads-err',
                        String(err?.message || err || 'fail').slice(0, 200)
                      );
                  }
                } catch {
                  /* ignore */
                }
                return { ok: false, err };
              }),
            {
              pageSize: useWarmThreads
                ? Number(
                    globalThis.PRModalReviewThreads
                      ?.REVIEW_THREADS_WARM_PROBE_SIZE
                  ) || 10
                : apiMax,
              warm: useWarmThreads,
            }
          )
        : Promise.resolve({ ok: false, err: null, skipped: true }).then((r) => {
            creditAllThreadStages();
            return r;
          });

      // Core fetch: mark + partial paint on resolve (may finish before or after threads)
      const coreP = span(
        'fetch.core',
        fetchDetailOnce({ skipReviewThreads: true }).then((d) => {
          prog.mark('core', uw.core, corePhase, coreLabel);
          paintCoreNow(d);
          tl?.mark?.('paint.core', 'mark', {
            note: d?.title ? String(d.title).slice(0, 40) : 'core',
            headSha: d?.headSha ? String(d.headSha).slice(0, 7) : null,
          });
          return d;
        })
      );

      // Non-blocking IDB upgrade (must not delay core paint)
      void idbHydrateP
        .then((idbVal) => {
          if (!openStill() || !idbVal) return;
          if (!cached) cached = idbVal;
          if (detailRank(cached) < detailRank(idbVal)) cached = idbVal;
          // Upgrade sketch-only shell if network core not yet painted
          if (
            !corePainted &&
            current.detail &&
            (current.detail._sketch || detailRank(current.detail) < detailRank(idbVal))
          ) {
            resetDetailStoreFromFlat(idbVal);
            current.loading = false;
            render();
            if (earlyThreadsPage) paintThreadsNewestNow(earlyThreadsPage);
            // Side panels from cached headSha while core still in flight
            kickIndependentSideFetches({
              owner,
              repo,
              number,
              headSha: idbVal.headSha || null,
              body: idbVal.body || '',
              gen,
              stillOpenFn: openStill,
              signal,
            });
          }
        })
        .catch(() => {});

      // Kick independent panels ASAP (files/comments/reviews/commits/development).
      // Do not wait for core — only checks needs headSha (re-kicked from paintCoreNow).
      {
        const seed = cached || listSketch || initialDetail || null;
        kickIndependentSideFetches({
          owner,
          repo,
          number,
          headSha: seed?.headSha || null,
          body: seed?.body || '',
          gen,
          stillOpenFn: openStill,
          signal,
        });
      }

      let detail = await coreP;
      const coreMs = Math.round(
        (typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now()) - tCore0
      );
      console.log(
        `[pr-plus] openModal phase=core ${owner}/${repo}#${number}: ${coreMs}ms ` +
          (detail?._fetchTimings
            ? JSON.stringify(detail._fetchTimings)
            : '(no per-request timings)') +
          ` pct=${prog.percent()} painted=${corePainted}`
      );
      if (!openStill()) return;
      // Ensure core is on screen (paintCoreNow should have run; re-apply if aborted mid-flight)
      if (!corePainted && detail) {
        detail = paintCoreNow(detail) || detail;
      } else {
        detail = current.detail || detail;
      }

      // Milestone identity recovery: do NOT pass the open AbortSignal — side
      // finish / cancelAll races used to abort settle polls so hard reopen stuck
      // on "No milestone" while GH still had the board (MB3).
      async function fetchIdentityDetailLoose() {
        if (!globalThis.PRTreeFetch?.fetchPrDetail) return null;
        return globalThis.PRTreeFetch.fetchPrDetail(owner, repo, number, {
          skipReviewThreads: true,
          // no signal — best-effort identity recovery
        });
      }
      if (
        openStill() &&
        current.detail &&
        current.detail.milestone == null
      ) {
        try {
          const again = await fetchIdentityDetailLoose();
          if (openStill() && again?.milestone) {
            paintCoreNow(again);
            detail = current.detail || again;
            console.log(
              `[pr-plus] openModal phase=core-milestone-retry ${owner}/${repo}#${number} ` +
                `ms=${again.milestone?.title || again.milestone?.number || '?'}`
            );
          }
        } catch {
          /* soft */
        }
      }
      // Background settle within e2e 45s wait window.
      if (
        openStill() &&
        current.detail &&
        current.detail.milestone == null
      ) {
        const settleGen = gen;
        void (async () => {
          const delays = [400, 900, 1800, 3500, 7000, 12000, 18000];
          for (let i = 0; i < delays.length; i++) {
            await new Promise((r) => setTimeout(r, delays[i]));
            if (
              settleGen !== detailFetchGen ||
              !current.open ||
              Number(current.number) !== Number(number) ||
              current.detail?.milestone != null
            ) {
              return;
            }
            try {
              const again = await fetchIdentityDetailLoose();
              if (
                settleGen !== detailFetchGen ||
                !current.open ||
                Number(current.number) !== Number(number)
              ) {
                return;
              }
              if (again?.milestone) {
                paintCoreNow(again);
                console.log(
                  `[pr-plus] openModal phase=core-milestone-settle#${i + 1} ${owner}/${repo}#${number} ` +
                    `ms=${again.milestone?.title || again.milestone?.number || '?'}`
                );
                return;
              }
            } catch {
              /* soft */
            }
          }
        })();
      }

      // Phase 2: await parallel threads kickoff (may already be painted early)
      // - Cold open: dual-window (newest last:N + oldest first:20)
      // - Cache revalidate: REST newest (15) + optional bulk unresolved by PRRT ids
      if (canFetchThreads) {
        try {
          const nowMs = () =>
            typeof performance !== 'undefined' && performance.now
              ? performance.now()
              : Date.now();
          const tThreads0 = nowMs();
          // Revalidate path when we had durable cache (memory/IDB), not mere list sketch
          const useRevalidatePath = fromCache || detailRank(cached) >= 3;

          if (useRevalidatePath) {
            // —— Incremental revalidate ——
            if (current.loadStage?.busy) {
              setLoadStage(
                'threads',
                loadStageLabel('threads-shell'),
                true,
                { percent: Math.min(99, prog.percent()) }
              );
              render();
            }

            const tNewest0 = nowMs();
            const kick = await threadsKickoffP;
            if (!kick.ok) throw kick.err || new Error('Threads fetch failed');
            const newest = kick.page;
            const adapt = kick.adaptive || null;
            console.log(
              `[pr-plus] openModal phase=threads.last ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tNewest0
              )}ms (${newest?.threads?.length || 0} threads, parallel-kickoff` +
                (adapt
                  ? `, pageSize=${adapt.pageSize}, earlyExit=${adapt.earlyExit}, escalated=${adapt.escalated}`
                  : '') +
                `) pct=${prog.percent()} early=${Boolean(kick.paintedEarly || threadsPaintedEarly)}`
            );
            if (!openStill()) return;

            creditAllThreadStages();
            tryFinishOpenProgress(prog);

            const updatedIdSet = new Set(
              (newest?.threads || [])
                .map((t) => (t?.threadNodeId ? String(t.threadNodeId) : ''))
                .filter(Boolean)
            );

            // Re-merge if early paint raced before core, or not painted yet
            let next =
              typeof mergeFn === 'function'
                ? mergeFn(current.detail, newest, 'newest')
                : current.detail;

            applyThreadsToStore(next);
            detail = current.detail;
            detailCache.set(key, detail);
            render();

            // Remaining unresolved not in newest page (extra comments bulk).
            const RT =
              typeof globalThis !== 'undefined'
                ? globalThis.PRModalReviewThreads
                : null;
            const newestSource =
              newest?.source || adapt?.source || null;
            const skipByIds =
              typeof RT?.shouldSkipUnresolvedByIdsBulk === 'function'
                ? Boolean(
                    RT.shouldSkipUnresolvedByIdsBulk({
                      newestSource,
                      hostRestFallback: Boolean(adapt?.hostRestFallback),
                      forceFull: false,
                    })
                  )
                : String(newestSource || '').toLowerCase() === 'rest' ||
                  Boolean(adapt?.hostRestFallback);

            const collectIds =
              globalThis.PRTreeFetch.collectUnresolvedThreadNodeIds ||
              ((d) => {
                const ids = new Set();
                for (const t of d?.reviewThreads || []) {
                  if (t?.threadNodeId && !t.resolved) {
                    ids.add(String(t.threadNodeId));
                  }
                }
                return [...ids];
              });
            const filterRemaining =
              typeof RT?.remainingUnresolvedForByIdsBulk === 'function'
                ? (unresolved, updated, known) =>
                    RT.remainingUnresolvedForByIdsBulk(unresolved, updated, known)
                : (unresolved, updated, known) =>
                    (unresolved || []).filter((id) => {
                      const s = String(id);
                      if (!/^PRRT_/i.test(s)) return false;
                      return !updated.has(s) && !known.has(s);
                    });

            let unresolvedPass = 0;
            let didUnresolvedFetch = false;
            /** PRRT ids confirmed remote-missing this open — never re-fetch. */
            const knownMissing = new Set();
            if (skipByIds) {
              console.log(
                `[pr-plus] openModal phase=threads.unresolved-remaining ${owner}/${repo}#${number}: skipped by-id bulk`
              );
            }
            while (
              !skipByIds &&
              unresolvedPass < 2 &&
              typeof globalThis.PRTreeFetch.fetchReviewThreadsByIds === 'function'
            ) {
              unresolvedPass += 1;
              const remainingUnresolvedIds = filterRemaining(
                collectIds(next),
                updatedIdSet,
                knownMissing
              );
              if (!remainingUnresolvedIds.length) {
                if (unresolvedPass === 1) {
                  console.log(
                    `[pr-plus] openModal phase=threads.unresolved-remaining ${owner}/${repo}#${number}: skipped (0 remaining, last=${updatedIdSet.size})`
                  );
                }
                break;
              }
              didUnresolvedFetch = true;
              if (current.loadStage?.busy) {
                setLoadStage(
                  'threads',
                  loadStageLabel('threads-comments'),
                  true,
                  { percent: Math.min(99, prog.percent()) }
                );
                render();
              }
              const tBulk0 = nowMs();
              const bulk = await globalThis.PRTreeFetch.fetchReviewThreadsByIds(
                remainingUnresolvedIds,
                { signal }
              );
              const missingList = Array.isArray(bulk?.missingThreadIds)
                ? bulk.missingThreadIds
                : [];
              for (const id of missingList) knownMissing.add(String(id));
              const missingN = missingList.length;
              console.log(
                `[pr-plus] openModal phase=threads.unresolved-remaining ${owner}/${repo}#${number}: ${Math.round(
                  nowMs() - tBulk0
                )}ms (${bulk?.threads?.length || 0}/${remainingUnresolvedIds.length} ids, skipped last=${updatedIdSet.size}` +
                  (missingN ? `, dropped ${missingN} remote-missing` : '') +
                  `, pass ${unresolvedPass})`
              );
              if (gen !== detailFetchGen) return;
              if (
                current.open &&
                Number(current.number) === Number(number) &&
                typeof mergeFn === 'function' &&
                bulk
              ) {
                next = mergeFn(next, bulk, 'refresh');
              }
              if (!missingN) break;
            }

            // Kickoff already credited shell/comments/reactions; re-credit is no-op.
            creditAllThreadStages();
            console.log(
              `[pr-plus] openModal phase=threads(revalidate) ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tThreads0
              )}ms total pct=${prog.percent()} remaining=${didUnresolvedFetch ? 'fetched' : 'skip'}`
            );
            if (!openStill()) return;
            if (current.detail) {
              applyThreadsToStore(next);
              detail = current.detail;
              detailCache.set(key, detail);
              tryFinishOpenProgress(prog);
              render();
            }
          } else {
            // —— Cold open: newest shell(+eager) then optional oldest window ——
            const tNewest0 = nowMs();
            const kick = await threadsKickoffP;
            if (!kick.ok) throw kick.err || new Error('Threads fetch failed');
            const newest = kick.page;
            console.log(
              `[pr-plus] openModal phase=threads.last ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tNewest0
              )}ms (${newest?.threads?.length || 0} threads, parallel-kickoff) pct=${prog.percent()} early=${Boolean(kick.paintedEarly || threadsPaintedEarly)}`
            );
            let next = current.detail;
            if (openStill()) {
              next =
                typeof mergeFn === 'function'
                  ? mergeFn(current.detail, newest, 'newest')
                  : current.detail;

              applyThreadsToStore(next);
              detail = current.detail;
              next = detail;
              detailCache.set(key, detail);
              render();
            }

            const totalCount =
              typeof newest.totalCount === 'number'
                ? newest.totalCount
                : newest.threads?.length || 0;
            const newestLoaded = Array.isArray(newest.threads)
              ? newest.threads.length
              : 0;
            // Oldest window when GraphQL says more exist behind the newest page,
            // or totalCount exceeds what the newest window returned (even if
            // total < PAGE_SIZE due to a short adaptive probe).
            const needStartWindow =
              Boolean(newest.hasPreviousPage) ||
              (totalCount > newestLoaded && newestLoaded > 0);
            if (needStartWindow && openStill()) {
              try {
                setLoadStage(
                  'threads',
                  loadStageLabel('threads-shell'),
                  true,
                  { percent: prog.percent() }
                );
                render();
                const tOldest0 = nowMs();
                const oldest =
                  await globalThis.PRTreeFetch.fetchReviewThreadsPage(
                    owner,
                    repo,
                    number,
                    {
                      direction: 'oldest',
                      cursor: null,
                      pageSize:
                        Number(
                          globalThis.PRModalReviewThreads
                            ?.REVIEW_THREADS_PAGE_SIZE
                        ) || 100,
                      skipEagerComments: true,
                      signal,
                    }
                  );
                console.log(
                  `[pr-plus] openModal phase=threads.start ${owner}/${repo}#${number}: ${Math.round(
                    nowMs() - tOldest0
                  )}ms (${oldest?.threads?.length || 0} threads, total=${totalCount})`
                );
                if (openStill() && typeof mergeFn === 'function') {
                  next = mergeFn(next, oldest, 'oldest');
                }
              } catch {
                /* keep last-only window */
              }
            } else if (!needStartWindow) {
              console.log(
                `[pr-plus] openModal phase=threads.start ${owner}/${repo}#${number}: skipped (total=${totalCount} < ${apiMax})`
              );
            }
            creditAllThreadStages();
            console.log(
              `[pr-plus] openModal phase=threads ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tThreads0
              )}ms total pct=${prog.percent()} earlier=${needStartWindow ? 'fetched' : 'skip'}`
            );
            if (openStill() && current.detail) {
              applyThreadsToStore(next);
              detail = current.detail;
              detailCache.set(key, detail);
              tryFinishOpenProgress(prog);
              render();
            } else {
              tryFinishOpenProgress(prog);
            }

            // Full load when "가볍고 빠른 PR 검토" is off — drain remaining pages
            if (
              !fastReview &&
              gen === detailFetchGen &&
              current.open &&
              current.detail?.reviewThreadsMeta?.hasMore
            ) {
              try {
                const props = buildProps();
                if (typeof props.onLoadMoreReviewThreads === 'function') {
                  await props.onLoadMoreReviewThreads('all');
                }
              } catch {
                /* stage error already surfaced */
              }
            }
          }
        } catch (threadErr) {
          // Core already painted — keep it; surface soft stage error
          if (openStill()) {
            const failLabel = loadStageLabel('threads-failed', {
              message: threadErr?.message,
            });
            creditAllThreadStages();
            if (!tryFinishOpenProgress(prog)) {
              setLoadStage(
                'threads',
                failLabel,
                true,
                { percent: Math.min(99, prog.percent()) }
              );
            }
            render();
          }
        }
      } else {
        // No thread API — credit all thread units then settle
        creditAllThreadStages();
        tryFinishOpenProgress(prog);
        render();
      }
    } catch (err) {
      if (
        gen !== detailFetchGen ||
        err?.name === 'AbortError' ||
        /aborted|AbortError/i.test(String(err?.message || err || ''))
      ) {
        // Even when superseded mid-flight, do not early-return before optional
        // identity recovery if this gen is still current and milestone missing.
        if (gen !== detailFetchGen) return;
      }
      if (current.open && gen === detailFetchGen) {
        current.loading = false;
        if (!current.detail) {
          current.error = err?.message || String(err);
        }
        clearLoadStage();
        render();
        // Core threw (SW warm-up / channel) with sketch shell: still try REST
        // identity so hard reopen can paint milestone within settle window.
        if (
          current.detail &&
          current.detail.milestone == null &&
          globalThis.PRTreeFetch?.fetchPrDetail
        ) {
          const settleGen = gen;
          void (async () => {
            const delays = [500, 1500, 4000, 10000];
            for (let i = 0; i < delays.length; i++) {
              await new Promise((r) => setTimeout(r, delays[i]));
              if (
                settleGen !== detailFetchGen ||
                !current.open ||
                Number(current.number) !== Number(number) ||
                current.detail?.milestone != null
              ) {
                return;
              }
              try {
                const again = await globalThis.PRTreeFetch.fetchPrDetail(
                  owner,
                  repo,
                  number,
                  { skipReviewThreads: true }
                );
                if (
                  settleGen === detailFetchGen &&
                  current.open &&
                  Number(current.number) === Number(number) &&
                  again?.milestone
                ) {
                  try {
                    if (typeof paintCoreNow === 'function') {
                      paintCoreNow(again);
                    } else {
                      const S = detailStoreApi();
                      if (S?.applyMeta && current.detailStore) {
                        S.applyMeta(
                          current.detailStore,
                          { milestone: again.milestone },
                          {
                            trustEmpty: true,
                            source: 'network-core-milestone-catch-settle',
                            sketch: false,
                          }
                        );
                        publishDetailFromStore();
                        render();
                      }
                    }
                    console.log(
                      `[pr-plus] openModal catch-milestone-settle#${i + 1} ${owner}/${repo}#${number} ` +
                        `ms=${again.milestone?.title || again.milestone?.number || '?'}`
                    );
                  } catch {
                    /* soft */
                  }
                  return;
                }
              } catch {
                /* soft */
              }
            }
          })();
        }
      }
    }
    })(); // end background upgrade after sync first paint
  
  }
