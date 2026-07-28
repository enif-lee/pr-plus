// TypeScript SoT — assembled by build scripts (classic runtime JS emit)

  function openModal({
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
    // Dismiss pulls list palette if it was open (Esc-restore path is separate)
    try {
      if (typeof closePullsPalette === 'function') closePullsPalette();
    } catch {
      /* ignore */
    }
    // Prefs/CSS never block first paint (defaults + content_scripts CSS).
    void refreshPrefs();
    ensurePrefsWatch();
    void ensureAssets();
    const key = detailKey(owner, repo, number);
    // Abort any previous open's fetches, start a new cancelable session
    const { gen, signal } = beginOpenFetchSession();

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

    // 1) Sync memory paint first (never block on IDB)
    let peeked = peekDetailMemory(key);
    let cached = peeked.value || null;
    let fromCache = Boolean(cached);
    const fromList = !fromCache && Boolean(listSketch);
    // Prefer real cache over list sketch; else sketch; else empty
    let initialDetail = cached || listSketch || null;

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
    // Isolated slice store — subsequent core/side/threads writes never clobber
    // other domains. Flat `detail` is a projection for React.
    if (initialDetail) {
      resetDetailStoreFromFlat(initialDetail);
      current.sideSettled = {
        ...emptySideFlags(),
        ...sideSettledFromDetail(current.detail),
      };
      current.sidePending = emptySideFlags();
      // Pending = not yet settled
      for (const k of Object.keys(current.sideSettled)) {
        current.sidePending[k] = !current.sideSettled[k];
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

      const apiMax = 100;
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
        if (cacheSnap && Array.isArray(cacheSnap.files) && cacheSnap.files.length) {
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
          if (cachedHasPatches && !netHasPatches) {
            detail = { ...detail, files: cacheSnap.files };
          }
        }
        if (
          cacheSnap &&
          Array.isArray(cacheSnap.commits) &&
          cacheSnap.commits.length &&
          (!Array.isArray(detail.commits) || !detail.commits.length)
        ) {
          detail = { ...detail, commits: cacheSnap.commits };
        }
        if (detail && typeof detail === 'object') {
          detail = { ...detail, _sketch: undefined, _source: 'network' };
        }
        return detail;
      }

      /** Immediate partial paint when core fetch resolves (do not wait for threads/IDB). */
      function paintCoreNow(raw) {
        if (!openStill() || !raw) return null;
        // Core writes meta slice only (via applyCorePayload) — never empties
        // files/commits/reviews that other fetches own.
        const fromNetwork = mergeCoreWithCache(raw, cached);
        ensureDetailStore(current.detail);
        applyCoreToStore(fromNetwork);
        current.loading = false;
        current.error = null;
        const detail = current.detail;
        detailCache.set(key, detail);
        corePainted = true;
        setLoadStage(
          'threads',
          fromCache || detailRank(cached) >= 3
            ? loadStageLabel('threads-update')
            : loadStageLabel('threads-load'),
          true,
          { percent: prog.percent() }
        );
        render();
        console.log(
          `[pr-plus] openModal phase=core-paint ${owner}/${repo}#${number} ` +
            `(prior=${fromCache ? 'cache' : fromList ? 'list' : 'empty'}) pct=${prog.percent()}`
        );
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
      function paintThreadsNewestNow(page) {
        if (!openStill() || !page || typeof mergeFn !== 'function') return false;
        const base = current.detail;
        // Need a real detail shell (cache or core) — not empty
        if (!base || typeof base !== 'object') return false;
        // Allow merge into sketch only if it has identity; prefer non-empty host
        const next = mergeFn(base, page, 'newest');
        if (!next) return false;
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
          { percent: prog.percent() }
        );
        render();
        console.log(
          `[pr-plus] openModal phase=threads.last-early-paint ${owner}/${repo}#${number} ` +
            `(${page?.threads?.length || 0} threads) pct=${prog.percent()}`
        );
        return true;
      }

      const tl = getFetchTimeline();
      const span =
        tl && typeof tl.span === 'function'
          ? (name: any, p: any, meta: any = undefined) => tl.span(name, p, meta)
          : (_n: any, p: any, _m: any = undefined) => p;

      // Start threads in parallel with core — paint as soon as *this* fetch lands
      const threadsKickoffP = canFetchThreads
        ? span(
            'fetch.threadsNewest',
            globalThis.PRTreeFetch
              .fetchReviewThreadsPage(owner, repo, number, {
                direction: 'newest',
                cursor: null,
                pageSize: apiMax,
                signal,
              })
              .then((page) => {
                prog.mark(
                  'threadsNewest',
                  uw.threadsNewest,
                  'threads',
                  fromCache || detailRank(cached) >= 3
                    ? loadStageLabel('threads-update')
                    : loadStageLabel('threads-load')
                );
                earlyThreadsPage = page;
                paintThreadsNewestNow(page);
                tl?.mark?.('paint.threadsNewest', 'mark', {
                  note: `${page?.threads?.length || 0} threads`,
                });
                return { ok: true, page, paintedEarly: threadsPaintedEarly };
              })
              .catch((err) => {
                prog.mark(
                  'threadsNewest',
                  uw.threadsNewest,
                  'threads',
                  loadStageLabel('threads-failed', { message: err?.message })
                );
                return { ok: false, err };
              }),
            { pageSize: apiMax }
          )
        : Promise.resolve({ ok: false, err: null, skipped: true }).then((r) => {
            prog.mark('threadsNewest', uw.threadsNewest, corePhase, coreLabel);
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

      // Phase 2: await parallel threads kickoff (may already be painted early)
      // - Cold open: dual-window (newest last:N + oldest first:20)
      // - Cache revalidate: newest last:100 + bulk unresolved by PRRT ids
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
            setLoadStage(
              'threads',
              loadStageLabel('threads-update'),
              true,
              { percent: prog.percent() }
            );
            render();

            const tNewest0 = nowMs();
            const kick = await threadsKickoffP;
            if (!kick.ok) throw kick.err || new Error('Threads fetch failed');
            const newest = kick.page;
            console.log(
              `[pr-plus] openModal phase=threads.last ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tNewest0
              )}ms (${newest?.threads?.length || 0} threads, parallel-kickoff) pct=${prog.percent()} early=${Boolean(kick.paintedEarly || threadsPaintedEarly)}`
            );
            if (!openStill()) return;

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
            setLoadStage(
              'threads',
              loadStageLabel('threads-unresolved'),
              true,
              { percent: prog.percent() }
            );
            render();

            // Step 2: remaining unresolved not in last-100; drop remote-missing zombies
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
            let unresolvedPass = 0;
            let didUnresolvedFetch = false;
            /** PRRT ids confirmed remote-missing this open — never re-fetch. */
            const knownMissing = new Set();
            while (
              unresolvedPass < 2 &&
              typeof globalThis.PRTreeFetch.fetchReviewThreadsByIds === 'function'
            ) {
              unresolvedPass += 1;
              const remainingUnresolvedIds = collectIds(next).filter((id) => {
                const s = String(id);
                return !updatedIdSet.has(s) && !knownMissing.has(s);
              });
              if (!remainingUnresolvedIds.length) {
                if (unresolvedPass === 1) {
                  console.log(
                    `[pr-plus] openModal phase=threads.unresolved-remaining ${owner}/${repo}#${number}: skipped (0 remaining, last=${updatedIdSet.size})`
                  );
                }
                break;
              }
              didUnresolvedFetch = true;
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

            // Credit follow-up weight when bulk finished or was skipped
            prog.mark(
              'threadsFollow',
              uw.threadsFollow,
              'threads',
              didUnresolvedFetch
                ? loadStageLabel('threads-unresolved')
                : loadStageLabel('threads-update')
            );
            console.log(
              `[pr-plus] openModal phase=threads(revalidate) ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tThreads0
              )}ms total pct=${prog.percent()}`
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
            // —— Cold open: last:100 (parallel kickoff) then start:20 if total ≥ 100 ——
            const tNewest0 = nowMs();
            const kick = await threadsKickoffP;
            if (!kick.ok) throw kick.err || new Error('Threads fetch failed');
            const newest = kick.page;
            console.log(
              `[pr-plus] openModal phase=threads.last ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tNewest0
              )}ms (${newest?.threads?.length || 0} threads, parallel-kickoff) pct=${prog.percent()} early=${Boolean(kick.paintedEarly || threadsPaintedEarly)}`
            );
            if (!openStill()) return;
            // Re-merge after core (early paint may have used sketch/cache base)
            let next =
              typeof mergeFn === 'function'
                ? mergeFn(current.detail, newest, 'newest')
                : current.detail;

            applyThreadsToStore(next);
            detail = current.detail;
            next = detail;
            detailCache.set(key, detail);
            render();

            const totalCount =
              typeof newest.totalCount === 'number'
                ? newest.totalCount
                : newest.threads?.length || 0;
            // total < 100 → last page already covers everything; skip start
            const needStartWindow =
              totalCount >= apiMax && Boolean(newest.hasPreviousPage);
            if (needStartWindow) {
              try {
                setLoadStage(
                  'threads',
                  loadStageLabel('threads-earlier'),
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
                      pageSize: 20,
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
            } else {
              console.log(
                `[pr-plus] openModal phase=threads.start ${owner}/${repo}#${number}: skipped (total=${totalCount} < ${apiMax})`
              );
            }
            // Follow-up weight after start window completes or is skipped
            prog.mark(
              'threadsFollow',
              uw.threadsFollow,
              'threads',
              loadStageLabel('threads-load')
            );
            console.log(
              `[pr-plus] openModal phase=threads ${owner}/${repo}#${number}: ${Math.round(
                nowMs() - tThreads0
              )}ms total pct=${prog.percent()}`
            );
            if (!openStill()) return;
            if (current.detail) {
              applyThreadsToStore(next);
              detail = current.detail;
              detailCache.set(key, detail);
              tryFinishOpenProgress(prog);
              render();
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
            prog.mark(
              'threadsFollow',
              uw.threadsFollow,
              'threads',
              loadStageLabel('threads-failed', { message: threadErr?.message })
            );
            if (!tryFinishOpenProgress(prog)) {
              setLoadStage(
                'threads',
                loadStageLabel('threads-failed', { message: threadErr?.message }),
                true,
                { percent: Math.min(99, prog.percent()) }
              );
            }
            render();
          }
        }
      } else {
        // No thread API — credit remaining units then settle
        prog.mark('threadsFollow', uw.threadsFollow, corePhase, coreLabel);
        tryFinishOpenProgress(prog);
        render();
      }
    } catch (err) {
      if (
        gen !== detailFetchGen ||
        signal.aborted ||
        err?.name === 'AbortError' ||
        /aborted|AbortError/i.test(String(err?.message || err || ''))
      ) {
        return;
      }
      if (current.open) {
        current.loading = false;
        if (!current.detail) {
          current.error = err?.message || String(err);
        }
        clearLoadStage();
        render();
      }
    }
    })(); // end background upgrade after sync first paint
  }

  /**
   * After stack tree is applied on /pulls, reopen the modal that was open before refresh.
   * Priority: sessionStorage open snap > URI (pr+number / page / position).
   * Diff/conversation layout also restored inside App via loadSessionView + initialRoute.
   */

