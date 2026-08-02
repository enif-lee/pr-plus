  // continued host module segment
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
      metaGenAtStart: metaRefreshGen,
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
    // Milestone write-through so list-sketch reopen paints the just-set board
    // (pulls list API often omits milestone; modal patch is authoritative).
    if (Object.prototype.hasOwnProperty.call(detail, 'milestone')) {
      fields.milestone =
        detail.milestone == null
          ? null
          : {
              number:
                detail.milestone.number != null
                  ? Number(detail.milestone.number)
                  : null,
              title: String(detail.milestone.title || ''),
              state: detail.milestone.state || '',
            };
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
    // Re-stamp memory/IDB with the just-closed detail so soft reopen after a
    // meta write (milestone/assignees) does not fall back to a stale list sketch.
    try {
      if (
        listResync.detail &&
        listResync.owner &&
        listResync.repo &&
        Number(listResync.number) > 0
      ) {
        const key = detailKey(
          listResync.owner,
          listResync.repo,
          listResync.number
        );
        detailCache.set(key, listResync.detail);
        // Also force list-cache people-meta so the next list-sketch paint has
        // the just-set milestone (pulls list API often omits it).
        try {
          applyOpenDetailToListRow({
            number: listResync.number,
            detail: listResync.detail,
            forceLabels: Array.isArray(listResync.detail?.labels),
          });
        } catch {
          /* ignore list restamp */
        }
      }
    } catch {
      /* ignore */
    }
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
