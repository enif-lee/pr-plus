// TypeScript SoT — assembled by build scripts (classic runtime JS emit)

  async function tryRestoreOpenModal() {
    if (!hostEnabled) return { ok: false, reason: 'disabled' };
    if (!isPullsListPage()) return { ok: false, reason: 'not-pulls' };
    if (current.open) return { ok: true, reason: 'already-open' };

    // Extension reload leaves orphan content scripts; restore needs a tab refresh
    const bridge = globalThis.PRTreeBridge;
    if (
      typeof bridge?.isExtensionContextAlive === 'function' &&
      !bridge.isExtensionContextAlive()
    ) {
      return {
        ok: false,
        reason: 'context-invalidated',
        message:
          bridge.RELOAD_REFRESH_MSG ||
          'Extension was reloaded. Refresh this GitHub tab to reconnect pr+.',
      };
    }

    const path = location.pathname || '';
    const m = path.match(/^\/([^/]+)\/([^/]+)\/pulls/);
    if (!m) return { ok: false, reason: 'path' };
    const pathOwner = m[1];
    const pathRepo = m[2];

    const sess = sessionApi();
    const uri = uriApi();
    let sessionOpen = null;
    if (typeof sessionStorage !== 'undefined' && sess?.loadOpenModal) {
      sessionOpen = sess.loadOpenModal(sessionStorage);
    }
    let sessionView = null;
    if (
      sessionOpen &&
      typeof sessionStorage !== 'undefined' &&
      sess?.loadSessionView
    ) {
      sessionView = sess.loadSessionView(
        sessionStorage,
        sessionOpen.owner,
        sessionOpen.repo,
        sessionOpen.number
      );
    }
    const uriRoute =
      typeof uri?.parseLocationRoute === 'function'
        ? uri.parseLocationRoute(typeof location !== 'undefined' ? location : null)
        : { page: null, number: null, position: null };

    const resolved =
      typeof uri?.resolveRestore === 'function'
        ? uri.resolveRestore({
            sessionOpen,
            sessionView,
            uri: uriRoute,
            pathOwner,
            pathRepo,
          })
        : sessionOpen
          ? {
              open: sessionOpen,
              page: sessionOpen.page || null,
              position: sessionOpen.position || null,
              source: 'session',
            }
          : { open: null, page: null, position: null, source: 'none' };

    if (!resolved.open) {
      // Plain /pulls (no prp_number): drop stale session open snap so we never
      // re-open the last PR without an explicit URI deep-link.
      try {
        if (typeof sessionStorage !== 'undefined' && sess?.clearOpenModal) {
          sess.clearOpenModal(sessionStorage);
        }
      } catch {
        /* ignore */
      }
      return { ok: false, reason: 'none' };
    }

    // URI / path owner must match resolved open (repo isolation)
    if (
      pathOwner.toLowerCase() !== String(resolved.open.owner).toLowerCase() ||
      pathRepo.toLowerCase() !== String(resolved.open.repo).toLowerCase()
    ) {
      return { ok: false, reason: 'repo-mismatch' };
    }

    try {
      await openModal({
        owner: resolved.open.owner,
        repo: resolved.open.repo,
        number: resolved.open.number,
        page: resolved.page,
        position: resolved.position,
      });
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (
        /Extension context invalidated|Extension was reloaded/i.test(msg)
      ) {
        return {
          ok: false,
          reason: 'context-invalidated',
          message: msg,
        };
      }
      throw err;
    }
    return {
      ok: true,
      owner: resolved.open.owner,
      repo: resolved.open.repo,
      number: resolved.open.number,
      page: resolved.page,
      position: resolved.position,
      source: resolved.source,
    };
  }

  /**
   * On PR conversation/files/changes routes, mount pr+ as in-page embed under GH header.
   * Soft-nav re-entry when path / commit / #diff- changes.
   */
  function tryEmbedFromLocation() {
    if (!hostEnabled) return { ok: false, reason: 'disabled' };
    const locKey = embedLocationKey();
    const path = typeof location !== 'undefined' ? location.pathname : '';
    const target = parseGithubLocation() || parsePrPagePath(path);
    if (!target) {
      if (isEmbedPresentation(current.presentation) && current.open) {
        closeModal();
      }
      lastEmbedPath = locKey;
      removeGithubPrToggle();
      return { ok: false, reason: 'not-pr-page' };
    }
    const samePr =
      current.open &&
      isEmbedPresentation(current.presentation) &&
      String(current.owner).toLowerCase() === String(target.owner).toLowerCase() &&
      String(current.repo).toLowerCase() === String(target.repo).toLowerCase() &&
      Number(current.number) === Number(target.number);
    const sameSurface =
      samePr &&
      current.routePage === target.page &&
      String(current.routeCommitSha || '') === String(target.commitSha || '') &&
      String(current.routeCommitEndSha || '') === String(target.commitEndSha || '') &&
      String(current.routeFileKey || '') === String(target.fileKey || '') &&
      Number(current.routeStartLine || 0) === Number(target.startLine || 0) &&
      Number(current.routeEndLine || 0) === Number(target.endLine || 0);
    lastEmbedPath = locKey;
    if (sameSurface) {
      // Re-hide native if Turbo re-injected content, and remount if host was destroyed
      ensureEmbedHost();
      render();
      removeGithubPrToggle();
      return { ok: true, reason: 'already-open' };
    }
    if (samePr) {
      // Same PR, path/hash changed — remount so App re-applies commit/selection
      applyRouteFieldsFromTarget(target);
      dropReactRoot();
      ensureEmbedHost();
      render();
      removeGithubPrToggle();
      return { ok: true, reason: 'route-updated', page: target.page };
    }
    // Auto-open only when pref allows (manual: header pr+ / ⌘⇧E)
    if (prefs.autoOpenEmbed === false) {
      try {
        ensureGithubPrToggle();
      } catch {
        /* ignore */
      }
      return { ok: false, reason: 'auto-open-disabled' };
    }
    void openModal({
      owner: target.owner,
      repo: target.repo,
      number: target.number,
      page: target.page,
      presentation: 'embed',
      commitSha: target.commitSha || null,
      commitEndSha: target.commitEndSha || null,
      filePath: target.filePath || null,
      fileKey: target.fileKey || null,
      startLine: target.startLine ?? null,
      endLine: target.endLine ?? null,
      side: target.side || null,
    });
    removeGithubPrToggle();
    return {
      ok: true,
      owner: target.owner,
      repo: target.repo,
      number: target.number,
      page: target.page,
    };
  }

  function installEmbedWatch() {
    if (embedWatchInstalled) return;
    embedWatchInstalled = true;
    const onNav = () => {
      if (!hostEnabled) return;
      const locKey = embedLocationKey();
      if (
        locKey === lastEmbedPath &&
        current.open &&
        isEmbedPresentation(current.presentation)
      ) {
        // Same path+hash: Turbo may have replaced #prp-page-embed — rebind React root
        try {
          ensureEmbedHost();
          render();
        } catch {
          /* ignore */
        }
        return;
      }
      tryEmbedFromLocation();
      try {
        ensureGithubPrToggle();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('popstate', onNav);
    window.addEventListener('turbo:load', onNav);
    window.addEventListener('turbo:render', onNav);
    window.addEventListener('pjax:end', onNav);
    // GitHub soft navigations sometimes only mutate DOM
    document.addEventListener('soft-nav:end', onNav);
    // Fallback poll for missed events (pathname + hash)
    const pollId = window.setInterval(() => {
      if (!hostEnabled) return;
      if (embedLocationKey() !== lastEmbedPath) onNav();
    }, 800);
    // Allow Node test processes to exit (browser ignores unref)
    try {
      if (pollId != null && typeof pollId === 'object' && typeof (pollId as any).unref === 'function') {
        (pollId as any).unref();
      } else if (
        typeof pollId === 'number' &&
        typeof window.clearInterval === 'function'
      ) {
        /* browser timer id */
      }
    } catch {
      /* ignore */
    }
  }

  function setEnabled(enabled) {
    hostEnabled = Boolean(enabled);
    if (!hostEnabled) {
      // Tear down modal + stop intercepting so GitHub is fully native
      removeGithubPrToggle();
      try {
        closePullsPalette();
      } catch {
        /* ignore */
      }
      try {
        clearPullsListFocus();
      } catch {
        /* ignore */
      }
      if (current.open) {
        clearUriRoute();
        const wasEmbed = isEmbedPresentation(current.presentation);
        current = {
          open: false,
          loading: false,
          error: null,
          detail: null,
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
          presentation: 'modal',
        };
        render();
        if (wasEmbed) restoreNativeMain();
      } else {
        restoreNativeMain();
      }
      return;
    }
    // Light preload only — full warmUp runs after list paint (content.js)
    void ensureAssets();
    installEmbedWatch();
    ensurePrefsWatch();
    // Wait for prefs so autoOpenEmbed=false is respected before first open.
    void warmPrefs()
      .catch(() => prefs)
      .then(() => {
        tryEmbedFromLocation();
        try {
          ensureGithubPrToggle();
        } catch {
          /* ignore */
        }
      });
  }

  function parsePrFromAnchor(anchor) {
    if (!anchor || !anchor.getAttribute) return null;
    const href = anchor.getAttribute('href') || '';
    const m = href.match(/\/?([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$|\?|#)/);
    if (!m) return null;
    return { owner: m[1], repo: m[2], number: Number(m[3]) };
  }

  function isPullsListPage() {
    return /\/[^/]+\/[^/]+\/pulls/.test(location.pathname || '');
  }

  /**
   * Keyboard focus on the native PR list (⌥J / ⌥K + Enter).
   * Tracks by PR number so tree reorder does not lose the selection.
   */
  let listFocusNumber = null;
  let listFocusKeyBound = false;

  function listFocusApi() {
    return globalThis.PRListFocus || null;
  }

  function listDomApi() {
    return globalThis.PRTreeDOM || null;
  }

  function getPullsListRows() {
    const dom = listDomApi();
    if (typeof dom?.findOriginalPrRows === 'function') {
      try {
        return dom.findOriginalPrRows(document) || [];
      } catch {
        /* ignore */
      }
    }
    return [];
  }

  function getRowPrNumber(row) {
    const dom = listDomApi();
    if (typeof dom?.getPrNumberFromRow === 'function') {
      try {
        return dom.getPrNumberFromRow(row);
      } catch {
        /* ignore */
      }
    }
    return Number.NaN;
  }

  function clearPullsListFocus() {
    const api = listFocusApi();
    const rows = getPullsListRows();
    if (api?.applyFocusToRows) {
      api.applyFocusToRows(rows, -1);
    } else {
      for (const row of rows) {
        row?.classList?.remove?.('prp-list-focus');
        try {
          row?.removeAttribute?.('data-prp-list-focus');
        } catch {
          /* ignore */
        }
      }
    }
    listFocusNumber = null;
  }

  function resolvePullsListFocusIndex() {
    const api = listFocusApi();
    const rows = getPullsListRows();
    if (api?.findFocusIndex) {
      return api.findFocusIndex(rows, {
        focusNumber: listFocusNumber,
        getNumber: getRowPrNumber,
      });
    }
    if (listFocusNumber != null) {
      const byNum = rows.findIndex((r) => getRowPrNumber(r) === listFocusNumber);
      if (byNum >= 0) return byNum;
    }
    return rows.findIndex((r) => r?.classList?.contains?.('prp-list-focus'));
  }

  function applyPullsListFocus(index) {
    const api = listFocusApi();
    const rows = getPullsListRows();
    const row = api?.applyFocusToRows
      ? api.applyFocusToRows(rows, index)
      : (() => {
          for (const r of rows) {
            r?.classList?.remove?.('prp-list-focus');
            try {
              r?.removeAttribute?.('data-prp-list-focus');
            } catch {
              /* ignore */
            }
          }
          if (index < 0 || index >= rows.length) return null;
          const r = rows[index];
          r.classList.add('prp-list-focus');
          try {
            r.setAttribute('data-prp-list-focus', '1');
          } catch {
            /* ignore */
          }
          return r;
        })();
    if (!row) {
      listFocusNumber = null;
      return null;
    }
    const num = getRowPrNumber(row);
    listFocusNumber = Number.isFinite(num) ? num : null;
    try {
      row.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    } catch {
      /* ignore */
    }
    return row;
  }

  function parsePrFromListRow(row) {
    if (!row) return null;
    const links = row.querySelectorAll?.(
      'a[href*="/pull/"], a.js-navigation-open, a[id$="_link"], h3 a'
    );
    if (links) {
      for (const a of links) {
        const parsed = parsePrFromAnchor(a);
        if (parsed) return parsed;
      }
    }
    const num = getRowPrNumber(row);
    if (!Number.isFinite(num)) return null;
    const pathApi = listDomApi();
    const repo =
      typeof pathApi?.parseRepoFromPathname === 'function'
        ? pathApi.parseRepoFromPathname(location.pathname || '')
        : null;
    if (!repo) {
      const m = String(location.pathname || '').match(
        /^\/([^/]+)\/([^/]+)\/pulls(?:\/|$)/
      );
      if (!m) return null;
      return { owner: m[1], repo: m[2], number: num };
    }
    return { owner: repo.owner, repo: repo.repo, number: num };
  }

  function openFocusedPullsListRow() {
    const index = resolvePullsListFocusIndex();
    if (index < 0) return false;
    return openPullsListRowAt(index);
  }

