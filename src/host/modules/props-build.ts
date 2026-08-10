// TypeScript SoT — assembled by build scripts (classic runtime JS emit)

  function buildProps() {
    const owner = current.owner;
    const repo = current.repo;
    const number = current.number;
    const openPulls = resolveOpenPulls();
    const presentation = isEmbedPresentation(current.presentation)
      ? 'embed'
      : 'modal';
    const chrome =
      presentation === 'embed' && pageEmbedApi()?.embedShellChromeFlags
        ? pageEmbedApi().embedShellChromeFlags()
        : {
            presentation: 'modal',
            showClose: true,
            showShellToggle: true,
            showFullscreen: true,
            showExit: true,
          };
    return {
      open: current.open,
      loading: current.loading,
      error: current.error,
      detail: current.detail,
      loadStage: current.loadStage,
      /** Side panels loading without settled cache → section skeletons */
      sidePending: {
        commits: Boolean(current.sidePending?.commits),
        checks: Boolean(current.sidePending?.checks),
        development: Boolean(current.sidePending?.development),
        files: Boolean(current.sidePending?.files),
        comments: Boolean(current.sidePending?.comments),
        reviews: Boolean(current.sidePending?.reviews),
      },
      openPulls,
      prefs: { ...prefs },
      /**
       * Conversation timeline tip toggles → extensionPrefs.timelineVisibility.
       * Capture prevVis **before** optimistic write, then lazy-fetch system
       * events if a tip was re-enabled after partial-fetch skip. Storage watch
       * alone is insufficient (prev is already clobbered by then).
       */
      onTimelineVisibilityChange: (nextVis: any) => {
        const pure = (globalThis as any).PRModalConversationTimeline;
        const prevVis = prefs.timelineVisibility;
        const planned =
          typeof pure?.planTimelineVisibilityChange === 'function'
            ? pure.planTimelineVisibilityChange(
                prevVis,
                nextVis,
                current.detail?.timelineEvents
              )
            : null;
        const nextNormalized =
          planned?.nextVisibility ??
          (typeof pure?.normalizeTimelineVisibility === 'function'
            ? pure.normalizeTimelineVisibility(nextVis)
            : nextVis && typeof nextVis === 'object'
              ? nextVis
              : prevVis);
        const shouldLazy =
          planned != null
            ? Boolean(planned.shouldLazyFetch)
            : typeof pure?.needsLazyTimelineEventsFetch === 'function'
              ? pure.needsLazyTimelineEventsFetch(
                  prevVis,
                  nextNormalized,
                  current.detail?.timelineEvents
                )
              : false;
        const patch = { timelineVisibility: nextNormalized };
        // Optimistic local merge so tips re-render before storage round-trip
        try {
          prefs = {
            ...prefs,
            timelineVisibility: nextNormalized,
          };
          if (current.open) render();
        } catch {
          /* ignore */
        }
        // Lazy REST events: must use captured prevVis (not watch path)
        if (shouldLazy && current.open) {
          try {
            void maybeLazyFetchTimelineEvents(prevVis, nextNormalized);
          } catch {
            /* ignore */
          }
        }
        const done = (full: any) => {
          if (full && typeof full === 'object') {
            try {
              prefs = {
                ...prefs,
                ...full,
                timelineVisibility:
                  full.timelineVisibility || prefs.timelineVisibility,
              };
              if (current.open) render();
            } catch {
              /* ignore */
            }
          }
        };
        try {
          if (typeof globalThis.PRTreeStorage?.setExtensionPrefs === 'function') {
            void globalThis.PRTreeStorage.setExtensionPrefs(patch)
              .then(done)
              .catch(() => {});
            return;
          }
        } catch {
          /* fall through */
        }
        try {
          const chromeApi = (globalThis as any).chrome;
          chromeApi?.runtime?.sendMessage?.(
            { type: 'PR_TREE_PREFS_SET', prefs: patch },
            (res: any) => {
              if (res?.prefs) done(res.prefs);
            }
          );
        } catch {
          /* ignore */
        }
      },
      presentation,
      shellChrome: chrome,
      // Deep-link restore (page/position + GH commit/selection); App also writes URI
      initialRoute: {
        page: current.routePage,
        position: current.routePosition,
        number: current.number,
        commitSha: current.routeCommitSha,
        commitEndSha: current.routeCommitEndSha,
        filePath: current.routeFilePath,
        fileKey: current.routeFileKey,
        startLine: current.routeStartLine,
        endLine: current.routeEndLine,
        side: current.routeSide,
      },
      onRouteChange: persistRouteState,
      onClose: presentation === 'embed' ? () => {} : closeModal,
      onRestoreNative:
        presentation === 'embed' ? () => restoreNativeView() : undefined,
      /**
       * Stack strip navigation — preserve current Diff/Conversation view when
       * opts.page is omitted by falling back to current.routePage.
       * @param {number} n
       * @param {{ page?: 'diff'|'conversation'|null }} [opts]
       */
      onOpenStackPr: (n, opts: any = {}) => {
        if (!owner || !repo || n == null) return;
        const page =
          opts?.page === 'diff' || opts?.page === 'conversation'
            ? opts.page
            : current.routePage === 'diff' || current.routePage === 'conversation'
              ? current.routePage
              : null;
        void openModal({
          owner,
          repo,
          number: Number(n),
          page,
        });
      },
      /**
       * Header / post-mutation refresh.
       * @param {{
       *   mode?: 'revalidate'|'full-threads'|'visible-threads',
       *   threadNodeIds?: string[],
       * }} [opts]
       *   - visible-threads (conversation header): core + bulk only on-screen threads
       *   - full-threads (diff header): REST/GraphQL newest 15 + oldest window + Load all
       *   - revalidate (mutations / default): REST newest 15 (empty trusted)
       *     + remaining unresolved bulk when PRRT ids exist
       */
      onRefresh: async (opts: any = {}) => {
        if (!owner || !repo || !number) return;
        if (!globalThis.PRTreeFetch?.fetchPrDetail) return;
        const modeRaw = String(opts?.mode || 'revalidate');
        const mode =
          modeRaw === 'full-threads'
            ? 'full-threads'
            : modeRaw === 'visible-threads'
              ? 'visible-threads'
              : 'revalidate';
        const visibleIds = [
          ...new Set(
            (Array.isArray(opts?.threadNodeIds) ? opts.threadNodeIds : [])
              .map((id) => String(id || '').trim())
              .filter(Boolean)
          ),
        ];
        const key = detailKey(owner, repo, number);
        // Cancel prior open/refresh fetches; new cancelable session
        const { gen, signal, metaGenAtStart } = beginOpenFetchSession();
        const prevDetail = current.detail;
        current.error = null;
        setLoadStage(
          'refresh',
          mode === 'full-threads'
            ? loadStageLabel('refresh-all')
            : mode === 'visible-threads'
              ? loadStageLabel('refresh-visible')
              : loadStageLabel('refresh'),
          true
        );
        render();

        const stillOpen = () =>
          gen === detailFetchGen &&
          !signal.aborted &&
          current.open &&
          current.owner === owner &&
          current.repo === repo &&
          Number(current.number) === Number(number);

        const mergeFn =
          globalThis.PRTreeFetch.mergeReviewThreadsPageIntoDetail || null;
        const apiMax =
          Number(globalThis.PRModalReviewThreads?.REVIEW_THREADS_PAGE_SIZE) ||
          15;
        const nowMs = () =>
          typeof performance !== 'undefined' && performance.now
            ? performance.now()
            : Date.now();

        try {
          // Kick independent network work in parallel (mirror openModal).
          // Each fetch marks progress on *its own* completion (timing-accurate bar).
          const prog = beginFetchProgress(gen, stillOpen);
          const uw = prog.weights;
          prog.mark('start', uw.start, 'refresh', loadStageLabel('refresh-meta'));

          const canPageThreads = Boolean(
            globalThis.PRTreeFetch.fetchReviewThreadsPage
          );
          const canBulkThreads = Boolean(
            globalThis.PRTreeFetch.fetchReviewThreadsByIds
          );

          /** @type {any} */
          let earlyRefreshThreadsPage = null;
          /** @type {any} */
          let earlyRefreshVisibleBulk = null;

          /** Partial paint helper for refresh core (immediate on resolve). */
          function paintRefreshCore(raw) {
            if (!stillOpen() || !raw) return null;
            let detail = raw;
            // Prefer live on-screen threads (may include early-fetched newest)
            // over stale prevDetail when network core has empty comments.
            // Never re-seed discarded PENDING when network has no viewer PENDING.
            const threadSrc =
              current.detail &&
              Array.isArray(current.detail.reviewComments) &&
              current.detail.reviewComments.length
                ? current.detail
                : prevDetail;
            const pureStore =
              typeof globalThis !== 'undefined'
                ? (globalThis as any).PRModalDetailStore
                : null;
            const netRc = Array.isArray(detail.reviewComments)
              ? detail.reviewComments
              : [];
            const srcRc =
              threadSrc && Array.isArray(threadSrc.reviewComments)
                ? threadSrc.reviewComments
                : [];
            if (threadSrc && srcRc.length && netRc.length) {
              const mergeFn =
                typeof pureStore?.mergeCommentsHostFirst === 'function'
                  ? pureStore.mergeCommentsHostFirst
                  : null;
              if (mergeFn) {
                detail = {
                  ...detail,
                  reviewComments: mergeFn(netRc, srcRc, {
                    hostAuthoritative: true,
                    networkDetail: detail,
                  }),
                };
              }
            } else if (threadSrc && srcRc.length && !netRc.length) {
              const netHasPending =
                typeof pureStore?.detailHasViewerPending === 'function'
                  ? pureStore.detailHasViewerPending(detail)
                  : Boolean(detail?.viewerPendingReview?.id);
              // After Discard / when network has no PENDING: do not reinject
              if (netHasPending) {
                const filterFn =
                  typeof pureStore?.filterCacheReviewCommentsForCore ===
                  'function'
                    ? pureStore.filterCacheReviewCommentsForCore
                    : null;
                const cleanedRc = filterFn
                  ? filterFn(srcRc, {
                      ...detail,
                      _deletedReviewCommentIds: [
                        ...(Array.isArray(detail?._deletedReviewCommentIds)
                          ? detail._deletedReviewCommentIds
                          : []),
                        ...(Array.isArray(threadSrc?._deletedReviewCommentIds)
                          ? threadSrc._deletedReviewCommentIds
                          : []),
                      ],
                    })
                  : srcRc.filter((c) => c && c.id != null);
                if (cleanedRc.length) {
                  detail = {
                    ...detail,
                    reviewComments: cleanedRc,
                    reviewThreads:
                      threadSrc.reviewThreads || detail.reviewThreads,
                    reviewThreadsMeta:
                      threadSrc.reviewThreadsMeta || detail.reviewThreadsMeta,
                    reviewCommentsMeta:
                      threadSrc.reviewCommentsMeta ||
                      detail.reviewCommentsMeta,
                  };
                }
              }
            }
            if (prevDetail && Array.isArray(prevDetail.files) && prevDetail.files.length) {
              const netFiles = Array.isArray(detail.files) ? detail.files : [];
              const cachedHasPatches = prevDetail.files.some(
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
                detail = { ...detail, files: prevDetail.files };
              }
            }
            if (
              prevDetail &&
              Array.isArray(prevDetail.commits) &&
              prevDetail.commits.length &&
              (!Array.isArray(detail.commits) || !detail.commits.length)
            ) {
              detail = { ...detail, commits: prevDetail.commits };
            }
            current.loading = false;
            // Core refresh: meta slice only (isolation). If App meta write
            // bumped metaRefreshGen mid-flight, skip supersede keys.
            ensureDetailStore(current.detail || prevDetail);
            applyCoreToStore(detail, { metaGenAtStart });
            current.error = null;
            detailCache.set(key, current.detail);
            setLoadStage(
              'refresh',
              loadStageLabel('refresh-meta'),
              true,
              { percent: prog.percent() }
            );
            render();
            kickIndependentSideFetches({
              owner,
              repo,
              number,
              headSha: current.detail?.headSha || null,
              body: current.detail?.body || '',
              gen,
              stillOpenFn: stillOpen,
              signal,
            });
            // Re-apply early thread fetches after core shell is updated
            if (earlyRefreshThreadsPage) {
              paintRefreshThreadsNewest(earlyRefreshThreadsPage);
            }
            if (earlyRefreshVisibleBulk) {
              paintRefreshVisibleBulk(earlyRefreshVisibleBulk);
            }
            return current.detail;
          }

          function paintRefreshThreadsNewest(page) {
            if (!stillOpen() || !page || typeof mergeFn !== 'function') return false;
            if (!current.detail) return false;
            const next = mergeFn(current.detail, page, 'newest');
            applyThreadsToStore(next);
            detailCache.set(key, current.detail);
            setLoadStage(
              'threads',
              loadStageLabel('threads-update'),
              true,
              { percent: prog.percent() }
            );
            render();
            return true;
          }

          function paintRefreshVisibleBulk(bulk) {
            if (!stillOpen() || !bulk || typeof mergeFn !== 'function') return false;
            if (!current.detail) return false;
            const next = mergeFn(current.detail, bulk, 'refresh');
            applyThreadsToStore(next);
            detailCache.set(key, current.detail);
            setLoadStage(
              'threads',
              loadStageLabel('threads-visible', { count: visibleIds.length }),
              true,
              { percent: prog.percent() }
            );
            render();
            return true;
          }

          // Parallel kickoff — GraphQL shell newest (page 15); full-threads same
          const refreshThreadsCacheSnap = prevDetail || current.detail || null;
          const refreshWShell = uw.threadsShell ?? uw.threadsNewest ?? 8;
          const refreshWComments = uw.threadsComments ?? uw.threadsRemaining ?? 8;
          const refreshWReactions = uw.threadsReactions ?? uw.threadsEarlier ?? 4;
          // shell → comments UI; reactions weight silent-credited with comments.
          const creditRefreshThreadLadder = () => {
            prog.mark(
              'threadsShell',
              refreshWShell,
              'threads',
              loadStageLabel('threads-shell')
            );
            const commentsLabel = loadStageLabel('threads-comments');
            prog.mark(
              'threadsComments',
              refreshWComments,
              'threads',
              commentsLabel
            );
            prog.mark(
              'threadsReactions',
              refreshWReactions,
              'threads',
              commentsLabel
            );
          };
          const threadsNewestP =
            mode !== 'visible-threads' && canPageThreads
              ? fetchNewestReviewThreadsAdaptive(owner, repo, number, {
                  signal,
                  cacheDetail: refreshThreadsCacheSnap,
                  forceFull: mode === 'full-threads',
                  onStage: (stage) => {
                    if (!stillOpen()) return;
                    if (stage === 'shell') {
                      prog.mark(
                        'threadsShell',
                        refreshWShell,
                        'threads',
                        loadStageLabel('threads-shell')
                      );
                    } else if (stage === 'comments') {
                      const commentsLabel = loadStageLabel('threads-comments');
                      prog.mark(
                        'threadsComments',
                        refreshWComments,
                        'threads',
                        commentsLabel
                      );
                      prog.mark(
                        'threadsReactions',
                        refreshWReactions,
                        'threads',
                        commentsLabel
                      );
                    }
                  },
                })
                  .then((res) => {
                    const page = res.page;
                    creditRefreshThreadLadder();
                    earlyRefreshThreadsPage = page;
                    paintRefreshThreadsNewest(page);
                    console.log(
                      `[pr-plus] onRefresh threads.newest adaptive ${owner}/${repo}#${number}: ` +
                        `mode=${mode} pageSize=${res.pageSize} warm=${res.warm} ` +
                        `earlyExit=${res.earlyExit} escalated=${res.escalated} ` +
                        `threads=${page?.threads?.length || 0}`
                    );
                    return { ok: true, page, adaptive: res };
                  })
                  .catch((err) => {
                    creditRefreshThreadLadder();
                    return { ok: false, err };
                  })
              : Promise.resolve({ ok: false, skipped: true }).then((r) => {
                  if (mode !== 'visible-threads') {
                    creditRefreshThreadLadder();
                  }
                  return r;
                });

          const threadsVisibleP =
            mode === 'visible-threads' &&
            visibleIds.length &&
            canBulkThreads
              ? globalThis.PRTreeFetch
                  .fetchReviewThreadsByIds(visibleIds, { signal })
                  .then((bulk) => {
                    prog.mark(
                      'threadsVisible',
                      uw.threadsVisible,
                      'threads',
                      loadStageLabel('threads-visible', {
                        count: visibleIds.length,
                      })
                    );
                    earlyRefreshVisibleBulk = bulk;
                    paintRefreshVisibleBulk(bulk);
                    return { ok: true, bulk };
                  })
                  .catch((err) => {
                    prog.mark(
                      'threadsVisible',
                      uw.threadsVisible,
                      'threads',
                      loadStageLabel('threads-failed', { message: err?.message })
                    );
                    return { ok: false, err };
                  })
              : Promise.resolve({ ok: false, skipped: true });

          let detail = await globalThis.PRTreeFetch.fetchPrDetail(
            owner,
            repo,
            number,
            { skipReviewThreads: true, signal }
          ).then((d) => {
            prog.mark('core', uw.core, 'refresh', loadStageLabel('refresh-meta'));
            paintRefreshCore(d);
            return d;
          });
          if (!stillOpen()) return;
          detail = current.detail || detail;

          // —— Conversation header: only bulk-refresh threads currently on screen ——
          if (mode === 'visible-threads') {
            if (
              visibleIds.length &&
              canBulkThreads &&
              typeof mergeFn === 'function'
            ) {
              setLoadStage(
                'threads',
                loadStageLabel('threads-visible', { count: visibleIds.length }),
                true,
                { percent: prog.percent() }
              );
              render();
              const tBulk = nowMs();
              const vis = await threadsVisibleP;
              if (!vis.ok && !vis.skipped) throw vis.err;
              const bulk = vis.bulk;
              // threadsVisible weight already applied in promise .then
              const missingN = (bulk?.missingThreadIds || []).length;
              console.log(
                `[pr-plus] onRefresh visible-threads ${owner}/${repo}#${number}: ${Math.round(
                  nowMs() - tBulk
                )}ms (${bulk?.threads?.length || 0}/${visibleIds.length}` +
                  (missingN ? `, dropped ${missingN} remote-missing` : '') +
                  `, parallel-kickoff) pct=${prog.percent()}`
              );
              if (!stillOpen()) return;
              if (bulk) {
                const next = mergeFn(current.detail, bulk, 'refresh');
                // Threads slice only — do not replace other domains
                applyThreadsToStore(next);
                detailCache.set(key, current.detail);
              }
            } else {
              // No visible ids — credit thread weight so settle is not stuck
              prog.mark(
                'threadsVisible',
                uw.threadsVisible,
                'refresh',
                loadStageLabel('refresh-visible')
              );
              console.log(
                `[pr-plus] onRefresh visible-threads ${owner}/${repo}#${number}: metadata only (0 visible PRRT ids)`
              );
            }
            if (stillOpen()) {
              tryFinishOpenProgress(prog);
              render();
            }
            return;
          }

          const wShell = uw.threadsShell ?? uw.threadsNewest ?? 8;
          const wComments = uw.threadsComments ?? uw.threadsRemaining ?? 8;
          const wReactions = uw.threadsReactions ?? uw.threadsEarlier ?? 4;
          const creditThreadLadder = () => {
            prog.mark(
              'threadsShell',
              wShell,
              'threads',
              loadStageLabel('threads-shell')
            );
            const commentsLabel = loadStageLabel('threads-comments');
            prog.mark(
              'threadsComments',
              wComments,
              'threads',
              commentsLabel
            );
            // Silent reactions credit (co-fetched on by-ids; no UI stage)
            prog.mark(
              'threadsReactions',
              wReactions,
              'threads',
              commentsLabel
            );
          };

          if (!canPageThreads) {
            creditThreadLadder();
            tryFinishOpenProgress(prog);
            render();
            return;
          }

          // 2a) newest window (REST 15 or forceFull GraphQL 15) — await parallel kickoff
          setLoadStage(
            'threads',
            loadStageLabel('threads-update'),
            true,
            { percent: prog.percent() }
          );
          render();
          const t0 = nowMs();
          const kick: any = await threadsNewestP;
          if (!kick?.ok) throw kick?.err || new Error('Threads fetch failed');
          const newest = kick.page;
          if (!stillOpen()) return;
          const adapt = kick.adaptive || null;
          console.log(
            `[pr-plus] onRefresh last ${owner}/${repo}#${number}: ${Math.round(
              nowMs() - t0
            )}ms (${newest?.threads?.length || 0}) mode=${mode} parallel-kickoff` +
              (adapt
                ? ` pageSize=${adapt.pageSize} earlyExit=${adapt.earlyExit} escalated=${adapt.escalated}`
                : '') +
              ` pct=${prog.percent()}`
          );
          let next =
            typeof mergeFn === 'function'
              ? mergeFn(current.detail, newest, 'newest')
              : current.detail;
          applyThreadsToStore(next);
          next = current.detail;
          detailCache.set(key, next);
          render();

          const updatedIdSet = new Set(
            (newest?.threads || [])
              .map((t) => (t?.threadNodeId ? String(t.threadNodeId) : ''))
              .filter(Boolean)
          );
          const totalCount =
            typeof newest.totalCount === 'number'
              ? newest.totalCount
              : newest.threads?.length || 0;
          const RT =
            typeof globalThis !== 'undefined'
              ? globalThis.PRModalReviewThreads
              : null;
          const newestSource = newest?.source || adapt?.source || null;
          // Soft revalidate: by-id bulk for remaining unresolved PRRT (see open-modal).
          const forceFull = mode === 'full-threads';
          const skipByIds =
            !forceFull &&
            (typeof RT?.shouldSkipUnresolvedByIdsBulk === 'function'
              ? Boolean(
                  RT.shouldSkipUnresolvedByIdsBulk({
                    newestSource,
                    hostRestFallback: Boolean(adapt?.hostRestFallback),
                    forceFull: false,
                    mode,
                  })
                )
              : String(newestSource || '').toLowerCase() === 'rest' ||
                Boolean(adapt?.hostRestFallback));

          if (mode === 'full-threads') {
            // Diff incomplete: single-cursor only — drain remaining *threads*
            // (not timelineItems history) — no dual-window oldest seed.
            creditThreadLadder();
            if (stillOpen() && next?.reviewThreadsMeta?.hasMore) {
              const props = buildProps();
              if (typeof props.onLoadMoreReviewThreads === 'function') {
                await props.onLoadMoreReviewThreads('threads-all');
              }
            } else if (stillOpen()) {
              tryFinishOpenProgress(prog);
              render();
            }
          } else {
            // Mutation / soft revalidate: unresolved by-id only when newest was GraphQL
            // (or full escalate). GraphQL newest may still need by-id for out-of-window
            // and missingThreadIds wipe of REST paint under rate-limit.
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
                    RT.remainingUnresolvedForByIdsBulk(
                      unresolved,
                      updated,
                      known
                    )
                : (unresolved, updated, known) =>
                    (unresolved || []).filter((id) => {
                      const s = String(id);
                      if (!/^PRRT_/i.test(s)) return false;
                      return !updated.has(s) && !known.has(s);
                    });
            let unresolvedPass = 0;
            const knownMissing = new Set();
            if (skipByIds) {
              console.log(
                `[pr-plus] onRefresh unresolved-remaining ${owner}/${repo}#${number}: skipped by-id bulk`
              );
            }
            while (
              !skipByIds &&
              unresolvedPass < 2 &&
              typeof globalThis.PRTreeFetch.fetchReviewThreadsByIds ===
                'function' &&
              typeof mergeFn === 'function'
            ) {
              unresolvedPass += 1;
              const remainingUnresolvedIds = filterRemaining(
                collectIds(next),
                updatedIdSet,
                knownMissing
              );
              if (!remainingUnresolvedIds.length) break;
              setLoadStage(
                'threads',
                loadStageLabel('threads-unresolved'),
                true,
                { percent: prog.percent() }
              );
              render();
              const tBulk = nowMs();
              const bulk =
                await globalThis.PRTreeFetch.fetchReviewThreadsByIds(
                  remainingUnresolvedIds,
                  { signal }
                );
              const missingList = Array.isArray(bulk?.missingThreadIds)
                ? bulk.missingThreadIds
                : [];
              for (const id of missingList) knownMissing.add(String(id));
              const missingN = missingList.length;
              console.log(
                `[pr-plus] onRefresh unresolved-remaining ${owner}/${repo}#${number}: ${Math.round(
                  nowMs() - tBulk
                )}ms (${bulk?.threads?.length || 0}/${remainingUnresolvedIds.length}` +
                  (missingN ? `, dropped ${missingN} remote-missing` : '') +
                  `, pass ${unresolvedPass})`
              );
              if (!stillOpen()) return;
              if (bulk) {
                next = mergeFn(next, bulk, 'refresh');
              }
              // Only retry when we actually pruned zombies (otherwise stop)
              if (!missingN) break;
            }
            // soft revalidate: remaining by-ids done; ladder already from kickoff
            creditThreadLadder();
            if (stillOpen()) {
              applyThreadsToStore(next);
              detailCache.set(key, current.detail);
              tryFinishOpenProgress(prog);
              render();
            }
          }
        } catch (err) {
          if (gen !== detailFetchGen) return;
          if (current.open) {
            current.loading = false;
            // Keep previous detail on soft-refresh failure
            if (!current.detail) {
              current.error = err?.message || String(err);
            } else {
              setLoadStage(
                'refresh',
                loadStageLabel('refresh-failed', { message: err?.message }),
                false
              );
            }
            render();
          }
        } finally {
          // Await force open-list revalidate so merge re-assert runs after commit
          // (tombstones still block lagging network resurrection).
          try {
            if (typeof ensureOpenPullsForStack === 'function' && owner && repo) {
              await ensureOpenPullsForStack(owner, repo, {
                force: true,
                signal,
              });
            }
          } catch {
            /* ignore */
          }
        }
      },
      /**
       * Unified Conversation load-more: reviewThreads and/or timelineItems.
       * @param {string|boolean} [direction]
       *   undefined / 'more' — one page of each incomplete source
       *   'all' — drain both (banner Load all)
       *   'threads-all' | 'threads' — threads only (Diff / search completeness)
       *   'timeline-all' | 'timeline' — timelineItems only
       *   older|newer|oldest|newest — thread direction (one page; + timeline page)
       */
      onLoadMoreReviewThreads: async (direction) => {
        if (!owner || !repo || !number) return null;
        if (!current.detail) return null;
        const dirRaw = String(direction ?? 'more').toLowerCase();
        const loadAll =
          direction === true ||
          dirRaw === 'all' ||
          dirRaw === 'threads-all' ||
          dirRaw === 'timeline-all';
        const wantThreads =
          dirRaw !== 'timeline' &&
          dirRaw !== 'timeline-all' &&
          (dirRaw === 'threads' ||
            dirRaw === 'threads-all' ||
            dirRaw === 'all' ||
            dirRaw === 'more' ||
            dirRaw === 'older' ||
            dirRaw === 'newer' ||
            dirRaw === 'oldest' ||
            dirRaw === 'newest' ||
            direction == null ||
            direction === false);
        const wantTimeline =
          dirRaw !== 'threads' &&
          dirRaw !== 'threads-all' &&
          (dirRaw === 'timeline' ||
            dirRaw === 'timeline-all' ||
            dirRaw === 'all' ||
            dirRaw === 'more' ||
            dirRaw === 'older' ||
            dirRaw === 'newer' ||
            dirRaw === 'oldest' ||
            dirRaw === 'newest' ||
            direction == null ||
            direction === false);
        const gen = detailFetchGen;
        const mergeFn =
          globalThis.PRTreeFetch?.mergeReviewThreadsPageIntoDetail || null;
        const pure = (globalThis as any).PRModalConversationTimeline;

        const pickDirection = (meta) => {
          if (meta.hasOlder || meta.hasMore) {
            if (meta.newestStartCursor || meta.endCursor) return 'older';
            return 'newest';
          }
          return null;
        };
        const cursorFor = (meta, dir) =>
          dir === 'older' || dir === 'newest'
            ? meta.newestStartCursor || meta.endCursor || null
            : meta.newestEndCursor || meta.oldestEndCursor || null;

        const clearStuckThreads = (detailSnap, reason = '') => {
          const meta = detailSnap?.reviewThreadsMeta || {};
          if (!meta.hasMore) return detailSnap;
          const loaded = Number(meta.loadedThreadCount) || 0;
          if (reason) {
            console.log(
              `[pr-plus] loadMore threads: clear stuck hasMore (${reason}) ` +
                `${owner}/${repo}#${number}`
            );
          }
          return {
            ...detailSnap,
            reviewThreadsMeta: {
              ...meta,
              hasMore: false,
              hasOlder: false,
              hasNewerFromOldest: false,
              hiddenCount: 0,
              totalCount: loaded || Number(meta.totalCount) || 0,
            },
            reviewCommentsMeta: {
              ...(detailSnap.reviewCommentsMeta || {}),
              hasMore: false,
            },
          };
        };

        const clearStuckTimeline = (detailSnap, reason = '') => {
          const meta = detailSnap?.timelineMeta || {};
          if (!meta.hasMore && meta.complete !== false) return detailSnap;
          if (reason) {
            console.log(
              `[pr-plus] loadMore timeline: clear stuck hasMore (${reason}) ` +
                `${owner}/${repo}#${number}`
            );
          }
          return {
            ...detailSnap,
            timelineMeta: {
              ...meta,
              hasMore: false,
              complete: true,
            },
          };
        };

        const paintLoadAllStage = (meta) => {
          if (!loadAll) return;
          const loaded = Number(meta?.loadedThreadCount) || 0;
          const total =
            Number(meta?.totalCount) || Number(meta0TotalHint) || 0;
          const pct =
            total > 0
              ? Math.min(99, Math.max(1, Math.round((loaded / total) * 100)))
              : 8;
          setLoadStage(
            'threads',
            loadStageLabel('threads-all', { loaded, total }),
            true,
            { percent: pct }
          );
          render();
        };

        const loadOneThreadPage = async (detailSnap) => {
          if (!globalThis.PRTreeFetch?.fetchReviewThreadsPage) {
            return { detail: detailSnap, progressed: false };
          }
          const meta = detailSnap.reviewThreadsMeta || {};
          if (!meta.hasMore) return { detail: detailSnap, progressed: false };
          const beforeCount = Number(meta.loadedThreadCount) || 0;
          const pageSize =
            Number(
              globalThis.PRModalReviewThreads?.REVIEW_THREADS_PAGE_SIZE
            ) || 100;

          const restSource =
            meta.source === 'rest' ||
            (meta.restPage != null && !meta.newestStartCursor);
          if (restSource && meta.hasMore) {
            const nextRestPage = Math.max(1, Number(meta.restPage) || 1) + 1;
            const page = await globalThis.PRTreeFetch.fetchReviewThreadsPage(
              owner,
              repo,
              number,
              {
                direction: 'newest',
                cursor: null,
                pageSize,
                preferRest: true,
                restPage: nextRestPage,
                reviewCommentsCount:
                  detailSnap.reviewCommentsCount != null
                    ? Number(detailSnap.reviewCommentsCount)
                    : null,
                signal: openFetchAbort?.signal || null,
              }
            );
            if (gen !== detailFetchGen) return { detail: null, progressed: false };
            let next = detailSnap;
            if (typeof mergeFn === 'function') {
              next = mergeFn(detailSnap, page, 'newest');
            }
            const afterCount =
              Number(next?.reviewThreadsMeta?.loadedThreadCount) || 0;
            return {
              detail: next,
              progressed: afterCount > beforeCount,
            };
          }

          let dir = dirRaw;
          if (
            loadAll ||
            !['older', 'newer', 'oldest', 'newest'].includes(dir)
          ) {
            dir = pickDirection(meta);
          }
          if (!dir) return { detail: detailSnap, progressed: false };
          if (
            (dir === 'older' || dir === 'newest') &&
            !meta.hasOlder &&
            meta.hasNewerFromOldest
          ) {
            dir = 'newer';
          }
          if (
            (dir === 'newer' || dir === 'oldest') &&
            !meta.hasNewerFromOldest &&
            meta.hasOlder
          ) {
            dir = 'older';
          }
          const cursor = cursorFor(meta, dir);
          if ((dir === 'older' || dir === 'newer') && !cursor) {
            return { detail: detailSnap, progressed: false };
          }
          const page = await globalThis.PRTreeFetch.fetchReviewThreadsPage(
            owner,
            repo,
            number,
            {
              direction: dir,
              cursor,
              pageSize,
              signal: openFetchAbort?.signal || null,
            }
          );
          if (gen !== detailFetchGen) return { detail: null, progressed: false };
          let next = detailSnap;
          if (typeof mergeFn === 'function') {
            next = mergeFn(detailSnap, page, dir);
          }
          const afterCount =
            Number(next?.reviewThreadsMeta?.loadedThreadCount) || 0;
          return {
            detail: next,
            progressed: afterCount > beforeCount,
          };
        };

        /** One older (or newer) GraphQL timelineItems page + merge into detail. */
        const loadOneTimelinePage = async (detailSnap) => {
          if (typeof globalThis.PRTreeFetch?.fetchPrTimelineItemsPage !== 'function') {
            return { detail: detailSnap, progressed: false };
          }
          const meta = detailSnap.timelineMeta || {};
          const cm = detailSnap.commentsMeta || {};
          const hasMoreFlag =
            Boolean(meta.hasMore) ||
            meta.complete === false ||
            Boolean(cm.hasMore);
          if (!hasMoreFlag) {
            return { detail: detailSnap, progressed: false };
          }
          const sortNewest =
            String(meta.direction || 'newest').toLowerCase() !== 'oldest';
          // Newest window → walk older with before:startCursor.
          // Oldest window → walk newer with after:endCursor.
          const cursor = sortNewest
            ? meta.startCursor || cm.startCursor || null
            : meta.endCursor || cm.endCursor || null;
          if (!cursor) {
            return { detail: detailSnap, progressed: false };
          }
          const beforeComments = Array.isArray(detailSnap.comments)
            ? detailSnap.comments.length
            : 0;
          const beforeEvents = Array.isArray(detailSnap.timelineEvents)
            ? detailSnap.timelineEvents.length
            : 0;
          const page = await globalThis.PRTreeFetch.fetchPrTimelineItemsPage(
            owner,
            repo,
            number,
            {
              direction: sortNewest ? 'newest' : 'oldest',
              cursor,
              pageSize: 100,
              signal: openFetchAbort?.signal || null,
            }
          );
          if (gen !== detailFetchGen) return { detail: null, progressed: false };
          if (!page || page.error) {
            return { detail: detailSnap, progressed: false };
          }
          const pageComments = Array.isArray(page.comments) ? page.comments : [];
          const pageEvents = Array.isArray(page.timelineEvents)
            ? page.timelineEvents
            : [];
          let comments = Array.isArray(detailSnap.comments)
            ? detailSnap.comments
            : [];
          let events = Array.isArray(detailSnap.timelineEvents)
            ? detailSnap.timelineEvents
            : [];
          if (typeof pure?.mergeTimelineItemsById === 'function') {
            comments = pure.mergeTimelineItemsById(comments, pageComments);
            events = pure.mergeTimelineItemsById(events, pageEvents);
          } else {
            const byId = new Map(
              comments.map((c: any) => [String(c?.id ?? c?.nodeId), c])
            );
            for (const c of pageComments) {
              if (c?.id != null || c?.nodeId) {
                byId.set(String(c.id ?? c.nodeId), c);
              }
            }
            comments = [...byId.values()];
            const evMap = new Map(
              events.map((e: any, i: number) => [
                String(e?.id ?? e?.nodeId ?? i),
                e,
              ])
            );
            for (const e of pageEvents) {
              evMap.set(String(e?.id ?? e?.nodeId ?? Math.random()), e);
            }
            events = [...evMap.values()];
          }
          const pi = page.pageInfo || {};
          // Walking older (newest dir): new older edge is page startCursor.
          // Walking newer (oldest dir): new newer edge is page endCursor.
          const nextStart = sortNewest
            ? pi.startCursor || meta.startCursor || null
            : meta.startCursor || pi.startCursor || null;
          const nextEnd = sortNewest
            ? meta.endCursor || pi.endCursor || null
            : pi.endCursor || meta.endCursor || null;
          const hasMore = Boolean(page.hasMore);
          let coverageEndAt = meta.coverageEndAt || null;
          if (typeof pure?.minTimelineCoverageEndAt === 'function') {
            coverageEndAt =
              pure.minTimelineCoverageEndAt(comments, events) || coverageEndAt;
          }
          const loadedCount = comments.length + events.length;
          // Preserve REST issue-comment incompleteness: timeline exhaustion must
          // not mark commentsMeta complete or list resync will publish a partial
          // (or empty) comments[].length as the pulls-list speech-bubble count.
          const prevCm = detailSnap.commentsMeta || {};
          const restStillMore =
            prevCm.hasMore === true ||
            prevCm.complete === false ||
            (prevCm.nextPage != null && Number(prevCm.nextPage) > 0);
          const commentsHasMore = Boolean(hasMore) || restStillMore;
          const next = {
            ...detailSnap,
            comments,
            timelineEvents: events,
            commentsMeta: {
              ...prevCm,
              loadedCount: comments.length,
              hasMore: commentsHasMore,
              complete: !commentsHasMore,
              watermark: meta.watermark || prevCm.watermark,
            },
            timelineMeta: {
              ...meta,
              direction: sortNewest ? 'newest' : 'oldest',
              hasMore,
              hasPreviousPage: Boolean(pi.hasPreviousPage),
              hasNextPage: Boolean(pi.hasNextPage),
              startCursor: nextStart,
              endCursor: nextEnd,
              pageInfo: pi,
              complete: !hasMore,
              source: page.source || 'graphql',
              loadedCount,
              totalCount:
                typeof page.totalCount === 'number'
                  ? page.totalCount
                  : meta.totalCount ?? null,
              coverageEndAt,
              pagesLoaded: (Number(meta.pagesLoaded) || 1) + 1,
            },
          };
          const progressed =
            comments.length > beforeComments ||
            events.length > beforeEvents ||
            (hasMore === false && Boolean(meta.hasMore));
          return { detail: next, progressed };
        };

        const threadsIncomplete = (snap = current.detail) => {
          const m = snap?.reviewThreadsMeta || {};
          return Boolean(m.hasMore || m.hasOlder);
        };
        const timelineIncomplete = (snap = current.detail) => {
          const m = snap?.timelineMeta || {};
          // Fallback: commentsMeta may mirror hasMore/cursors
          const cm = snap?.commentsMeta || {};
          return (
            Boolean(m.hasMore) ||
            m.complete === false ||
            (Boolean(cm.hasMore) && Boolean(cm.startCursor || m.startCursor))
          );
        };

        // Early exit when neither requested source can load
        if (
          (!wantThreads || !threadsIncomplete()) &&
          (!wantTimeline || !timelineIncomplete())
        ) {
          return current.detail;
        }

        const meta0 = current.detail.reviewThreadsMeta || {};
        const meta0TotalHint = Number(meta0.totalCount) || 0;
        if (loadAll && wantThreads) {
          paintLoadAllStage(meta0);
        } else {
          setLoadStage('threads', loadStageLabel('threads-more'), true, {
            percent: 8,
          });
          render();
        }

        try {
          const maxPages = loadAll ? 80 : 1;
          let next = current.detail;
          let pages = 0;
          let lastLoaded = Number(meta0.loadedThreadCount) || 0;

          while (pages < maxPages) {
            if (!current.open || Number(current.number) !== Number(number)) {
              return null;
            }
            if (gen !== detailFetchGen) return null;

            let anyProgress = false;
            const doThreads = wantThreads && threadsIncomplete(next);
            const doTimeline = wantTimeline && timelineIncomplete(next);

            if (!doThreads && !doTimeline) break;

            if (loadAll && wantThreads && doThreads) {
              const loaded =
                Number(next.reviewThreadsMeta?.loadedThreadCount) || 0;
              if (pages === 0 || loaded !== lastLoaded) {
                paintLoadAllStage(next.reviewThreadsMeta || {});
                lastLoaded = loaded;
              }
            }

            if (doThreads) {
              // Carry timelineMeta on the merge flat so no-store path preserves it;
              // store path keeps it on comments slice across publishDetailFromStore.
              const priorTimelineMeta =
                next.timelineMeta || current.detail?.timelineMeta || null;
              const step = await loadOneThreadPage(next);
              if (gen !== detailFetchGen) return null;
              if (!step.detail) return null;
              if (!step.progressed) {
                next = clearStuckThreads(step.detail, 'no-progress');
              } else {
                next = step.detail;
                anyProgress = true;
              }
              if (priorTimelineMeta != null && next.timelineMeta == null) {
                next = { ...next, timelineMeta: priorTimelineMeta };
              }
              applyThreadsToStore(next);
              next = current.detail;
              detailCache.set(detailKey(owner, repo, number), next);
            }

            if (doTimeline) {
              // timelineMeta must still be on current.detail after threads apply
              next = {
                ...current.detail,
                timelineMeta:
                  current.detail?.timelineMeta || next.timelineMeta || null,
              };
              const step = await loadOneTimelinePage(next);
              if (gen !== detailFetchGen) return null;
              if (!step.detail) return null;
              if (!step.progressed) {
                next = clearStuckTimeline(step.detail, 'no-progress');
              } else {
                next = step.detail;
                anyProgress = true;
              }
              // Comments / events / timelineMeta via comments side
              applySideToStore('comments', {
                comments: next.comments,
                commentsMeta: {
                  ...(next.commentsMeta || {}),
                  // Keep commentsMeta.hasMore from loadOneTimelinePage (OR of
                  // timeline + residual REST incompleteness) — do not force
                  // false solely from timelineMeta.hasMore.
                  loadedCount: Array.isArray(next.comments)
                    ? next.comments.length
                    : 0,
                  startCursor:
                    next.commentsMeta?.startCursor ??
                    next.timelineMeta?.startCursor ??
                    null,
                  endCursor:
                    next.commentsMeta?.endCursor ??
                    next.timelineMeta?.endCursor ??
                    null,
                  watermark:
                    next.commentsMeta?.watermark ??
                    next.timelineMeta?.watermark ??
                    null,
                },
                timelineEvents: next.timelineEvents,
                timelineMeta: next.timelineMeta,
              });
              next = current.detail;
              detailCache.set(detailKey(owner, repo, number), next);
            }

            pages += 1;
            if (!loadAll) break;
            if (!anyProgress) break;
          }
          clearLoadStage();
          render();
          return next;
        } catch (err) {
          if (current.open) {
            setLoadStage(
              'threads',
              loadStageLabel(
                loadAll ? 'threads-all-failed' : 'threads-more-failed',
                { message: err?.message }
              ),
              false
            );
            render();
          }
          return null;
        }
      },
      /**
       * Lazy-load full comments for GraphQL shell threads (resolved/collapsed).
       * One-shot by-id bulk; merge as direction `ids`. Idempotent when already loaded.
       * @param {string|string[]} threadNodeIds PRRT_…
       * @returns {Promise<object|null>} updated detail or null
       */
      onLoadReviewThreadComments: async (threadNodeIds) => {
        if (!owner || !repo || !number) return null;
        if (!globalThis.PRTreeFetch?.fetchReviewThreadsByIds) return null;
        if (!current.detail) return null;
        const RT =
          typeof globalThis !== 'undefined' && globalThis.PRModalReviewThreads
            ? globalThis.PRModalReviewThreads
            : {};
        const ids = [
          ...new Set(
            (Array.isArray(threadNodeIds)
              ? threadNodeIds
              : [threadNodeIds]
            )
              .map((id) => String(id || '').trim())
              .filter((id) =>
                typeof RT.isGraphqlReviewThreadNodeId === 'function'
                  ? RT.isGraphqlReviewThreadNodeId(id)
                  : /^PRRT_/i.test(id)
              )
          ),
        ];
        if (!ids.length) return current.detail;

        const detailSnap = current.detail;
        const threads = Array.isArray(detailSnap.reviewThreads)
          ? detailSnap.reviewThreads
          : [];
        const comments = Array.isArray(detailSnap.reviewComments)
          ? detailSnap.reviewComments
          : [];
        const missing =
          typeof RT.selectThreadIdsMissingComments === 'function'
            ? RT.selectThreadIdsMissingComments(threads, comments, {
                onlyThreadIds: ids,
              })
            : ids.filter((id) => {
                const t = threads.find(
                  (x) => x && String(x.threadNodeId) === id
                );
                if (t?.commentsLoaded === true) return false;
                return !comments.some(
                  (c) =>
                    c &&
                    !c._commentsPending &&
                    String(c.threadNodeId || '') === id
                );
              });
        if (!missing.length) return current.detail;

        const gen = detailFetchGen;
        try {
          const bulk = await globalThis.PRTreeFetch.fetchReviewThreadsByIds(
            missing,
            { signal: openFetchAbort?.signal || null }
          );
          if (gen !== detailFetchGen) return null;
          if (!current.open || Number(current.number) !== Number(number)) {
            return null;
          }
          const mergeFn =
            globalThis.PRTreeFetch?.mergeReviewThreadsPageIntoDetail || null;
          if (typeof mergeFn !== 'function') return current.detail;
          const next = mergeFn(current.detail, bulk, 'ids');
          applyThreadsToStore(next);
          detailCache.set(detailKey(owner, repo, number), current.detail);
          render();
          console.log(
            `[pr-plus] lazy thread comments: ${missing.length} id(s) → ` +
              `${bulk?.comments?.length || 0} comments ${owner}/${repo}#${number}`
          );
          return current.detail;
        } catch (err) {
          if (
            err?.name === 'AbortError' ||
            /aborted|AbortError/i.test(String(err?.message || ''))
          ) {
            return null;
          }
          console.log(
            `[pr-plus] lazy thread comments soft-fail: ${err?.message || err}`
          );
          return null;
        }
      },
      /**
       * Patch in-memory detail + cache after a successful meta write so a
       * remount / soft refresh does not resurrect pre-write assignees/labels.
       */
      /**
      /**
       * Narrow write-through. Returns { status: 'applied'|'stale'|'failed', error? }.
       * Never bumps detailFetchGen (openGen). Meta supersede keys bump metaRefreshGen only.
       */
      onPatchDetail: (patch) => runOnPatchDetail(patch, owner, repo, number),
      onFetchCompareFiles: async (base, head, options: any = {}) => {
        if (!owner || !repo) {
          throw new Error('No open repository for compare');
        }
        if (!globalThis.PRTreeFetch?.fetchCompareFiles) {
          throw new Error('Compare fetch unavailable');
        }
        return globalThis.PRTreeFetch.fetchCompareFiles(owner, repo, base, head, {
          gitattributesText:
            options.gitattributesText ||
            current.detail?.gitattributesText ||
            '',
          signal: openFetchAbort?.signal || null,
        });
      },
      /** Remaining PR commits beyond the initial page (for searchable picker). */
      onFetchAllPrCommits: async () => {
        if (!owner || !repo || !current.number) {
          throw new Error('No open pull request for commits');
        }
        if (!globalThis.PRTreeFetch?.fetchAllPrCommits) {
          throw new Error('Full commits fetch unavailable');
        }
        return globalThis.PRTreeFetch.fetchAllPrCommits(
          owner,
          repo,
          current.number
        );
      },
      /** Remaining PR files beyond the initial page (for searchable files nav). */
      onFetchAllPrFiles: async (options: any = {}) => {
        if (!owner || !repo || !current.number) {
          throw new Error('No open pull request for files');
        }
        if (!globalThis.PRTreeFetch?.fetchAllPrFiles) {
          throw new Error('Full files fetch unavailable');
        }
        return globalThis.PRTreeFetch.fetchAllPrFiles(owner, repo, current.number, {
          gitattributesText:
            options.gitattributesText ||
            current.detail?.gitattributesText ||
            '',
        });
      },
    };
  }

  /**
   * True when reactRoot is still bound to a live host element.
   * Soft-nav / Turbo often replace #prp-page-embed; reusing a detached root
   * paints into nothing while natives stay display:none.
   *
   * Note: mountPrModal stamps host.__prpReactRoot = createRoot(...), but
   * returns a {render,unmount} *wrapper*. Never compare stamp === reactRoot.
   */

