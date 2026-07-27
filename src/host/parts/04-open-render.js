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

    if (!resolved.open) return { ok: false, reason: 'none' };

    // Session restore must match current pulls list repo
    if (resolved.source === 'session') {
      if (
        pathOwner.toLowerCase() !== String(resolved.open.owner).toLowerCase() ||
        pathRepo.toLowerCase() !== String(resolved.open.repo).toLowerCase()
      ) {
        return { ok: false, reason: 'repo-mismatch' };
      }
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
      if (typeof pollId === 'object' && typeof pollId.unref === 'function') {
        pollId.unref();
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

  function openPullsListRowAt(index) {
    const rows = getPullsListRows();
    if (index < 0 || index >= rows.length) return false;
    const row = rows[index];
    const parsed = parsePrFromListRow(row);
    if (!parsed) return false;
    applyPullsListFocus(index);
    void openModal({ ...parsed, page: 'conversation' });
    return true;
  }

  function openNewPullRequestFromList() {
    const api = pullsPaletteApi();
    const repo = getRepoForPalette();
    const href =
      typeof api?.buildCreatePullRequestUrl === 'function'
        ? api.buildCreatePullRequestUrl(
            repo.owner,
            repo.repo,
            getWebOrigin()
          )
        : `${getWebOrigin()}/${repo.owner}/${repo.repo}/compare`;
    return navigatePage(href);
  }

  /** Find GitHub "New pull request" control on the pulls page. */
  function findNewPullRequestControl() {
    try {
      // Prefer labeled CTA (header) over any /compare link
      const candidates = document.querySelectorAll(
        'a[href*="/compare"], a.btn-primary, button.btn-primary, a.Button--primary'
      );
      let fallback = null;
      for (const el of candidates) {
        const t = String(el.textContent || '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase()
          // strip our badge text if re-shown
          .replace(/⌥n/g, '')
          .trim();
        if (
          t === 'new pull request' ||
          t === 'new pr' ||
          t.startsWith('new pull request')
        ) {
          return el;
        }
        if (
          !fallback &&
          el.matches?.('a[href*="/compare"]') &&
          /compare/.test(el.getAttribute('href') || '')
        ) {
          fallback = el;
        }
      }
      return fallback;
    } catch {
      /* ignore */
    }
    return null;
  }

  function findRowTitleAnchor(row) {
    if (!row?.querySelector) return null;
    return (
      row.querySelector('a.js-navigation-open') ||
      row.querySelector('a[id$="_link"]') ||
      row.querySelector('h3 a[href*="/pull/"]') ||
      row.querySelector('a[href*="/pull/"]')
    );
  }

  function cleanControlLabel(el) {
    return String(el?.textContent || '')
      .replace(/\s+/g, ' ')
      .replace(/⌥⇧?[A-Z0-9]/gi, '')
      .replace(/alt\+shift\+[a-z]/gi, '')
      .trim();
  }

  /** summary.btn-link filter chips in the pulls table header. */
  function findFilterBarControls() {
    const api = listFocusApi();
    const defs = api?.PR_LIST_FILTER_BAR || [];
    const matchFn =
      typeof api?.matchFilterBarLabel === 'function'
        ? api.matchFilterBarLabel
        : null;
    const found = [];
    const seen = new Set();
    // Prefer list header scopes so we don't hit sidebars
    const scopes = [
      document.querySelector('.table-list-header'),
      document.querySelector('.Box .Box-header'),
      document.querySelector('[class*="TableList"]'),
      document.querySelector('.js-check-all-container'),
      document,
    ].filter(Boolean);
    const visited = new Set();
    for (const scope of scopes) {
      const summaries = scope.querySelectorAll?.(
        'summary.btn-link, summary.select-menu-button, summary[role="button"], summary.Button, summary.Button--secondary, summary'
      );
      if (!summaries) continue;
      for (const el of summaries) {
        if (visited.has(el)) continue;
        visited.add(el);
        const text = cleanControlLabel(el);
        const def = matchFn
          ? matchFn(text)
          : defs.find((d) => d.match?.test?.(text));
        if (!def || seen.has(def.id)) continue;
        seen.add(def.id);
        found.push({ el, def });
      }
      if (found.length >= defs.length) break;
    }
    return found;
  }

  /** Dispatch a full click sequence so GH SelectMenu / details open reliably. */
  function clickControl(el) {
    if (!el) return false;
    try {
      el.focus?.({ preventScroll: true });
    } catch {
      try {
        el.focus?.();
      } catch {
        /* ignore */
      }
    }
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
    };
    try {
      if (typeof PointerEvent === 'function') {
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
      }
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      if (typeof PointerEvent === 'function') {
        el.dispatchEvent(new PointerEvent('pointerup', opts));
      }
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      return true;
    } catch {
      try {
        el.click?.();
        return true;
      } catch {
        return false;
      }
    }
  }

  function activateFilterBar(filterId) {
    // Filters ▾ open/close (toggle)
    if (filterId === 'filters-menu') {
      return toggleFiltersMenu();
    }
    const controls = findFilterBarControls();
    const hit = controls.find((c) => c.def?.id === filterId);
    if (!hit?.el) return false;
    // Do not set details.open manually — can double-toggle with click.
    // Real click opens SelectMenu + focuses the control.
    return clickControl(hit.el);
  }

  function findFiltersMenuSummary() {
    try {
      const summaries = document.querySelectorAll('summary');
      for (const el of summaries) {
        const t = cleanControlLabel(el);
        if (/^filters?$/i.test(t)) return el;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /** Open or close the GH “Filters ▾” dropdown next to search. */
  function toggleFiltersMenu() {
    const summary = findFiltersMenuSummary();
    if (!summary) return false;
    return clickControl(summary);
  }

  let listHotkeyHintsVisible = false;

  /**
   * While Option is held: show list hotkeys + filter-bar ⌥⇧ shortcuts + ⌥⇧N.
   * Filter badges are CSS-positioned on each control (scroll-follow for free).
   */
  function setPullsListHotkeyHints(visible) {
    const api = listFocusApi();
    const slots =
      (api && api.PR_LIST_HOTKEY_SLOTS) ||
      (typeof api?.buildPrListHotkeySlots === 'function'
        ? api.buildPrListHotkeySlots()
        : '123456789abcdefgh ilmnopqrstuvwxyz'.replace(/\s/g, ''));
    const attr =
      (api && api.PR_LIST_HOTKEY_ATTR) || 'data-prp-list-hotkey';
    const newAttr =
      (api && api.PR_LIST_NEW_PR_HOTKEY_ATTR) || 'data-prp-new-pr-hotkey';
    const filterAttr =
      (api && api.PR_LIST_FILTER_BAR_ATTR) || 'data-prp-filter-bar-hotkey';
    const labelFn =
      typeof api?.prListHotkeyLabel === 'function'
        ? api.prListHotkeyLabel
        : (i) => slots[i] || null;

    if (!visible) {
      try {
        document.documentElement.classList.remove('prp-opt-hints');
        document
          .querySelectorAll(`[${attr}], [${newAttr}], [${filterAttr}]`)
          .forEach((el) => el.remove());
        document
          .querySelectorAll('.prp-filter-bar-float-host, .prp-filter-bar-host')
          .forEach((el) => {
            el.classList.remove('prp-filter-bar-float-host', 'prp-filter-bar-host');
          });
      } catch {
        /* ignore */
      }
      return;
    }
    if (!isPullsListPage() || current.open || isPullsPaletteOpen()) return;

    // Lets CSS lift overflow:hidden on GH filter chrome so absolute badges paint above
    try {
      document.documentElement.classList.add('prp-opt-hints');
    } catch {
      /* ignore */
    }

    const rows = getPullsListRows();
    const max = Math.min(rows.length, slots.length);
    for (let i = 0; i < max; i++) {
      const row = rows[i];
      const label = labelFn(i);
      if (!label || !row) continue;
      let badge = row.querySelector?.(`[${attr}]`);
      if (!badge) {
        badge = document.createElement('kbd');
        badge.className = 'prp-list-hotkey';
        badge.setAttribute(attr, label);
        const title = findRowTitleAnchor(row);
        if (title?.parentElement) {
          title.insertAdjacentElement('afterend', badge);
        } else {
          row.appendChild(badge);
        }
      }
      badge.textContent = `⌥${label}`;
      badge.setAttribute(attr, label);
    }

    /*
     * Filter toolbar: badge is a child of the control with CSS absolute.
     * Moves with scroll automatically — no fixed overlay / rAF follow.
     */
    for (const { el, def } of findFilterBarControls()) {
      if (!el || !def) continue;
      try {
        el.classList.add('prp-filter-bar-float-host', 'prp-filter-bar-host');
        // Also mark immediate parents so CSS can set overflow:visible up the chain
        let p = el.parentElement;
        for (let d = 0; p && d < 4; d++) {
          p.classList.add('prp-filter-bar-float-host');
          p = p.parentElement;
        }
      } catch {
        /* ignore */
      }
      let fb = el.querySelector?.(`[${filterAttr}]`);
      if (!fb) {
        fb = document.createElement('kbd');
        fb.className = 'prp-list-hotkey prp-list-hotkey--filter';
        fb.setAttribute(filterAttr, def.key);
        el.appendChild(fb);
      }
      fb.textContent = def.labelMac || `⌥⇧${String(def.key).toUpperCase()}`;
      fb.setAttribute(filterAttr, def.key);
    }

    // New pull request → ⌥⇧N (inside the button/link)
    const newBtn = findNewPullRequestControl();
    if (newBtn) {
      let nb = newBtn.querySelector?.(`[${newAttr}]`);
      if (!nb) {
        nb = document.createElement('kbd');
        nb.className = 'prp-list-hotkey prp-list-hotkey--new';
        nb.setAttribute(newAttr, 'n');
        newBtn.appendChild(nb);
      }
      nb.textContent = '⌥⇧N';
    }
  }

  function showPullsListHotkeyHints() {
    if (listHotkeyHintsVisible) {
      setPullsListHotkeyHints(true);
      return;
    }
    listHotkeyHintsVisible = true;
    setPullsListHotkeyHints(true);
  }

  function hidePullsListHotkeyHints() {
    if (!listHotkeyHintsVisible) {
      setPullsListHotkeyHints(false);
      return;
    }
    listHotkeyHintsVisible = false;
    setPullsListHotkeyHints(false);
  }

  function stepPullsListFocus(delta) {
    const api = listFocusApi();
    const rows = getPullsListRows();
    if (rows.length === 0) return false;
    const cur = resolvePullsListFocusIndex();
    const next =
      typeof api?.nextFocusIndex === 'function'
        ? api.nextFocusIndex(cur, delta, rows.length)
        : (() => {
            if (cur < 0) return delta > 0 ? 0 : rows.length - 1;
            return (cur + (delta > 0 ? 1 : -1) + rows.length) % rows.length;
          })();
    return Boolean(applyPullsListFocus(next));
  }

  function githubPaletteOpenNow() {
    const api = listFocusApi();
    if (typeof api?.touchGithubCommandPaletteOpen === 'function') {
      try {
        return Boolean(api.touchGithubCommandPaletteOpen(document));
      } catch {
        /* ignore */
      }
    }
    if (typeof api?.isGithubCommandPaletteOpen === 'function') {
      try {
        return Boolean(api.isGithubCommandPaletteOpen(document));
      } catch {
        /* ignore */
      }
    }
    try {
      const d = document.getElementById('command-palette-pjax-container');
      return Boolean(d?.open);
    } catch {
      return false;
    }
  }

  /** Escape race: GH often closes its palette before our listener runs. */
  function githubPaletteOwnsEscape(event) {
    const api = listFocusApi();
    if (typeof api?.shouldIgnoreModalEscapeForGithubPalette === 'function') {
      try {
        return Boolean(
          api.shouldIgnoreModalEscapeForGithubPalette(document, {
            target: event?.target,
          })
        );
      } catch {
        /* ignore */
      }
    }
    return githubPaletteOpenNow();
  }

  /**
   * GH ⌘K palette can leave its <dialog> stuck in the CSS top layer (:modal)
   * after close, which blocks all PR list clicks. Heal on user interaction.
   */
  function recoverGithubPaletteIfStuck() {
    const api = listFocusApi();
    if (typeof api?.recoverGithubCommandPaletteTopLayer === 'function') {
      try {
        return Boolean(api.recoverGithubCommandPaletteTopLayer(document));
      } catch {
        return false;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Pulls-page command palette (⌥⇧K) — search/filter/open/create        */
  /* ------------------------------------------------------------------ */
  const PULLS_PALETTE_ROOT_ID = 'prp-pulls-palette';
  let pullsPaletteOpen = false;
  let pullsPaletteQuery = '';
  let pullsPaletteFocusIndex = 0;
  /** @type {Array|null} */
  let pullsPaletteItems = null;
  /** Snapshot of list-row focus number so Esc can restore it */
  let pullsPaletteSavedListFocus = null;
  let pullsPaletteRoot = null;
  /** @type {null|(() => void)} */
  let pullsPaletteScrollbarDestroy = null;

  function pullsPaletteApi() {
    return globalThis.PRPullsPalette || null;
  }

  function isPullsPaletteOpen() {
    return Boolean(pullsPaletteOpen);
  }

  function getViewerLoginForPalette() {
    const api = pullsPaletteApi();
    if (typeof api?.readViewerLoginFromDocument === 'function') {
      try {
        const v = api.readViewerLoginFromDocument(document);
        if (v) return v;
      } catch {
        /* ignore */
      }
    }
    try {
      return (
        document
          .querySelector('meta[name="user-login"]')
          ?.getAttribute('content') || ''
      );
    } catch {
      return '';
    }
  }

  function getRepoForPalette() {
    const dom = listDomApi();
    if (typeof dom?.parseRepoFromPathname === 'function') {
      try {
        const r = dom.parseRepoFromPathname(location.pathname || '');
        if (r?.owner && r?.repo) return r;
      } catch {
        /* ignore */
      }
    }
    const m = String(location.pathname || '').match(
      /^\/([^/]+)\/([^/]+)\/pulls(?:\/|$)/
    );
    if (!m) return { owner: '', repo: '' };
    return { owner: m[1], repo: m[2] };
  }

  function getWebOrigin() {
    try {
      return location.origin || 'https://github.com';
    } catch {
      return 'https://github.com';
    }
  }

  function rebuildPullsPaletteItems() {
    const api = pullsPaletteApi();
    const prs = resolveOpenPulls();
    const repo = getRepoForPalette();
    const viewer = getViewerLoginForPalette();
    if (typeof api?.buildPullsPaletteItems === 'function') {
      pullsPaletteItems = api.buildPullsPaletteItems(prs, {
        query: pullsPaletteQuery,
        viewerLogin: viewer,
        owner: repo.owner,
        repo: repo.repo,
        webOrigin: getWebOrigin(),
      });
    } else {
      pullsPaletteItems = [];
    }
    const n = pullsPaletteItems.length;
    if (n === 0) {
      pullsPaletteFocusIndex = -1;
    } else if (
      pullsPaletteFocusIndex < 0 ||
      pullsPaletteFocusIndex >= n
    ) {
      pullsPaletteFocusIndex = 0;
    }
    return pullsPaletteItems;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Author avatar or initials fallback for palette PR rows. */
  function renderPullsPaletteAvatar(item) {
    const login = String(item?.author || '').trim();
    const url = String(item?.authorAvatarUrl || '').trim();
    const initials = login
      ? login
          .slice(0, 2)
          .toUpperCase()
      : '?';
    if (url) {
      return `<img class="prp-pp-avatar" src="${escapeHtml(
        url
      )}" alt="" width="28" height="28" loading="lazy" decoding="async" />`;
    }
    return `<span class="prp-pp-avatar prp-pp-avatar--fallback" aria-hidden="true">${escapeHtml(
      initials
    )}</span>`;
  }

  /** Rich meta row: #num · avatar @author · branch chips */
  function renderPullsPalettePrBody(item) {
    const num = item?.number != null ? Number(item.number) : NaN;
    const numHtml = Number.isFinite(num)
      ? `<span class="prp-pp-pr-num">#${num}</span>`
      : '';
    const author = String(item?.author || '').trim();
    const authorHtml = author
      ? `<span class="prp-pp-author">${renderPullsPaletteAvatar(
          item
        )}<span class="prp-pp-author__login">@${escapeHtml(author)}</span></span>`
      : '';
    const head = String(item?.headRef || '').trim();
    const base = String(item?.baseRef || '').trim();
    let branchHtml = '';
    if (head || base) {
      const headChip = head
        ? `<span class="prp-pp-branch" title="${escapeHtml(head)}">${escapeHtml(
            head
          )}</span>`
        : '';
      const baseChip = base
        ? `<span class="prp-pp-branch prp-pp-branch--base" title="${escapeHtml(
            base
          )}">${escapeHtml(base)}</span>`
        : '';
      const arrow =
        head && base ? `<span class="prp-pp-branch-arrow" aria-hidden="true">→</span>` : '';
      branchHtml = `<span class="prp-pp-branches">${headChip}${arrow}${baseChip}</span>`;
    }
    const draftHtml = item?.draft
      ? `<span class="prp-pp-draft">Draft</span>`
      : '';
    return `
      <span class="prp-pp-item__main">
        <span class="prp-pp-item__title">${escapeHtml(item.title || '')}</span>
        <span class="prp-pp-item__meta">
          ${numHtml}
          ${authorHtml}
          ${draftHtml}
          ${branchHtml}
        </span>
      </span>`;
  }

  /**
   * Action row body: title + aliases/description under it.
   * Must wrap in __main so the digit kbd stays a single right-column badge
   * (bare title/sub children auto-place into col2 / row2).
   */
  function renderPullsPaletteActionBody(item) {
    const aliases = Array.isArray(item?.aliases)
      ? item.aliases.map((a) => String(a || '').trim()).filter(Boolean)
      : [];
    const aliasHtml = aliases.length
      ? `<span class="prp-pp-aliases">${aliases
          .map(
            (a) =>
              `<kbd class="prp-pp-alias">${escapeHtml(a)}</kbd>`
          )
          .join('')}</span>`
      : '';
    const rawDesc = String(item?.description || item?.subtitle || '').trim();
    const aliasJoined = aliases.join(' · ');
    // Avoid repeating pure alias text under the chips
    const desc =
      rawDesc &&
      rawDesc !== aliasJoined &&
      !(aliases.length === 1 && rawDesc === aliases[0])
        ? rawDesc
        : '';
    // If description still starts with "cm · …", drop the alias prefix
    let descShow = desc;
    if (descShow && aliases.length) {
      for (const a of aliases) {
        const prefix = `${a} · `;
        if (descShow.startsWith(prefix)) {
          descShow = descShow.slice(prefix.length);
          break;
        }
      }
    }
    const descHtml = descShow
      ? `<span class="prp-pp-action-desc">${escapeHtml(descShow)}</span>`
      : '';
    const meta =
      aliasHtml || descHtml
        ? `<span class="prp-pp-item__meta prp-pp-item__meta--action">${aliasHtml}${descHtml}</span>`
        : '';
    return `
      <span class="prp-pp-item__main">
        <span class="prp-pp-item__title">${escapeHtml(item?.title || '')}</span>
        ${meta}
      </span>`;
  }

  function fillPullsPaletteHelp(root) {
    const host = root || pullsPaletteRoot;
    const list = host?.querySelector?.('[data-prp-pp-help-list]');
    if (!list) return;
    const api = pullsPaletteApi();
    const entries =
      typeof api?.buildPullsPaletteHelpEntries === 'function'
        ? api.buildPullsPaletteHelpEntries()
        : [];
    if (!entries.length) {
      list.innerHTML =
        '<div class="prp-pp-help__empty prp-muted">No actions configured</div>';
      return;
    }
    list.innerHTML = entries
      .map((e) => {
        const codes = (e.aliases || [])
          .map(
            (a) =>
              `<kbd class="prp-pp-help__alias">${escapeHtml(String(a))}</kbd>`
          )
          .join('');
        const fid = e.filterId
          ? ` data-prp-pp-help-filter="${escapeHtml(String(e.filterId))}"`
          : '';
        return `<button type="button" class="prp-pp-help__row" data-prp-pp-help-run="1"
          data-prp-pp-help-id="${escapeHtml(String(e.id || ''))}"
          data-prp-pp-help-action="${escapeHtml(String(e.action || ''))}"${fid}
          title="Run: ${escapeHtml(e.title)}">
          <span class="prp-pp-help__action">${escapeHtml(e.title)}</span>
          <span class="prp-pp-help__aliases">${codes}</span>
        </button>`;
      })
      .join('');
  }

  /** Run a configured palette action (from help sidebar or list). */
  function executePullsPaletteCommand(item) {
    if (!item || typeof item !== 'object') return false;
    const api = pullsPaletteApi();

    if (item.action === 'toggleFiltersMenu') {
      closePullsPalette();
      queueMicrotask(() => toggleFiltersMenu());
      return true;
    }

    // Toggle right-side help panel (keep palette open)
    if (item.action === 'toggleHelp') {
      togglePullsPaletteHelp();
      return true;
    }

    if (item.action === 'applyFilter' && item.filterId) {
      const repo = getRepoForPalette();
      const fid = String(item.filterId).toLowerCase();
      const href =
        typeof api?.buildPullsListFilterUrl === 'function'
          ? api.buildPullsListFilterUrl(
              repo.owner,
              repo.repo,
              fid,
              getWebOrigin()
            )
          : `${getWebOrigin()}/${repo.owner}/${repo.repo}/pulls`;
      const isExternal = /^https?:\/\//i.test(href);
      if (!isExternal && (!repo.owner || !repo.repo)) {
        console.warn('[pr+] pulls palette filter: missing owner/repo', repo);
        return false;
      }
      closePullsPalette();
      return navigatePage(href);
    }

    if (item.action === 'createPullRequest') {
      const repo = getRepoForPalette();
      const href =
        item.href ||
        (typeof api?.buildCreatePullRequestUrl === 'function'
          ? api.buildCreatePullRequestUrl(
              repo.owner,
              repo.repo,
              getWebOrigin()
            )
          : `${getWebOrigin()}/${repo.owner}/${repo.repo}/compare`);
      closePullsPalette();
      return navigatePage(href);
    }

    if (item.kind === 'pr' || item.action === 'openPullRequest') {
      const repo = getRepoForPalette();
      const owner = item.owner || repo.owner;
      const r = item.repo || repo.repo;
      const number = Number(item.number);
      if (!owner || !r || !Number.isFinite(number)) return false;
      closePullsPalette();
      void openModal({
        owner,
        repo: r,
        number,
        page: 'conversation',
      });
      return true;
    }
    return false;
  }

  function runPullsPaletteHelpAction(el) {
    if (!el) return false;
    const action = el.getAttribute('data-prp-pp-help-action') || '';
    const filterId = el.getAttribute('data-prp-pp-help-filter') || '';
    const id = el.getAttribute('data-prp-pp-help-id') || '';
    return executePullsPaletteCommand({
      id,
      kind: 'action',
      action,
      filterId: filterId || undefined,
    });
  }

  function togglePullsPaletteHelp(force) {
    if (!pullsPaletteRoot) return;
    const panel = pullsPaletteRoot.querySelector('[data-prp-pp-help]');
    const toggle = pullsPaletteRoot.querySelector('[data-prp-pp-help-toggle]');
    if (!panel) return;
    const open =
      typeof force === 'boolean' ? force : panel.hasAttribute('hidden');
    if (open) {
      panel.removeAttribute('hidden');
      fillPullsPaletteHelp(pullsPaletteRoot);
      toggle?.setAttribute('aria-expanded', 'true');
      pullsPaletteRoot
        .querySelector('.prp-pp-panel')
        ?.classList.add('prp-pp-panel--help');
    } else {
      panel.setAttribute('hidden', '');
      toggle?.setAttribute('aria-expanded', 'false');
      pullsPaletteRoot
        .querySelector('.prp-pp-panel')
        ?.classList.remove('prp-pp-panel--help');
    }
  }

  /**
   * Move focus highlight without rebuilding list DOM (avoids re-animation / re-render).
   */
  function updatePullsPaletteFocus() {
    if (!pullsPaletteRoot) return;
    const listEl = pullsPaletteRoot.querySelector('[data-prp-pp-list]');
    if (!listEl) return;
    const rows = listEl.querySelectorAll('.prp-pp-item[data-prp-pp-index]');
    if (!rows.length) return;
    let focusedEl = null;
    for (const row of rows) {
      const i = Number(row.getAttribute('data-prp-pp-index'));
      const on = i === pullsPaletteFocusIndex;
      row.classList.toggle('is-focused', on);
      row.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) focusedEl = row;
    }
    try {
      // Instant — never smooth-scroll on focus step
      focusedEl?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
    } catch {
      /* ignore */
    }
  }

  /** Full list rebuild (query / open). Prefer updatePullsPaletteFocus for ↑↓. */
  function paintPullsPalette() {
    if (!pullsPaletteRoot) return;
    const items = rebuildPullsPaletteItems() || [];
    const listEl = pullsPaletteRoot.querySelector('[data-prp-pp-list]');
    const input = pullsPaletteRoot.querySelector('[data-prp-pp-input]');
    const meta = pullsPaletteRoot.querySelector('[data-prp-pp-meta]');
    if (input && input.value !== pullsPaletteQuery) {
      input.value = pullsPaletteQuery;
    }
    if (meta) {
      const viewer = getViewerLoginForPalette();
      meta.textContent = viewer
        ? `Type to filter · open help for actions  ·  @${viewer}`
        : 'Type to filter · open help for actions';
    }
    if (!listEl) return;
    if (items.length === 0) {
      listEl.removeAttribute('data-prp-pp-animate');
      listEl.innerHTML =
        '<li class="prp-pp-empty prp-muted">No matching results</li>';
      return;
    }
    // One-shot enter animation on full rebuild only (not focus moves)
    listEl.setAttribute('data-prp-pp-animate', '1');
    listEl.innerHTML = items
      .map((item, i) => {
        const focused = i === pullsPaletteFocusIndex ? ' is-focused' : '';
        const digit =
          item.digit != null
            ? `<kbd class="prp-pp-digit">⌥${item.digit}</kbd>`
            : '';
        const isPr = item.kind === 'pr';
        const body = isPr
          ? renderPullsPalettePrBody(item)
          : renderPullsPaletteActionBody(item);
        return `<li class="prp-pp-item${focused}${
          item.kind === 'action' ? ' prp-pp-item--action' : ' prp-pp-item--pr'
        }" data-prp-pp-index="${i}" role="option" aria-selected="${
          i === pullsPaletteFocusIndex ? 'true' : 'false'
        }">
          <button type="button" class="prp-pp-item__btn prp-pp-item__btn--row" data-prp-pp-index="${i}">
            ${body}
            ${digit}
          </button>
        </li>`;
      })
      .join('');
    updatePullsPaletteFocus();
    // Drop animate flag after paint so later DOM ops don't re-trigger
    requestAnimationFrame(() => {
      try {
        listEl.removeAttribute('data-prp-pp-animate');
      } catch {
        /* ignore */
      }
    });
  }

  function closePullsPalette() {
    if (!pullsPaletteOpen && !pullsPaletteRoot) return;
    pullsPaletteOpen = false;
    pullsPaletteQuery = '';
    pullsPaletteItems = null;
    pullsPaletteFocusIndex = 0;
    try {
      pullsPaletteScrollbarDestroy?.();
    } catch {
      /* ignore */
    }
    pullsPaletteScrollbarDestroy = null;
    try {
      pullsPaletteRoot?.remove?.();
    } catch {
      /* ignore */
    }
    pullsPaletteRoot = null;
    // Restore prior list-row keyboard focus when we had one
    if (
      pullsPaletteSavedListFocus != null &&
      Number.isFinite(Number(pullsPaletteSavedListFocus))
    ) {
      const want = Number(pullsPaletteSavedListFocus);
      const rows = getPullsListRows();
      const idx = rows.findIndex((r) => getRowPrNumber(r) === want);
      if (idx >= 0) applyPullsListFocus(idx);
    }
    pullsPaletteSavedListFocus = null;
  }

  function openPullsPalette() {
    if (!hostEnabled || !isPullsListPage() || current.open) return false;
    if (githubPaletteOpenNow()) return false;
    recoverGithubPaletteIfStuck();

    pullsPaletteSavedListFocus = listFocusNumber;
    pullsPaletteOpen = true;
    pullsPaletteQuery = '';
    pullsPaletteFocusIndex = 0;

    let root = document.getElementById(PULLS_PALETTE_ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = PULLS_PALETTE_ROOT_ID;
      root.className = 'prp-pp-layer prp-pp-layer--enter';
      root.setAttribute('role', 'presentation');
      root.innerHTML = `
        <div class="prp-pp-backdrop" data-prp-pp-close="1"></div>
        <div class="prp-pp-panel" role="dialog" aria-label="pr+ pulls command palette" aria-modal="true">
          <div class="prp-pp-main">
            <div class="prp-pp-head">
              <input class="prp-pp-input" data-prp-pp-input type="search" autocomplete="off" spellcheck="false"
                placeholder="Search PRs or filters…  np  am  df  rd  rs  oi" />
              <div class="prp-pp-meta prp-muted" data-prp-pp-meta></div>
            </div>
            <div class="prp-scroll-float-host prp-edge-fade prp-pp-list-host" data-prp-pp-list-host>
              <ul class="prp-pp-list prp-scroll-float" data-prp-pp-list role="listbox"></ul>
            </div>
            <div class="prp-pp-foot">
              <span class="prp-pp-foot__keys prp-muted">⌥⇧K · ↑↓ · ⌥J ⌥K · Enter · Esc</span>
              <button type="button" class="prp-pp-help-btn" data-prp-pp-help-toggle
                aria-expanded="false" aria-controls="prp-pp-help-panel" title="Help">
                <svg class="prp-pp-help-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
                  <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm9 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.92 6.085c.081-.16.19-.299.34-.398.145-.097.346-.178.62-.178.26 0 .44.07.55.16.12.095.17.22.17.37 0 .17-.06.3-.19.42-.12.12-.33.26-.66.42-.4.19-.7.4-.92.64a1.7 1.7 0 0 0-.36.75 1 1 0 0 0 1.95.4c.02-.08.06-.15.12-.22.08-.09.2-.19.38-.28.4-.2.76-.45 1.02-.74.27-.3.4-.66.4-1.1 0-.47-.16-.88-.48-1.2-.32-.33-.8-.5-1.4-.5-.52 0-.96.13-1.32.39-.36.25-.6.61-.71 1.06a1 1 0 0 0 1.9.4Z"/>
                </svg>
                <span class="prp-pp-help-btn__label prp-muted">help</span>
              </button>
            </div>
          </div>
          <aside class="prp-pp-help" id="prp-pp-help-panel" data-prp-pp-help hidden>
            <div class="prp-pp-help__head">
              <div class="prp-pp-help__title">Actions</div>
              <button type="button" class="prp-pp-help-close" data-prp-pp-help-toggle aria-label="Close help">×</button>
            </div>
            <div class="prp-pp-help__list" data-prp-pp-help-list></div>
            <div class="prp-pp-help__hint prp-muted">Click a row to run · or type alias + Enter</div>
          </aside>
        </div>`;
      document.documentElement.appendChild(root);
      root.addEventListener('click', (e) => {
        const t = e.target;
        if (t?.closest?.('[data-prp-pp-close]')) {
          e.preventDefault();
          closePullsPalette();
          return;
        }
        const helpToggle = t?.closest?.('[data-prp-pp-help-toggle]');
        if (helpToggle) {
          e.preventDefault();
          e.stopPropagation();
          togglePullsPaletteHelp();
          return;
        }
        const helpRun = t?.closest?.('[data-prp-pp-help-run]');
        if (helpRun) {
          e.preventDefault();
          e.stopPropagation();
          runPullsPaletteHelpAction(helpRun);
          return;
        }
        const btn = t?.closest?.('[data-prp-pp-index]');
        if (btn) {
          const idx = Number(btn.getAttribute('data-prp-pp-index'));
          if (Number.isFinite(idx)) {
            pullsPaletteFocusIndex = idx;
            activatePullsPaletteItem(idx);
          }
        }
      });
      const input = root.querySelector('[data-prp-pp-input]');
      input?.addEventListener('input', (e) => {
        pullsPaletteQuery = String(e.target?.value || '');
        pullsPaletteFocusIndex = 0;
        paintPullsPalette();
      });
      fillPullsPaletteHelp(root);
    }
    pullsPaletteRoot = root;
    // Shared floating scrollbar (same system as modal lists)
    try {
      pullsPaletteScrollbarDestroy?.();
    } catch {
      /* ignore */
    }
    pullsPaletteScrollbarDestroy = null;
    try {
      const attach =
        globalThis.PRModalFloatingScrollbar?.attachFloatingScrollbar;
      const listEl = root.querySelector('[data-prp-pp-list]');
      const listHost = root.querySelector('[data-prp-pp-list-host]');
      if (typeof attach === 'function' && listEl) {
        pullsPaletteScrollbarDestroy = attach(listEl, { host: listHost });
      }
    } catch {
      /* ignore */
    }
    // Restart enter animation on reopen
    try {
      root.classList.remove('prp-pp-layer--enter');
      void root.offsetWidth;
      root.classList.add('prp-pp-layer--enter');
    } catch {
      /* ignore */
    }
    paintPullsPalette();
    queueMicrotask(() => {
      try {
        const input = root.querySelector('[data-prp-pp-input]');
        input?.focus?.();
        input?.select?.();
      } catch {
        /* ignore */
      }
    });
    return true;
  }

  /** Navigate the real tab (filters / create) so the pulls list page changes. */
