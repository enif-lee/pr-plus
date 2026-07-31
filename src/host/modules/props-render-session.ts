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
       *   - full-threads (diff header): core + last:100 + start:20 + Load all
       *   - revalidate (mutations / default): warm last:10 probe (escalate if needed)
       *     + remaining unresolved bulk
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
        const { gen, signal } = beginOpenFetchSession();
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
        const apiMax = 100;
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
            const threadSrc =
              current.detail &&
              Array.isArray(current.detail.reviewComments) &&
              current.detail.reviewComments.length
                ? current.detail
                : prevDetail;
            if (
              threadSrc &&
              Array.isArray(threadSrc.reviewComments) &&
              threadSrc.reviewComments.length &&
              (!Array.isArray(detail.reviewComments) ||
                !detail.reviewComments.length)
            ) {
              detail = {
                ...detail,
                reviewComments: threadSrc.reviewComments,
                reviewThreads: threadSrc.reviewThreads || detail.reviewThreads,
                reviewThreadsMeta:
                  threadSrc.reviewThreadsMeta || detail.reviewThreadsMeta,
                reviewCommentsMeta:
                  threadSrc.reviewCommentsMeta || detail.reviewCommentsMeta,
              };
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
              if (cachedHasPatches && !netHasPatches) {
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
            // Core refresh: meta slice only (isolation)
            ensureDetailStore(current.detail || prevDetail);
            applyCoreToStore(detail);
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

          // Parallel kickoff — warm revalidate uses probe; full-threads forces last:100
          const refreshThreadsCacheSnap = prevDetail || current.detail || null;
          const threadsNewestP =
            mode !== 'visible-threads' && canPageThreads
              ? fetchNewestReviewThreadsAdaptive(owner, repo, number, {
                  signal,
                  cacheDetail: refreshThreadsCacheSnap,
                  forceFull: mode === 'full-threads',
                })
                  .then((res) => {
                    const page = res.page;
                    prog.mark(
                      'threadsNewest',
                      uw.threadsNewest,
                      'threads',
                      loadStageLabel('threads-update')
                    );
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
                    prog.mark(
                      'threadsNewest',
                      uw.threadsNewest,
                      'threads',
                      loadStageLabel('threads-failed', { message: err?.message })
                    );
                    return { ok: false, err };
                  })
              : Promise.resolve({ ok: false, skipped: true }).then((r) => {
                  if (mode !== 'visible-threads') {
                    prog.mark(
                      'threadsNewest',
                      uw.threadsNewest,
                      'refresh',
                      loadStageLabel('refresh-meta')
                    );
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

          if (!canPageThreads) {
            prog.mark(
              'threadsNewest',
              uw.threadsNewest,
              'refresh',
              loadStageLabel('refresh')
            );
            prog.mark(
              'threadsFollow',
              uw.threadsFollow,
              'refresh',
              loadStageLabel('refresh')
            );
            tryFinishOpenProgress(prog);
            render();
            return;
          }

          // 2a) newest window (warm probe or full last:100) — await parallel kickoff
          setLoadStage(
            'threads',
            loadStageLabel('threads-update'),
            true,
            { percent: prog.percent() }
          );
          render();
          const t0 = nowMs();
          const kick = await threadsNewestP;
          if (!kick.ok) throw kick.err || new Error('Threads fetch failed');
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

          if (mode === 'full-threads') {
            // Diff: seed start window then drain all remaining pages
            if (totalCount >= apiMax && newest.hasPreviousPage) {
              try {
                setLoadStage('threads', loadStageLabel('threads-earlier'), true);
                render();
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
                if (!stillOpen()) return;
                if (typeof mergeFn === 'function') {
                  next = mergeFn(next, oldest, 'oldest');
                  applyThreadsToStore(next);
                  next = current.detail;
                  detailCache.set(key, next);
                  render();
                }
              } catch {
                /* keep last-only */
              }
            }
            prog.mark(
              'threadsFollow',
              uw.threadsFollow,
              'threads',
              loadStageLabel('threads-earlier')
            );
            if (stillOpen() && next?.reviewThreadsMeta?.hasMore) {
              const props = buildProps();
              if (typeof props.onLoadMoreReviewThreads === 'function') {
                await props.onLoadMoreReviewThreads('all');
              }
            } else if (stillOpen()) {
              tryFinishOpenProgress(prog);
              render();
            }
          } else {
            // Mutation revalidate: unresolved bulk for threads not in last:100
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
            // Bulk revalidate unresolved threads; drop remote-missing and re-check once
            // so a local zombie PRRT cannot block refresh forever.
            let unresolvedPass = 0;
            const knownMissing = new Set();
            while (
              unresolvedPass < 2 &&
              typeof globalThis.PRTreeFetch.fetchReviewThreadsByIds ===
                'function' &&
              typeof mergeFn === 'function'
            ) {
              unresolvedPass += 1;
              const remainingUnresolvedIds = collectIds(next).filter((id) => {
                const s = String(id);
                return !updatedIdSet.has(s) && !knownMissing.has(s);
              });
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
            prog.mark(
              'threadsFollow',
              uw.threadsFollow,
              'threads',
              loadStageLabel('threads-unresolved')
            );
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
       * Lazy GraphQL page of review threads (middle fold / dual-window).
       * @param {'older'|'newer'|'all'|string} [direction]
       *   older/newer: one page toward the gap
       *   all: keep paging until hasMore is false (full comment/thread corpus)
       */
      onLoadMoreReviewThreads: async (direction) => {
        if (!owner || !repo || !number) return null;
        if (!globalThis.PRTreeFetch?.fetchReviewThreadsPage) return null;
        if (!current.detail) return null;
        const loadAll =
          direction === 'all' ||
          direction === true ||
          (direction && String(direction).toLowerCase() === 'all');
        const gen = detailFetchGen;
        const mergeFn =
          globalThis.PRTreeFetch?.mergeReviewThreadsPageIntoDetail || null;

        const pickDirection = (meta) => {
          if (meta.hasOlder) return 'older';
          if (meta.hasNewerFromOldest) return 'newer';
          return null;
        };
        const cursorFor = (meta, dir) =>
          dir === 'older' || dir === 'newest'
            ? meta.newestStartCursor || meta.endCursor || null
            : meta.oldestEndCursor || null;

        const loadOnePage = async (detailSnap) => {
          const meta = detailSnap.reviewThreadsMeta || {};
          if (!meta.hasMore) return { detail: detailSnap, progressed: false };
          let dir = String(direction || '').toLowerCase();
          if (loadAll || !['older', 'newer', 'oldest', 'newest'].includes(dir)) {
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
          const beforeCount = Number(meta.loadedThreadCount) || 0;
          const page = await globalThis.PRTreeFetch.fetchReviewThreadsPage(
            owner,
            repo,
            number,
            {
              direction: dir,
              cursor,
              pageSize: 100,
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
            progressed: afterCount > beforeCount || Boolean(page?.threads?.length),
          };
        };

        let meta0 = current.detail.reviewThreadsMeta || {};
        if (!meta0.hasMore) return current.detail;

        const totalHint = Number(meta0.totalCount) || 0;
        const hidden0 = Number(meta0.hiddenCount) || 0;
        setLoadStage(
          'threads',
          loadAll
            ? loadStageLabel('threads-all', {
                loaded: meta0.loadedThreadCount || 0,
                total: totalHint || 0,
              })
            : loadStageLabel('threads-more'),
          true
        );
        render();

        try {
          // Single page (timeline gap) or drain dual-window until complete
          const maxPages = loadAll ? 80 : 1;
          let next = current.detail;
          let pages = 0;
          while (pages < maxPages) {
            const meta = next.reviewThreadsMeta || {};
            if (!meta.hasMore) break;
            const hidden = Number(meta.hiddenCount) || 0;
            const loaded = Number(meta.loadedThreadCount) || 0;
            if (loadAll) {
              setLoadStage(
                'threads',
                loadStageLabel('threads-all', {
                  loaded,
                  total: totalHint || 0,
                }),
                true
              );
              render();
            }
            const step = await loadOnePage(next);
            if (gen !== detailFetchGen) return null;
            if (!current.open || Number(current.number) !== Number(number)) {
              return null;
            }
            if (!step.detail) return null;
            applyThreadsToStore(step.detail);
            next = current.detail;
            detailCache.set(detailKey(owner, repo, number), next);
            pages += 1;
            if (!loadAll) break;
            if (!step.progressed) break;
            if (!(next.reviewThreadsMeta || {}).hasMore) break;
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
       * Patch in-memory detail + cache after a successful meta write so a
       * remount / soft refresh does not resurrect pre-write assignees/labels.
       */
      onPatchDetail: (patch) => {
        if (!patch || typeof patch !== 'object') return;
        if (!current.open || !current.detail) return;
        if (
          owner &&
          repo &&
          number &&
          (current.owner !== owner ||
            current.repo !== repo ||
            Number(current.number) !== Number(number))
        ) {
          return;
        }
        // Supersede in-flight soft-refreshes that started before this write so
        // their responses cannot resurrect pre-write assignees/labels.
        detailFetchGen += 1;
        const next = {
          ...current.detail,
          ...patch,
          avatarUrls: {
            ...(current.detail.avatarUrls || {}),
            ...(patch.avatarUrls && typeof patch.avatarUrls === 'object'
              ? patch.avatarUrls
              : {}),
          },
          // Meta lock is React-local only; never stick it in the SWR cache.
          _metaSeq: 0,
        };
        // Explicit empty arrays / null milestone must win (spread alone is fine)
        if (Object.prototype.hasOwnProperty.call(patch, 'assignees')) {
          next.assignees = Array.isArray(patch.assignees) ? patch.assignees : [];
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'labels')) {
          next.labels = Array.isArray(patch.labels) ? patch.labels : [];
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'requestedReviewers')) {
          next.requestedReviewers = Array.isArray(patch.requestedReviewers)
            ? patch.requestedReviewers
            : [];
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'milestone')) {
          next.milestone = patch.milestone == null ? null : patch.milestone;
        }
        // Meta + comment/thread slices: write-through so post-comment cache is real
        // (applyMeta alone dropped comments/reviewComments — stale reopen bug).
        const S = detailStoreApi();
        if (S) {
          ensureDetailStore(next);
          S.applyMeta(current.detailStore, S.pickMeta(next), {
            trustEmpty: true,
            source: 'patch',
            sketch: false,
          });
          if (Object.prototype.hasOwnProperty.call(patch, 'comments')) {
            S.applyComments(current.detailStore, next.comments, {
              settled: true,
              pageMeta: next.commentsMeta,
              timelineEvents: next.timelineEvents,
            });
          }
          if (
            Object.prototype.hasOwnProperty.call(patch, 'reviewComments') ||
            Object.prototype.hasOwnProperty.call(patch, 'reviewThreads') ||
            Object.prototype.hasOwnProperty.call(patch, 'reviewThreadsMeta') ||
            Object.prototype.hasOwnProperty.call(patch, 'reviewCommentsMeta')
          ) {
            S.applyThreadsFromMergedDetail(current.detailStore, next);
          }
          if (
            Object.prototype.hasOwnProperty.call(patch, 'viewerPendingReview')
          ) {
            S.applyPendingReview(
              current.detailStore,
              next.viewerPendingReview ?? null
            );
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'reviews')) {
            S.applyReviews(current.detailStore, next.reviews, {
              settled: true,
            });
          }
          publishDetailFromStore();
        } else {
          current.detail = next;
        }
        try {
          const key = detailKey(current.owner, current.repo, current.number);
          detailCache.set(key, current.detail);
        } catch {
          /* ignore */
        }
        // Lifecycle meta (merge/draft/close) must update open-list / stack / decorations
        if (
          Object.prototype.hasOwnProperty.call(patch, 'draft') ||
          Object.prototype.hasOwnProperty.call(patch, 'merged') ||
          Object.prototype.hasOwnProperty.call(patch, 'state')
        ) {
          try {
            if (typeof applyOpenPullLifecycle === 'function') {
              applyOpenPullLifecycle(
                current.owner,
                current.repo,
                current.number,
                {
                  draft: patch.draft,
                  merged: patch.merged,
                  state: patch.state,
                }
              );
            }
          } catch {
            /* ignore */
          }
        }
        // List-visible fields (labels/title/comments/…) → single-row re-render
        // under the overlay so PR→list close shows current shell truth.
        const touchesListRow =
          Object.prototype.hasOwnProperty.call(patch, 'labels') ||
          Object.prototype.hasOwnProperty.call(patch, 'title') ||
          Object.prototype.hasOwnProperty.call(patch, 'draft') ||
          Object.prototype.hasOwnProperty.call(patch, 'assignees') ||
          Object.prototype.hasOwnProperty.call(patch, 'comments') ||
          Object.prototype.hasOwnProperty.call(patch, 'baseRef') ||
          Object.prototype.hasOwnProperty.call(patch, 'headRef');
        if (touchesListRow) {
          try {
            applyOpenDetailToListRow({
              number: current.number,
              detail: current.detail,
              // Label meta writes may clear all chips — must force empty through
              forceLabels: Object.prototype.hasOwnProperty.call(patch, 'labels'),
            });
          } catch {
            /* ignore */
          }
        }
        render();
      },
      /** Files for a single commit or commit range (GitHub compare). */
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

  function isReactRootLiveOn(host) {
    if (!reactRoot || !host) return false;
    if (typeof reactRoot.render !== 'function') return false;
    if (reactRootHost !== host) return false;
    // Node may be detached after Turbo swap
    if (host.isConnected === false) return false;
    // createRoot stamp must still be present (wrapper unmount deletes it)
    if (!host.__prpReactRoot) return false;
    return true;
  }

  function dropReactRoot() {
    if (reactRoot) {
      try {
        reactRoot.unmount();
      } catch {
        /* ignore */
      }
    }
    // If wrapper unmount failed / partial, clear createRoot stamp on old host
    if (reactRootHost) {
      try {
        if (reactRootHost.__prpReactRoot) {
          try {
            // Real createRoot has .unmount(); stub may not
            reactRootHost.__prpReactRoot.unmount?.();
          } catch {
            /* ignore */
          }
          delete reactRootHost.__prpReactRoot;
        }
      } catch {
        /* ignore */
      }
    }
    reactRoot = null;
    reactRootHost = null;
  }

  function render() {
    if (typeof globalThis.mountPrModal !== 'function') {
      console.warn('[pr+] modal bundle not loaded (mountPrModal missing)');
      return;
    }

    if (!current.open) {
      dropReactRoot();
      // Tear down both hosts when closed
      try {
        const overlay = document.getElementById(HOST_ID);
        if (overlay) overlay.replaceChildren();
      } catch {
        /* ignore */
      }
      if (
        isEmbedPresentation(current.presentation) ||
        document.getElementById(embedHostId())
      ) {
        restoreNativeMain();
      }
      return;
    }

    // Keep CSS warming; host stays invisible (styles.css FOUC gate) until ready.
    // React may mount while hidden — when the sheet loads we flip data-prp-css-ready
    // so the first visible frame is already styled.
    void ensureAssets();

    const host = ensureHost();
    stampHostCssReady(host);
    const props = buildProps();

    if (isReactRootLiveOn(host)) {
      try {
        // Reuse root — preserves Diff layout, scrollTop, and search UI state.
        reactRoot.render(props);
        return;
      } catch (err) {
        console.warn('[pr+] root.render failed; remounting', err);
        dropReactRoot();
      }
    } else if (reactRoot) {
      // Host recreated or detached — unmount orphan and bind to the new node
      dropReactRoot();
    }

    // Stale createRoot stamp on this host (orphan after lost wrapper) — clear first
    try {
      if (host.__prpReactRoot) {
        try {
          host.__prpReactRoot.unmount?.();
        } catch {
          /* ignore */
        }
        delete host.__prpReactRoot;
      }
    } catch {
      /* ignore */
    }

    reactRoot = globalThis.mountPrModal(host, props);
    reactRootHost = host;
  }

  function persistOpenModal(owner, repo, number, extra: any = {}) {
    const api = sessionApi();
    if (typeof sessionStorage === 'undefined' || !api?.saveOpenModal) return;
    api.saveOpenModal(sessionStorage, {
      owner,
      repo,
      number,
      page: extra.page ?? current.routePage ?? null,
      position: extra.position ?? current.routePosition ?? null,
    });
  }

  function clearPersistedOpenModal() {
    const api = sessionApi();
    if (typeof sessionStorage === 'undefined' || !api?.clearOpenModal) return;
    api.clearOpenModal(sessionStorage);
  }

  /**
   * Write location. Embed / in-page PR shell uses GitHub-native
   * /pull/N[/changes[/{sha}|/{a}..{b}]]#diff-… ; list modal keeps prp_* query.
   */
  function writeUriRoute(route: any = {}) {
    const page = route.page ?? current.routePage ?? null;
    const number = route.number ?? current.number ?? null;
    const position = route.position !== undefined ? route.position : current.routePosition;

    const gh = githubRouteApi();
    const useGithubPath =
      isEmbedPresentation(current.presentation) &&
      current.owner &&
      current.repo &&
      number != null &&
      typeof gh?.replaceGithubPrLocation === 'function';

    if (useGithubPath) {
      try {
        const commitSha =
          route.commitSha !== undefined ? route.commitSha : current.routeCommitSha;
        const commitEndSha =
          route.commitEndSha !== undefined
            ? route.commitEndSha
            : current.routeCommitEndSha;
        const filePath =
          route.filePath !== undefined ? route.filePath : current.routeFilePath;
        const fileKey =
          route.fileKey !== undefined ? route.fileKey : current.routeFileKey;
        const startLine =
          route.startLine !== undefined ? route.startLine : current.routeStartLine;
        const endLine =
          route.endLine !== undefined ? route.endLine : current.routeEndLine;
        const side = route.side !== undefined ? route.side : current.routeSide;
        gh.replaceGithubPrLocation(
          typeof history !== 'undefined' ? history : null,
          typeof location !== 'undefined' ? location : null,
          {
            owner: current.owner,
            repo: current.repo,
            number,
            page: page === 'diff' ? 'diff' : 'conversation',
            commitSha: commitSha || null,
            commitEndSha: commitEndSha || null,
            filePath: filePath || null,
            fileKey: fileKey || null,
            startLine: startLine ?? null,
            endLine: endLine ?? null,
            side: side || null,
          }
        );
        lastEmbedPath = embedLocationKey();
      } catch {
        /* ignore */
      }
      return;
    }

    const api = uriApi();
    if (!api?.replaceLocationRoute) return;
    try {
      api.replaceLocationRoute(
        typeof history !== 'undefined' ? history : null,
        typeof location !== 'undefined' ? location : null,
        {
          page: page ?? null,
          number: number ?? null,
          position: position ?? null,
        }
      );
    } catch {
      /* ignore — non-browser / restricted */
    }
  }

  function clearUriRoute() {
    const api = uriApi();
    if (!api?.clearLocationRoute) return;
    try {
      api.clearLocationRoute(
        typeof history !== 'undefined' ? history : null,
        typeof location !== 'undefined' ? location : null
      );
    } catch {
      /* ignore */
    }
  }

  /**
   * Called from modal when layout / selection / commit filter changes.
   * Keeps session + URI in sync (replaceState only).
   */
  function persistRouteState(route: any = {}) {
    if (!current.open || !current.owner || !current.repo || !current.number) return;
    if (route.page != null) current.routePage = route.page;
    if (route.position !== undefined) current.routePosition = route.position || null;
    if (route.commitSha !== undefined) {
      current.routeCommitSha = route.commitSha || null;
    }
    if (route.commitEndSha !== undefined) {
      current.routeCommitEndSha = route.commitEndSha || null;
    }
    if (route.filePath !== undefined) current.routeFilePath = route.filePath || null;
    if (route.fileKey !== undefined) current.routeFileKey = route.fileKey || null;
    if (route.startLine !== undefined) current.routeStartLine = route.startLine ?? null;
    if (route.endLine !== undefined) current.routeEndLine = route.endLine ?? null;
    if (route.side !== undefined) current.routeSide = route.side || null;
    persistOpenModal(current.owner, current.repo, current.number, {
      page: current.routePage,
      position: current.routePosition,
    });
    writeUriRoute({
      page: current.routePage,
      number: current.number,
      position: current.routePosition,
      commitSha: current.routeCommitSha,
      commitEndSha: current.routeCommitEndSha,
      filePath: current.routeFilePath,
      fileKey: current.routeFileKey,
      startLine: current.routeStartLine,
      endLine: current.routeEndLine,
      side: current.routeSide,
    });
  }

  /**
   * Cancel all in-flight open-session fetches (content → SW → GitHub).
   * Safe to call when nothing is running.
   */
  function abortOpenFetches(reason = 'sheet-closed') {
    detailFetchGen += 1;
    const ac = openFetchAbort;
    openFetchAbort = null;
    // Bulk-cancel: known requestIds + every active SW GitHub fetch.
    // cancelAll covers the race where a FETCH is mid-flight before its id
    // is registered on the signal (or exclusive-queue pre-cancel misses).
    try {
      const ids = ac?.signal?.__prpRequestIds
        ? [...ac.signal.__prpRequestIds]
        : [];
      if (globalThis.PRTreeFetch?.cancelFetches) {
        void globalThis.PRTreeFetch.cancelFetches(ids, { cancelAll: true });
      }
    } catch {
      /* ignore */
    }
    if (ac) {
      try {
        ac.abort(reason);
      } catch {
        try {
          ac.abort();
        } catch {
          /* ignore */
        }
      }
    }
  }

  function beginOpenFetchSession() {
    // Supersede any previous open's network work immediately
    abortOpenFetches('superseded');
    openFetchAbort = new AbortController();
    // gen already bumped in abortOpenFetches; capture current for this session
    return {
      gen: detailFetchGen,
      signal: openFetchAbort.signal,
    };
  }

  /**
   * Best-effort list comment total from detail (issue comments).
   * Only when the page is complete (!hasMore) so we never under-count.
   */
  function estimateListCommentCount(detail: any) {
    if (!detail || !Array.isArray(detail.comments)) return null;
    const meta = detail.commentsMeta;
    if (meta && meta.hasMore) return null;
    return detail.comments.length;
  }

  /**
   * List-cache + native-row fields taken from the open PR detail.
   * Prefer this over full-list network / soft-reload.
   */
  function listRowFieldsFromDetail(detail: any, number: any) {
    if (!detail || typeof detail !== 'object') return null;
    const n = Number(number || detail.number);
    if (!Number.isFinite(n) || n <= 0) return null;
    const commentCount = estimateListCommentCount(detail);
    const fields: any = {
      number: n,
      title: detail.title != null ? String(detail.title) : undefined,
      draft: Boolean(detail.draft),
      state: detail.state != null ? String(detail.state) : undefined,
      merged: Boolean(detail.merged),
      baseRef: detail.baseRef || detail.base?.ref || undefined,
      headRef: detail.headRef || detail.head?.ref || undefined,
      author:
        typeof detail.author === 'string'
          ? detail.author
          : detail.author?.login || detail.user?.login || undefined,
      body: detail.body != null ? String(detail.body) : undefined,
      magicLinks: detail.magicLinks,
    };
    // Always forward labels/assignees when present as arrays (incl. empty).
    // Empty means user/API cleared them — must update list cache/DOM so reopen
    // list-sketch does not resurrect deleted chips.
    if (Array.isArray(detail.labels)) {
      fields.labels = detail.labels;
    }
    if (Array.isArray(detail.assignees)) {
      fields.assignees = detail.assignees;
    }
    if (commentCount != null) {
      fields.listCommentCount = commentCount;
    }
    // Drop undefined so patchCachedPr does not clobber with undefined
    for (const k of Object.keys(fields)) {
      if (fields[k] === undefined) delete fields[k];
    }
    return fields;
  }

  /**
   * Push open-PR truth into the list cache + re-render that one native row.
   * No full-list fetch / Turbo soft-reload — labels, title, draft, comments
   * come from the detail the user was just looking at.
   *
   * @param {{ number?: number, detail?: object, fields?: object, forceLabels?: boolean }} opts
   *   forceLabels: include labels even when empty (meta write cleared them)
   */
  function applyOpenDetailToListRow(opts: any = {}) {
    if (typeof isPullsListPage === 'function' && !isPullsListPage()) {
      return false;
    }
    const number = Number(opts?.number);
    let fields =
      opts?.fields ||
      listRowFieldsFromDetail(opts?.detail, number);
    if (!fields || !Number.isFinite(fields.number)) return false;

    // Explicit label writes (incl. clear-all) must reach the native row
    if (
      opts?.forceLabels &&
      opts?.detail &&
      Array.isArray(opts.detail.labels)
    ) {
      fields = { ...fields, labels: opts.detail.labels };
    }

    // 1) Tree / open-list cache (list sketch + decorations on reopen)
    try {
      const app = globalThis.__PR_TREE_APP__;
      if (typeof app?.patchCachedPr === 'function') {
        const cachePatch: any = { ...fields };
        delete cachePatch.listCommentCount;
        delete cachePatch.number;
        if (Object.keys(cachePatch).length) {
          app.patchCachedPr(fields.number, cachePatch);
        }
      }
    } catch {
      /* ignore */
    }

    // 2) Native row: labels / title / comment count / draft meta
    try {
      const dom = globalThis.PRTreeDOM;
      if (typeof dom?.applyListRowFromDetail === 'function') {
        return Boolean(
          dom.applyListRowFromDetail(document, fields.number, fields)
        );
      }
      // Fallback: comment count only
      if (
        typeof dom?.updateListRowCommentCount === 'function' &&
        Number.isFinite(fields.listCommentCount)
      ) {
        return Boolean(
          dom.updateListRowCommentCount(
            document,
            fields.number,
            fields.listCommentCount
          )
        );
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  /**
   * After PR shell closes on the pulls list: re-render that PR's list row
   * from the open detail snapshot (efficient single-row path).
   */
  function scheduleListResyncAfterPrShell(opts: any = {}) {
    if (typeof isPullsListPage === 'function' && !isPullsListPage()) return;
    try {
      applyOpenDetailToListRow(opts);
    } catch {
      /* ignore */
    }
  }

  function closeModal() {
    abortOpenFetches('sheet-closed');
    const wasEmbed = isEmbedPresentation(current.presentation);
    // Capture before wiping session — single-row re-render from open detail
    const listResync = {
      owner: current.owner,
      repo: current.repo,
      number: current.number,
      detail: current.detail,
      fields: listRowFieldsFromDetail(current.detail, current.number),
      // Empty labels/assignees must write through list cache on PR→list
      forceLabels: Array.isArray(current.detail?.labels),
    };
    clearPersistedOpenModal();
    // Keep native PR URL clean when embed closes (no prp_* strip needed if we never wrote)
    if (!wasEmbed) clearUriRoute();
    current = {
      open: false,
      loading: false,
      error: null,
      detail: null,
      detailStore: null,
      owner: null,
      repo: null,
      number: null,
      routePage: null,
      routePosition: null,
      routeCommitSha: null,
      routeCommitEndSha: null,
      routeFilePath: null,
      routeFileKey: null,
      routeStartLine: null,
      routeEndLine: null,
      routeSide: null,
      loadStage: null,
      sidePending: emptySideFlags(),
      sideSettled: emptySideFlags(),
      presentation: 'modal',
    };
    render();
    if (wasEmbed) restoreNativeMain();
    // After leaving embed (or closing overlay), re-offer native GH → pr+ toggle
    try {
      ensureGithubPrToggle();
    } catch {
      /* ignore */
    }
    // Modal on /pulls → list: re-render that PR row from detail (labels, title, …)
    if (!wasEmbed) {
      try {
        scheduleListResyncAfterPrShell(listResync);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Open PR shell. **First paint is synchronous** (list sketch / memory / skeleton).
   * Never await storage or network before that paint — network core upgrades after.
   * Returns a Promise for the background fetch chain (callers may void it).
   */
