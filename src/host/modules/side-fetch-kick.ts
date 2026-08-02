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
      if (partial && typeof partial === 'object') {
        // Slice-only write — never spreads into other domains
        applySideToStore(key, partial);
        try {
          const keyStr = detailKey(owner, repo, number);
          detailCache.set(keyStr, current.detail);
        } catch {
          /* ignore */
        }
      }
      setSideFlag(key, { pending: false, settled: true }, { render: true });
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
      // Skip REST issue events when all system tips (labels/title/milestone) are off.
      let wantSystemEvents = true;
      try {
        const pure = (globalThis as any).PRModalConversationTimeline;
        const vis =
          prefs?.timelineVisibility ??
          pure?.DEFAULT_TIMELINE_VISIBILITY ??
          null;
        if (typeof pure?.shouldFetchSystemTimelineEvents === 'function') {
          wantSystemEvents = pure.shouldFetchSystemTimelineEvents(vis);
        } else {
          const v = vis || {};
          wantSystemEvents =
            v.labels !== false ||
            v.title !== false ||
            v.milestone !== false ||
            v.referenced !== false;
        }
      } catch {
        wantSystemEvents = true;
      }
      commentsP =
        typeof api.fetchPrIssueComments === 'function'
          ? wrap(
              'side.comments',
              Promise.all([
                api.fetchPrIssueComments(owner, repo, number, { signal }),
                wantSystemEvents &&
                typeof api.fetchPrTimelineEvents === 'function'
                  ? api
                      .fetchPrTimelineEvents(owner, repo, number, { signal })
                      .catch((err) => {
                        if (
                          err?.name === 'AbortError' ||
                          /aborted|AbortError/i.test(
                            String(err?.message || '')
                          )
                        ) {
                          throw err;
                        }
                        return [];
                      })
                  : Promise.resolve(null),
              ])
                .then(([page, events]) => {
                  const items = Array.isArray(page?.items)
                    ? page.items
                    : Array.isArray(page)
                      ? page
                      : [];
                  const patch: any = {
                    comments: items,
                    commentsMeta: page?.meta || {
                      page: 1,
                      perPage: items.length,
                      hasMore: false,
                      nextPage: null,
                      loadedCount: items.length,
                    },
                  };
                  // Only overwrite timelineEvents when we actually fetched
                  // (null skip keeps prior / empty until lazy tip re-enable).
                  if (Array.isArray(events)) {
                    patch.timelineEvents = events;
                  }
                  settleSide('comments', patch);
                  return page;
                })
                .catch((err) => {
                  failSide('comments', err);
                  return null;
                })
            )
          : Promise.resolve(null).then(() => {
              if (alive() && !current.sideSettled?.comments) {
                setSideFlag('comments', { pending: false, settled: true });
              }
              creditSide('comments');
              return null;
            });
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

