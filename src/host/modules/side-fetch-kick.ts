// TypeScript SoT — assembled by build scripts (classic runtime JS emit)

  /**
   * True when a files[] snapshot can paint Diff (has patches, or only
   * legitimately patchless entries). Slim IDB rows use `_patchOmitted`.
   * Host pure global may lag rebuild — keep this inline for settle gates.
   */
  function filesSnapshotHasUsableDiffBodies(files) {
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

  function kickIndependentSideFetches({
    owner,
    repo,
    number,
    headSha = null,
    body = '',
    gen,
    stillOpenFn = null,
    signal = null,
  }) {
    const alive = () => {
      if (gen != null && gen !== detailFetchGen) return false;
      if (typeof stillOpenFn === 'function' && !stillOpenFn()) return false;
      return Boolean(current.open);
    };
    const settleSide = (key, partial) => {
      if (!alive()) return;
      let applied = false;
      if (partial && typeof partial === 'object') {
        // Slice-only write — never spreads into other domains
        applySideToStore(key, partial);
        applied = true;
        try {
          const keyStr = detailKey(owner, repo, number);
          detailCache.set(keyStr, current.detail);
        } catch {
          /* ignore */
        }
      }
      // Flag-only settle may no-op when already settled (IDB/cache revalidate).
      // setSideFlag only re-renders on flag *change*, so GraphQL timelineMeta
      // upgrades after a prior comments settle would never reach React — Load
      // more gap stays missing despite host diag hasMore:true (TLM.1).
      const flagChanged = setSideFlag(
        key,
        { pending: false, settled: true },
        { render: false }
      );
      if (applied || flagChanged) {
        try {
          render();
        } catch {
          /* ignore */
        }
      }
      markSideProgress(key);
      console.log(
        `[pr-plus] side-fetch ${key} ${owner}/${repo}#${number} painted`
      );
    };
    const failSide = (key, err) => {
      if (
        err?.name === 'AbortError' ||
        /aborted|AbortError/i.test(String(err?.message || ''))
      ) {
        // Aborted/superseded open — do not credit the new session's progress
        // and do not invent settled empty authority.
        return;
      }
      console.log(
        `[pr-plus] side-fetch ${key} soft-fail ${err?.message || err}`
      );
      // Soft-fail: clear pending skeleton + credit progress terminal, but do
      // NOT set settled:true (would invent authoritative empty and wipe lists).
      if (alive()) {
        setSideFlag(key, { pending: false }, { render: true });
        markSideProgress(key);
      }
    };
    /** Credit progress when a panel is skipped (no API / no headSha). */
    const creditSide = (key) => {
      markSideProgress(key);
    };

    const api = globalThis.PRTreeFetch;
    if (!api) {
      for (const k of [
        'files',
        'comments',
        'reviews',
        'commits',
        'checks',
        'development',
      ]) {
        creditSide(k);
      }
      return {
        filesP: null,
        commentsP: null,
        reviewsP: null,
        commitsP: null,
        checksP: null,
        developmentP: null,
      };
    }

    // Dedupe concurrent kicks for the same open gen (early kick + paintCoreNow)
    if (!current._sideKickStarted || current._sideKickGen !== gen) {
      current._sideKickStarted = new Set();
      current._sideKickGen = gen;
    }
    const started = current._sideKickStarted;
    const claim = (key) => {
      if (started.has(key)) return false;
      started.add(key);
      return true;
    };

    // Mark pending only when panel has no settled cache — revalidate keeps content
    const markPendingIfNeeded = (key, cond = true) => {
      if (cond && !current.sideSettled?.[key]) {
        setSideFlag(key, { pending: true }, { render: true });
      }
    };

    let filesP = Promise.resolve(null);
    let commentsP = Promise.resolve(null);
    let reviewsP = Promise.resolve(null);
    let commitsP = Promise.resolve(null);
    let checksP = Promise.resolve(null);
    let developmentP = Promise.resolve(null);

    const tl = getFetchTimeline();
    const wrap = (name, p, meta: any = undefined) =>
      tl && typeof tl.span === 'function' ? tl.span(name, p, meta) : p;

    // Files list is deferred: conversation aside / Diff first-need owns the
    // fetch. Credit progress so open loadStage can finish without the list.
    // Same headSha + usable Diff bodies → settle from cache (no re-fetch).
    // Slim IDB (`_patchOmitted`) or head mismatch → leave unsettled so
    // ensureAllFiles fetches patches.
    if (claim('files')) {
      const snap = current.detail || null;
      const snapFiles = Array.isArray(snap?.files) ? snap.files : [];
      const idb =
        typeof globalThis !== 'undefined'
          ? (globalThis as any).PRModalDetailIdb
          : null;
      const reuse =
        typeof idb?.mayReuseFilesCommitsDiff === 'function'
          ? idb.mayReuseFilesCommitsDiff(snap, {
              headSha: headSha || snap?.headSha || null,
              changedFiles: snap?.changedFiles,
            })
          : null;
      const bodiesOk =
        reuse != null
          ? Boolean(reuse.reuseFiles)
          : filesSnapshotHasUsableDiffBodies(snapFiles) &&
            snapFiles.length > 0 &&
            Boolean(
              String(snap?.headSha || headSha || '')
                .trim()
            );
      const reason =
        reuse?.reason ||
        (bodiesOk ? 'reuse' : snapFiles.length ? 'cache-slim' : 'empty');
      try {
        console.log(
          `[pr-plus] side-fetch files ${owner}/${repo}#${number} ` +
            `cache-reuse=${bodiesOk ? 1 : 0} reason=${reason}` +
            (headSha ? ` head=${String(headSha).slice(0, 7)}` : '')
        );
        for (const id of [HOST_ID, embedHostId()]) {
          try {
            const el = document.getElementById(id);
            if (!el) continue;
            el.setAttribute(
              'data-prp-cache-files',
              bodiesOk ? 'reuse' : String(reason).slice(0, 24)
            );
            if (headSha) {
              el.setAttribute(
                'data-prp-head-sha',
                String(headSha).slice(0, 12)
              );
            }
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
      if (current.sideSettled?.files && bodiesOk) {
        creditSide('files');
      } else if (snapFiles.length > 0 && bodiesOk) {
        // Same head + usable Diff bodies — mark settled, no re-fetch
        settleSide('files', {
          files: snapFiles,
          gitattributesText: current.detail?.gitattributesText || '',
        });
      } else {
        // Lazy, slim, or head-mismatch: Diff ensureAllFiles will fetch patches
        if (alive()) {
          setSideFlag(
            'files',
            { pending: false, settled: false },
            { render: false }
          );
        }
        creditSide('files');
      }
    }

    if (claim('comments')) {
      markPendingIfNeeded('comments');
      // GraphQL-first: always fetch unfiltered timelineItems (tip filters are
      // client-only). REST issue comments + events remain fallback.
      // Docs: GraphQL first/last ≤100; issue events/timeline have no published
      // total/30d cap (Activity Events 300/30d is a different API). Dense PRs
      // may still omit some system events unfiltered — see timeline-items.ts.
      const sinceWatermark =
        current.detail?.timelineMeta?.watermark ||
        current.detail?.commentsMeta?.watermark ||
        null;
      // reverseComments true → oldest-first (no since incremental).
      const sortNewest = prefs?.reverseComments !== true;
      commentsP = wrap(
        'side.comments',
        (async () => {
          const paintTimelinePage = (page: any, source: string) => {
            const items = Array.isArray(page?.comments)
              ? page.comments
              : Array.isArray(page?.items)
                ? page.items
                : Array.isArray(page)
                  ? page
                  : [];
            const events = Array.isArray(page?.timelineEvents)
              ? page.timelineEvents
              : [];
            const reviews = Array.isArray(page?.reviews) ? page.reviews : null;
            try {
              for (const id of [
                HOST_ID,
                typeof embedHostId === 'function'
                  ? embedHostId()
                  : 'prp-page-embed',
              ]) {
                const el = document.getElementById(id);
                el?.setAttribute?.(
                  'data-prp-comments-fetch',
                  String(items.length)
                );
                el?.setAttribute?.(
                  'data-prp-timeline-source',
                  source || 'unknown'
                );
              }
              sessionStorage.setItem(
                'prp:diag:comments-fetch',
                JSON.stringify({
                  n: items.length,
                  events: events.length,
                  source,
                  hasMeta: Boolean(page?.pageInfo || page?.meta),
                  sample: items.slice(0, 3).map((c: any) => ({
                    id: c?.id,
                    author: c?.author,
                  })),
                  at: Date.now(),
                })
              );
            } catch {
              /* ignore */
            }
            const pure = (globalThis as any).PRModalConversationTimeline;
            let watermark = sinceWatermark;
            try {
              if (typeof pure?.maxTimelineWatermark === 'function') {
                const w = pure.maxTimelineWatermark([
                  ...items.map((c: any) => ({
                    at: c.createdAt || c.at,
                  })),
                  ...events,
                ]);
                if (w) watermark = w;
              }
            } catch {
              /* ignore */
            }
            const pi = page?.pageInfo || null;
            let coverageEndAt: string | null = null;
            try {
              if (typeof pure?.minTimelineCoverageEndAt === 'function') {
                coverageEndAt = pure.minTimelineCoverageEndAt(items, events);
              }
            } catch {
              /* ignore */
            }
            const direction =
              page?.direction || (sortNewest ? 'newest' : 'oldest');
            const totalCount =
              typeof page?.totalCount === 'number' ? page.totalCount : null;
            const loadedCount = items.length + events.length;
            // GraphQL pageInfo is the pagination authority. totalCount includes
            // node types omitted by the Conversation mapper, so comparing it to
            // rendered items creates a permanent false "Load all" gap.
            let hasMore = Boolean(page?.hasMore);
            if (direction === 'oldest') {
              hasMore = hasMore || Boolean(pi?.hasNextPage);
            } else {
              hasMore = hasMore || Boolean(pi?.hasPreviousPage);
            }
            // Preserve older-edge cursor after since-incremental merge
            const prevTl = current.detail?.timelineMeta || null;
            let startCursor = pi?.startCursor || null;
            let endCursor = pi?.endCursor || null;
            if (sinceWatermark && sortNewest && prevTl) {
              if (prevTl.startCursor && !startCursor) {
                startCursor = prevTl.startCursor;
              }
              if (prevTl.hasMore) hasMore = true;
              // Keep newest endCursor for watermark; prefer prev older edge
              if (prevTl.startCursor) startCursor = prevTl.startCursor;
              if (!endCursor && prevTl.endCursor) endCursor = prevTl.endCursor;
            }
            const timelineMeta = {
              direction,
              hasMore,
              hasPreviousPage: Boolean(pi?.hasPreviousPage),
              hasNextPage: Boolean(pi?.hasNextPage),
              startCursor,
              endCursor,
              pageInfo: pi,
              watermark,
              coverageEndAt,
              complete: !hasMore,
              source: source || page?.source || 'graphql',
              loadedCount,
              totalCount,
              pagesLoaded: Number(prevTl?.pagesLoaded) || 1,
            };
            const patch: any = {
              comments: items,
              commentsMeta: {
                ...(page?.meta && typeof page.meta === 'object'
                  ? page.meta
                  : {}),
                page: page?.meta?.page ?? 1,
                perPage: page?.meta?.perPage ?? items.length,
                hasMore,
                nextPage: page?.meta?.nextPage ?? null,
                loadedCount: items.length,
                watermark,
                source: source || page?.meta?.source || 'graphql',
                // Mirror cursors so pagination works even if timelineMeta drops
                startCursor: timelineMeta.startCursor,
                endCursor: timelineMeta.endCursor,
              },
              timelineEvents: events,
              timelineMeta,
            };
            if (reviews && reviews.length) {
              // Merge review summaries from timeline; keep existing if richer.
              const prev = Array.isArray(current.detail?.reviews)
                ? current.detail.reviews
                : [];
              if (!prev.length) patch.reviews = reviews;
            }
            settleSide('comments', patch);
            // After settle: stamp Load-more observability (cold-open e2e)
            try {
              const tl = current.detail?.timelineMeta;
              for (const id of [
                HOST_ID,
                typeof embedHostId === 'function'
                  ? embedHostId()
                  : 'prp-page-embed',
              ]) {
                const el = document.getElementById(id);
                if (!el || !tl || typeof tl !== 'object') continue;
                el.setAttribute(
                  'data-prp-timeline-has-more',
                  tl.hasMore ? '1' : '0'
                );
                el.setAttribute(
                  'data-prp-timeline-loaded',
                  String(tl.loadedCount ?? '')
                );
                el.setAttribute(
                  'data-prp-timeline-total',
                  String(tl.totalCount ?? '')
                );
              }
            } catch {
              /* ignore */
            }
            return page;
          };

          // Hybrid GraphQL-first timeline:
          // - GraphQL timelineItems for system events (+ any comments in window)
          // - REST issue comments always (timeline window can be event-noise with
          //   0 IssueComments among last:100). Merge so Conversation never loses
          //   comments when GraphQL events paint first.
          if (typeof api.fetchPrTimelineItemsPage === 'function') {
            try {
              try {
                sessionStorage.setItem(
                  'prp:diag:timeline-gql',
                  JSON.stringify({
                    phase: 'start',
                    owner,
                    repo,
                    number,
                    sortNewest,
                    sinceWatermark,
                    at: Date.now(),
                  })
                );
              } catch {
                /* ignore */
              }
              const gqlOpts = {
                signal,
                direction: sortNewest ? 'newest' : 'oldest',
                pageSize: 100,
                since:
                  sortNewest && sinceWatermark ? sinceWatermark : null,
              };
              const restCommentsP =
                typeof api.fetchPrIssueComments === 'function'
                  ? api
                      .fetchPrIssueComments(owner, repo, number, { signal })
                      .catch((err: any) => {
                        if (
                          err?.name === 'AbortError' ||
                          /aborted|AbortError/i.test(
                            String(err?.message || '')
                          )
                        ) {
                          throw err;
                        }
                        return null;
                      })
                  : Promise.resolve(null);

              const page = await api.fetchPrTimelineItemsPage(
                owner,
                repo,
                number,
                gqlOpts
              );
              const restPage = await restCommentsP;
              if (!alive()) return null;

              const pure = (globalThis as any).PRModalConversationTimeline;
              let gqlComments = Array.isArray(page?.comments)
                ? page.comments
                : [];
              let gqlEvents = Array.isArray(page?.timelineEvents)
                ? page.timelineEvents
                : [];
              const restItems = Array.isArray(restPage?.items)
                ? restPage.items
                : Array.isArray(restPage)
                  ? restPage
                  : [];
              // Prefer union of GraphQL + REST comments by id.
              // mergeTimelineItemsById preserves GraphQL isMinimized when REST
              // omits Minimizable (otherwise hide state vanishes on refresh).
              let comments = gqlComments;
              if (restItems.length) {
                if (typeof pure?.mergeTimelineItemsById === 'function') {
                  comments = pure.mergeTimelineItemsById(
                    gqlComments,
                    restItems
                  );
                } else {
                  const byId = new Map(
                    gqlComments.map((c: any) => [String(c?.id), c])
                  );
                  const mergeMin =
                    typeof pure?.mergeCommentMinimizeFields === 'function'
                      ? pure.mergeCommentMinimizeFields
                      : (a: any, b: any) => ({ ...a, ...b });
                  for (const c of restItems) {
                    if (c?.id == null) continue;
                    const k = String(c.id);
                    const prev = byId.get(k);
                    byId.set(k, prev ? mergeMin(prev, c) : c);
                  }
                  comments = [...byId.values()];
                }
              }

              // since-incremental: merge onto prior
              if (sinceWatermark && sortNewest && page && !page.error) {
                const prevComments = Array.isArray(current.detail?.comments)
                  ? current.detail.comments
                  : [];
                const prevEvents = Array.isArray(
                  current.detail?.timelineEvents
                )
                  ? current.detail.timelineEvents
                  : [];
                if (typeof pure?.mergeTimelineItemsById === 'function') {
                  comments = pure.mergeTimelineItemsById(
                    prevComments,
                    comments
                  );
                  gqlEvents = pure.mergeTimelineItemsById(
                    prevEvents,
                    gqlEvents
                  );
                }
                // Drain further since pages (events + comments)
                let cursor = page.pageInfo?.endCursor || null;
                let hasMore = Boolean(page.hasMore);
                let guard = 0;
                while (hasMore && cursor && guard < 20) {
                  guard += 1;
                  const more = await api.fetchPrTimelineItemsPage(
                    owner,
                    repo,
                    number,
                    {
                      signal,
                      direction: 'newest',
                      since: sinceWatermark,
                      cursor,
                      pageSize: 100,
                    }
                  );
                  if (!alive()) return null;
                  const mc = Array.isArray(more?.comments) ? more.comments : [];
                  const me = Array.isArray(more?.timelineEvents)
                    ? more.timelineEvents
                    : [];
                  if (typeof pure?.mergeTimelineItemsById === 'function') {
                    comments = pure.mergeTimelineItemsById(comments, mc);
                    gqlEvents = pure.mergeTimelineItemsById(gqlEvents, me);
                  }
                  hasMore = Boolean(more?.hasMore);
                  cursor = more?.pageInfo?.endCursor || null;
                  if (!mc.length && !me.length) break;
                }
              }

              // Effective hasMore for load-more (older pages), not since-forward only
              const totalCount =
                typeof page?.totalCount === 'number' ? page.totalCount : null;
              const loadedCount = comments.length + gqlEvents.length;
              const pi = page?.pageInfo || null;
              let paintHasMore = Boolean(page?.hasMore);
              if (sortNewest) {
                paintHasMore =
                  paintHasMore || Boolean(pi?.hasPreviousPage);
              } else {
                paintHasMore = paintHasMore || Boolean(pi?.hasNextPage);
              }
              if (
                sinceWatermark &&
                sortNewest &&
                current.detail?.timelineMeta?.hasMore
              ) {
                paintHasMore = true;
              }

              try {
                sessionStorage.setItem(
                  'prp:diag:timeline-gql',
                  JSON.stringify({
                    phase: 'result',
                    comments: comments.length,
                    events: gqlEvents.length,
                    reviews: Array.isArray(page?.reviews)
                      ? page.reviews.length
                      : 0,
                    hasMore: paintHasMore,
                    pageHasMore: page?.hasMore,
                    totalCount,
                    loadedCount,
                    hasPreviousPage: pi?.hasPreviousPage,
                    hasNextPage: pi?.hasNextPage,
                    startCursor: pi?.startCursor || null,
                    sinceWatermark: sinceWatermark || null,
                    source: page?.error ? 'rest-fallback' : 'graphql',
                    error: page?.error || null,
                    gqlComments: gqlComments.length,
                    restComments: restItems.length,
                    at: Date.now(),
                  })
                );
              } catch {
                /* ignore */
              }

              if (
                page &&
                !page.error &&
                (comments.length > 0 ||
                  gqlEvents.length > 0 ||
                  (page.reviews || []).length > 0)
              ) {
                paintTimelinePage(
                  {
                    comments,
                    timelineEvents: gqlEvents,
                    reviews: page.reviews,
                    hasMore: paintHasMore,
                    pageInfo: page.pageInfo,
                    direction: page.direction,
                    totalCount,
                    meta: restPage?.meta || {
                      page: 1,
                      perPage: comments.length,
                      hasMore: paintHasMore,
                      loadedCount: comments.length,
                    },
                  },
                  sinceWatermark ? 'graphql-since' : 'graphql'
                );
                return page;
              }
            } catch (err: any) {
              if (
                err?.name === 'AbortError' ||
                /aborted|AbortError/i.test(String(err?.message || ''))
              ) {
                throw err;
              }
              try {
                sessionStorage.setItem(
                  'prp:diag:timeline-gql',
                  JSON.stringify({
                    phase: 'error',
                    err: String(err?.message || err || '').slice(0, 400),
                    at: Date.now(),
                  })
                );
              } catch {
                /* ignore */
              }
              console.log(
                `[pr-plus] side-fetch timelineItems soft-fail → REST ${err?.message || err}`
              );
            }
          } else {
            try {
              sessionStorage.setItem(
                'prp:diag:timeline-gql',
                JSON.stringify({
                  phase: 'no-fn',
                  at: Date.now(),
                })
              );
            } catch {
              /* ignore */
            }
          }

          // REST fallback: issue comments + events (decoupled)
          if (typeof api.fetchPrIssueComments !== 'function') {
            if (alive() && !current.sideSettled?.comments) {
              setSideFlag('comments', { pending: false, settled: true });
            }
            creditSide('comments');
            return null;
          }
          let pendingTimelineEvents: any = null;
          const eventsFetch =
            typeof api.fetchPrTimelineEvents === 'function'
              ? api
                  .fetchPrTimelineEvents(owner, repo, number, { signal })
                  .catch((err: any) => {
                    if (
                      err?.name === 'AbortError' ||
                      /aborted|AbortError/i.test(String(err?.message || ''))
                    ) {
                      throw err;
                    }
                    return [];
                  })
              : Promise.resolve(null);

          const page = await api.fetchPrIssueComments(owner, repo, number, {
            signal,
          });
          if (!alive()) return null;
          const items = Array.isArray(page?.items)
            ? page.items
            : Array.isArray(page)
              ? page
              : [];
          if (!items.length && page == null) {
            failSide('comments', new Error('issue comments page missing'));
            return null;
          }
          paintTimelinePage(
            {
              comments: items,
              timelineEvents: pendingTimelineEvents || [],
              meta: page?.meta,
              hasMore: Boolean(page?.meta?.hasMore),
            },
            'rest'
          );
          void eventsFetch.then((events: any) => {
            if (!Array.isArray(events) || !alive()) return;
            pendingTimelineEvents = events;
            const curItems = Array.isArray(
              current.detailStore?.comments?.items
            )
              ? current.detailStore.comments.items
              : Array.isArray(current.detail?.comments)
                ? current.detail.comments
                : items;
            settleSide('comments', {
              comments: curItems,
              commentsMeta:
                current.detailStore?.comments?.pageMeta ||
                current.detail?.commentsMeta ||
                null,
              timelineEvents: events,
            });
          });
          return page;
        })()
      );
    }

    if (claim('reviews')) {
      markPendingIfNeeded('reviews');
      reviewsP =
        typeof api.fetchPrReviews === 'function'
          ? wrap(
              'side.reviews',
              api
                .fetchPrReviews(owner, repo, number, { signal })
                .then((reviews) => {
                  settleSide('reviews', {
                    reviews: Array.isArray(reviews) ? reviews : [],
                  });
                  return reviews;
                })
                .catch((err) => {
                  failSide('reviews', err);
                  return null;
                })
            )
          : Promise.resolve(null).then(() => {
              if (alive() && !current.sideSettled?.reviews) {
                setSideFlag('reviews', { pending: false, settled: true });
              }
              creditSide('reviews');
              return null;
            });
    }

    // Commits list deferred (aside first-open / Diff commit picker).
    // Reuse only when same headSha as seed/core and cache has commits.
    if (claim('commits')) {
      const snap = current.detail || null;
      const idb =
        typeof globalThis !== 'undefined'
          ? (globalThis as any).PRModalDetailIdb
          : null;
      const reuse =
        typeof idb?.mayReuseFilesCommitsDiff === 'function'
          ? idb.mayReuseFilesCommitsDiff(snap, {
              headSha: headSha || snap?.headSha || null,
            })
          : null;
      const canReuseCommits =
        reuse != null
          ? Boolean(reuse.reuseCommits)
          : Array.isArray(snap?.commits) &&
            snap.commits.length > 0 &&
            Boolean(String(snap?.headSha || headSha || '').trim());
      try {
        console.log(
          `[pr-plus] side-fetch commits ${owner}/${repo}#${number} ` +
            `cache-reuse=${canReuseCommits ? 1 : 0}` +
            (reuse?.reason ? ` reason=${reuse.reason}` : '')
        );
      } catch {
        /* ignore */
      }
      if (current.sideSettled?.commits && canReuseCommits) {
        creditSide('commits');
      } else if (
        canReuseCommits &&
        Array.isArray(snap?.commits) &&
        snap.commits.length > 0
      ) {
        settleSide('commits', {
          commits: snap.commits,
        });
      } else {
        if (alive()) {
          setSideFlag(
            'commits',
            { pending: false, settled: false },
            { render: false }
          );
        }
        creditSide('commits');
      }
    }

    // checks needs headSha — may be claimed later when core paints with sha
    if (headSha && claim('checks')) {
      markPendingIfNeeded('checks');
      checksP =
        typeof api.fetchPrChecks === 'function'
          ? wrap(
              'side.checks',
              api
                .fetchPrChecks(owner, repo, headSha, { signal })
                .then((checks) => {
                  settleSide('checks', {
                    checks: checks || {
                      state: 'unknown',
                      totalCount: 0,
                      statuses: [],
                      checkRuns: [],
                    },
                  });
                  return checks;
                })
                .catch((err) => {
                  failSide('checks', err);
                  return null;
                }),
              { headSha: String(headSha).slice(0, 7) }
            )
          : Promise.resolve(null).then(() => {
              if (alive() && !current.sideSettled?.checks) {
                setSideFlag('checks', { pending: false, settled: true });
              }
              creditSide('checks');
              return null;
            });
    } else if (!headSha) {
      // No head yet — do not credit checks until core paints headSha, unless
      // this open will never get head (rare). Credit only if already settled.
      if (current.sideSettled?.checks) creditSide('checks');
    }

    if (claim('development')) {
      markPendingIfNeeded('development');
      developmentP =
        typeof api.fetchPrDevelopment === 'function'
          ? wrap(
              'side.development',
              api
                .fetchPrDevelopment(owner, repo, number, {
                  signal,
                  body: body || '',
                })
                .then((dev) => {
                  if (!dev || typeof dev !== 'object') {
                    settleSide('development', {
                      linkedIssues: [],
                      developmentIssues: [],
                      projects: [],
                    });
                    return null;
                  }
                  settleSide('development', {
                    linkedIssues: Array.isArray(dev.linkedIssues)
                      ? dev.linkedIssues
                      : [],
                    developmentIssues: Array.isArray(dev.developmentIssues)
                      ? dev.developmentIssues
                      : [],
                    projects: Array.isArray(dev.projects) ? dev.projects : [],
                  });
                  return dev;
                })

                .catch((err) => {
                  failSide('development', err);
                  return null;
                })
            )
          : Promise.resolve(null).then(() => {
              if (alive() && !current.sideSettled?.development) {
                setSideFlag('development', { pending: false, settled: true });
              }
              creditSide('development');
              return null;
            });
    }

    return {
      filesP,
      commentsP,
      reviewsP,
      commitsP,
      checksP,
      developmentP,
    };
  }
