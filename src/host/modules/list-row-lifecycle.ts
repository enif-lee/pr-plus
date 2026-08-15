// TypeScript SoT — assembled by build scripts (classic runtime JS emit)

  function openPullsListRowAt(index: any) {
    const rows = getPullsListRows();
    if (index < 0 || index >= rows.length) return false;
    const row = rows[index];
    const parsed = parsePrFromListRow(row);
    if (!parsed) return false;
    applyPullsListFocus(index);
    // listOpenMode=page: keyboard Enter matches title-click → /pull/N.
    try {
      if (normalizeListOpenMode(prefs?.listOpenMode) === 'page') {
        const href = `/${parsed.owner}/${parsed.repo}/pull/${parsed.number}`;
        return navigatePage(href);
      }
    } catch {
      /* fall through to modal */
    }
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
      let fallback: any = null;
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

  function findRowTitleAnchor(row: any) {
    if (!row?.querySelector) return null;
    return (
      row.querySelector('a.js-navigation-open') ||
      row.querySelector('a[id$="_link"]') ||
      row.querySelector('h3 a[href*="/pull/"]') ||
      row.querySelector('a[href*="/pull/"]')
    );
  }

  function cleanControlLabel(el: any) {
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
          : defs.find((d: any) => d.match?.test?.(text));
        if (!def || seen.has(def.id)) continue;
        seen.add(def.id);
        found.push({ el, def });
      }
      if (found.length >= defs.length) break;
    }
    return found;
  }

  /** Dispatch a full click sequence so GH SelectMenu / details open reliably. */
  function clickControl(el: any) {
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

  function activateFilterBar(filterId: any) {
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
  function setPullsListHotkeyHints(visible: any) {
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
        : (i: any) => slots[i] || null;

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

  function stepPullsListFocus(delta: any) {
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
  function githubPaletteOwnsEscape(event: any) {
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
   * after close, which blocks all page clicks. Always safe to call (no-ops when
   * dialog.open is true). Do not gate on current.open — PR embed can be open
   * while the GH palette still poisons the top layer.
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
    // Fallback if pure module not yet loaded
    try {
      const d =
        document.getElementById('command-palette-pjax-container') ||
        document.querySelector?.('dialog.js-command-palette-dialog');
      if (!d || d.open) return false;
      let isModal = false;
      try {
        isModal = typeof d.matches === 'function' && d.matches(':modal');
      } catch {
        isModal = false;
      }
      if (!isModal) return false;
      try {
        (d as HTMLDialogElement).close?.();
      } catch {
        /* ignore */
      }
      try {
        d.removeAttribute?.('open');
      } catch {
        /* ignore */
      }
      if (d.matches?.(':modal')) {
        const parent = d.parentNode;
        const next = d.nextSibling;
        if (parent) {
          parent.removeChild(d);
          if (next) parent.insertBefore(d, next);
          else parent.appendChild(d);
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Escape / close races: GH clears open before :modal drops — heal multi-pass. */
  function scheduleGithubPaletteTopLayerHeal() {
    recoverGithubPaletteIfStuck();
    try {
      queueMicrotask(() => recoverGithubPaletteIfStuck());
    } catch {
      /* ignore */
    }
    setTimeout(() => recoverGithubPaletteIfStuck(), 0);
    setTimeout(() => recoverGithubPaletteIfStuck(), 50);
    setTimeout(() => recoverGithubPaletteIfStuck(), 200);
  }

  /**
   * Always-on heal: Escape after GH ⌘K, pointerdown, and dialog open→false.
   * Clicks alone are insufficient — stuck :modal blocks hit-testing so click
   * handlers may never run in a useful way.
   */
  function ensureGithubPaletteTopLayerWatch() {
    if ((ensureGithubPaletteTopLayerWatch as any)._installed) return;
    (ensureGithubPaletteTopLayerWatch as any)._installed = true;

    const onKey = (event: any) => {
      const key = String(event?.key || '');
      if (key === 'Escape' || key === 'Esc') {
        scheduleGithubPaletteTopLayerHeal();
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keyup', onKey, true);
    // Capture before anything else — heal even when pr+ modal is open
    document.addEventListener(
      'pointerdown',
      () => {
        recoverGithubPaletteIfStuck();
      },
      true
    );

    const watchDialog = (d: any) => {
      if (!d || d.__prpGhPaletteWatch) return;
      d.__prpGhPaletteWatch = true;
      try {
        const mo = new MutationObserver(() => {
          if (!d.open) scheduleGithubPaletteTopLayerHeal();
        });
        mo.observe(d, {
          attributes: true,
          attributeFilter: ['open', 'class', 'style'],
        });
      } catch {
        /* ignore */
      }
    };

    const scan = () => {
      try {
        watchDialog(document.getElementById('command-palette-pjax-container'));
        watchDialog(document.querySelector?.('dialog.js-command-palette-dialog'));
        recoverGithubPaletteIfStuck();
      } catch {
        /* ignore */
      }
    };
    scan();
    try {
      const rootMo = new MutationObserver((records) => {
        // pr+ commits are unrelated to GitHub's palette and can be frequent.
        if (document.documentElement.classList.contains('prp-embed-active')) {
          return;
        }
        if (
          records.every((record) =>
            (record.target as Element)?.closest?.(
              '#prp-page-embed, #prp-modal-host, .prp-overlay'
            )
          )
        ) {
          return;
        }
        scan();
      });
      rootMo.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    } catch {
      /* ignore */
    }
    // Cheap safety net if Escape observers miss a stuck frame
    try {
      setInterval(() => {
        try {
          const api = listFocusApi();
          if (typeof api?.isGithubCommandPaletteStuck === 'function') {
            if (api.isGithubCommandPaletteStuck(document)) {
              recoverGithubPaletteIfStuck();
            }
            return;
          }
        } catch {
          /* fall through */
        }
        recoverGithubPaletteIfStuck();
      }, 1500);
    } catch {
      /* ignore */
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pulls-page command palette (⌥⇧K) — search/filter/open/create        */
  /* ------------------------------------------------------------------ */
