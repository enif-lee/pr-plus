  function navigatePage(href) {
    const raw = String(href || '').trim();
    if (!raw) return false;
    let abs = raw;
    try {
      abs = new URL(raw, location.href).href;
    } catch {
      /* keep raw */
    }
    // GitHub Turbo soft-nav when available (keeps SPA shell, still updates list)
    try {
      const turbo = globalThis.Turbo || globalThis.turbo;
      if (turbo && typeof turbo.visit === 'function') {
        turbo.visit(abs);
        return true;
      }
    } catch {
      /* fall through */
    }
    try {
      location.href = abs;
      return true;
    } catch {
      try {
        location.assign(abs);
        return true;
      } catch {
        try {
          const a = document.createElement('a');
          a.href = abs;
          a.setAttribute('data-turbo', 'true');
          document.body.appendChild(a);
          a.click();
          a.remove();
          return true;
        } catch {
          return false;
        }
      }
    }
  }

  function activatePullsPaletteItem(index) {
    const api = pullsPaletteApi();
    const items = pullsPaletteItems || rebuildPullsPaletteItems() || [];
    // Prefer exact alias (am/my/np) over stale focus index
    const resolvedIdx =
      typeof api?.resolveActivateIndex === 'function'
        ? api.resolveActivateIndex(items, index, pullsPaletteQuery)
        : index;
    const item = items[resolvedIdx];
    if (!item) return false;
    pullsPaletteFocusIndex = resolvedIdx;
    return executePullsPaletteCommand(item);
  }

  function stepPullsPaletteFocus(delta) {
    const api = pullsPaletteApi();
    const items = pullsPaletteItems || rebuildPullsPaletteItems() || [];
    const next =
      typeof api?.nextPaletteFocusIndex === 'function'
        ? api.nextPaletteFocusIndex(
            pullsPaletteFocusIndex,
            delta,
            items.length
          )
        : items.length
          ? (pullsPaletteFocusIndex + delta + items.length) % items.length
          : -1;
    pullsPaletteFocusIndex = next;
    updatePullsPaletteFocus();
    return next;
  }

  function onPullsListKeydown(event) {
    // Escape / any key while GH palette is closing: heal stuck top-layer first
    if (!current.open) {
      recoverGithubPaletteIfStuck();
    }

    // Never steal keys while GitHub's command palette is open
    if (githubPaletteOpenNow()) return;
    // Same Escape that just closed GH palette — do not treat as our action
    if (event.key === 'Escape' && githubPaletteOwnsEscape(event)) return;

    if (!hostEnabled) return;
    if (current.open) return;

    const pp = pullsPaletteApi();
    const listApi = listFocusApi();
    const mod = event.metaKey || event.ctrlKey;
    const shift = event.shiftKey;
    const alt = event.altKey;

    // Option held → show ⌥1–9a–e / ⌥N hints on the list (not inside palette)
    if (
      !isPullsPaletteOpen() &&
      isPullsListPage() &&
      alt &&
      !mod &&
      !shift &&
      (event.code === 'AltLeft' ||
        event.code === 'AltRight' ||
        event.key === 'Alt')
    ) {
      showPullsListHotkeyHints();
    } else if (alt && !mod && !shift && !isPullsPaletteOpen() && isPullsListPage()) {
      // Any other Option+chord while held: keep hints visible
      showPullsListHotkeyHints();
    }

    // --- Pulls command palette shortcuts ---
    if (typeof pp?.resolvePullsPaletteShortcutAction === 'function') {
      const raw = pp.resolvePullsPaletteShortcutAction({
        mod,
        shift,
        alt,
        key: event.key,
        code: event.code,
        paletteOpen: isPullsPaletteOpen(),
        isPullsList: isPullsListPage(),
        hostEnabled,
        githubPaletteOpen: false,
        modalOpen: false,
        editableTarget: isEditableKeyTarget(event.target),
      });
      const { action, digitIndex } =
        typeof pp.unwrapPullsPaletteAction === 'function'
          ? pp.unwrapPullsPaletteAction(raw)
          : { action: typeof raw === 'string' ? raw : raw?.action, digitIndex: raw?.digitIndex ?? -1 };

      if (action) {
        // Allow typing in the palette search for normal keys; only handle resolved actions
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        if (action === 'openPalette') {
          openPullsPalette();
          return;
        }
        if (action === 'closePalette') {
          closePullsPalette();
          return;
        }
        if (action === 'focusNext') {
          stepPullsPaletteFocus(1);
          return;
        }
        if (action === 'focusPrev') {
          stepPullsPaletteFocus(-1);
          return;
        }
        if (action === 'activate') {
          activatePullsPaletteItem(
            pullsPaletteFocusIndex >= 0 ? pullsPaletteFocusIndex : 0
          );
          return;
        }
        // (selectDigit handled below)
        if (action === 'selectDigit') {
          const items = pullsPaletteItems || rebuildPullsPaletteItems() || [];
          if (digitIndex >= 0 && digitIndex < items.length) {
            pullsPaletteFocusIndex = digitIndex;
            activatePullsPaletteItem(digitIndex);
          }
          return;
        }
      }
    }

    // When palette is open, do not run list-row shortcuts
    if (isPullsPaletteOpen()) return;

    if (!isPullsListPage()) return;

    // Peer filter actions (⌥⇧G Assigned, ⌥⇧C Created, …) — floating dock
    if (alt && shift && !mod && typeof pp?.resolvePullsPeerOptAction === 'function') {
      const peer = pp.resolvePullsPeerOptAction({
        alt: true,
        shift: true,
        mod: false,
        key: event.key,
        code: event.code,
      });
      if (peer?.filterId || peer?.action) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        executePullsPaletteCommand({
          action: peer.action || 'applyFilter',
          filterId: peer.filterId,
          id: peer.id,
        });
        return;
      }
    }

    const resolve =
      listApi?.resolvePrListShortcutAction ||
      (typeof globalThis !== 'undefined' &&
        globalThis.PRListFocus?.resolvePrListShortcutAction);
    if (typeof resolve !== 'function') return;

    const rawList = resolve({
      mod,
      shift,
      alt,
      key: event.key,
      code: event.code,
      editableTarget: isEditableKeyTarget(event.target),
      modalOpen: Boolean(current.open),
      isPullsList: true,
      hostEnabled,
      hasFocusedRow: resolvePullsListFocusIndex() >= 0,
      githubPaletteOpen: false,
      pullsPaletteOpen: false,
    });
    const unwrapped =
      typeof listApi?.unwrapPrListAction === 'function'
        ? listApi.unwrapPrListAction(rawList)
        : typeof rawList === 'string'
          ? { action: rawList, index: -1, filterId: null }
          : {
              action: rawList?.action || null,
              index: rawList?.index ?? -1,
              filterId: rawList?.filterId || null,
            };
    const { action, index: hotIndex, filterId } = unwrapped;
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }

    if (action === 'focusNext') {
      stepPullsListFocus(1);
      return;
    }
    if (action === 'focusPrev') {
      stepPullsListFocus(-1);
      return;
    }
    if (action === 'openFocused') {
      openFocusedPullsListRow();
      return;
    }
    if (action === 'openByHotkey') {
      hidePullsListHotkeyHints();
      openPullsListRowAt(hotIndex);
      return;
    }
    if (action === 'openFilterBar') {
      hidePullsListHotkeyHints();
      activateFilterBar(filterId);
      return;
    }
    if (action === 'newPullRequest') {
      hidePullsListHotkeyHints();
      openNewPullRequestFromList();
    }
  }

  function onPullsListKeyup(event) {
    if (event.key === 'Alt' || event.code === 'AltLeft' || event.code === 'AltRight') {
      hidePullsListHotkeyHints();
    }
    // If Option released mid-chord (browser may not fire Alt keyup alone)
    if (!event.altKey) {
      hidePullsListHotkeyHints();
    }
  }

  /**
   * ⌥J/K list navigator is ephemeral: any pointer/click or focus leaving
   * the list clears the highlight so it does not stick after mouse use.
   */
  function dismissPullsListFocusIfAny() {
    if (listFocusNumber == null && resolvePullsListFocusIndex() < 0) return;
    clearPullsListFocus();
  }

  function onPointerDownCapture(event) {
    if (current.open) return;
    recoverGithubPaletteIfStuck();
    // Pulls palette owns its own focus chrome
    if (isPullsPaletteOpen()) return;
    if (!isPullsListPage()) return;
    // Any click/tap dismisses keyboard list focus (including on a PR row)
    if (listFocusNumber != null || resolvePullsListFocusIndex() >= 0) {
      dismissPullsListFocusIfAny();
    }
  }

  function onDocumentFocusIn(event) {
    if (current.open) return;
    if (isPullsPaletteOpen()) return;
    if (!isPullsListPage()) return;
    if (listFocusNumber == null && resolvePullsListFocusIndex() < 0) return;

    const t = event?.target;
    // Focus moved into an editable / chrome control → drop list navigator
    if (isEditableKeyTarget(t)) {
      dismissPullsListFocusIfAny();
      return;
    }
    // Focus outside any PR row → drop
    try {
      const rows = getPullsListRows();
      const inside = rows.some((r) => r && (r === t || r.contains?.(t)));
      if (!inside) dismissPullsListFocusIfAny();
    } catch {
      dismissPullsListFocusIfAny();
    }
  }

  function onWindowBlur() {
    if (current.open) return;
    dismissPullsListFocusIfAny();
    hidePullsListHotkeyHints();
  }

  function ensurePullsListKeyboard() {
    if (listFocusKeyBound) return;
    listFocusKeyBound = true;
    document.addEventListener('keydown', onPullsListKeydown, true);
    document.addEventListener('keyup', onPullsListKeyup, true);
    // pointerdown: recover stuck GH palette top-layer + dismiss list focus
    document.addEventListener('pointerdown', onPointerDownCapture, true);
    document.addEventListener('focusin', onDocumentFocusIn, true);
    window.addEventListener('blur', onWindowBlur);
  }

  function onClickCapture(event) {
    if (!current.open) {
      recoverGithubPaletteIfStuck();
    }
    // Clicks outside the pulls palette (non-palette targets) close it only via backdrop handler
    if (!hostEnabled) return;
    if (!isPullsListPage()) return;
    if (isPullsPaletteOpen()) return;
    if (githubPaletteOpenNow()) return;
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const path =
      typeof event.composedPath === 'function' ? event.composedPath() : [];
    const nodes = path.length ? path : [event.target];
    let anchor = null;
    for (const n of nodes) {
      if (
        n &&
        n.tagName === 'A' &&
        n.getAttribute?.('href')?.includes('/pull/')
      ) {
        anchor = n;
        break;
      }
      if (n?.closest) {
        const a = n.closest('a[href*="/pull/"]');
        if (a) {
          anchor = a;
          break;
        }
      }
    }
    if (!anchor) return;

    const parsed = parsePrFromAnchor(anchor);
    if (!parsed) return;

    const inRow = anchor.closest(
      '.js-issue-row, [id^="issue_"], li[role="listitem"], .js-navigation-container'
    );
    const looksLikeTitle =
      anchor.classList.contains('js-navigation-open') ||
      anchor.classList.contains('markdown-title') ||
      Boolean(anchor.id?.endsWith('_link')) ||
      Boolean(inRow);

    if (!looksLikeTitle) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    // List entry always opens Conversation — do not restore prior Diff/session page.
    // Stack hops / refresh restore may still pass an explicit page.
    void openModal({ ...parsed, page: 'conversation' });
  }

  function install() {
    document.addEventListener('click', onClickCapture, true);
    ensurePullsListKeyboard();
    // After stack tree bootstrap (or re-apply), restore open modal + session view
    window.addEventListener('pr-plus-stack-ready', () => {
      if (!hostEnabled) return;
      void tryRestoreOpenModal();
    });
    // Back/forward cache can restore a frozen modal without re-running content
    // scripts — pending review rows then look missing until a soft refresh.
    window.addEventListener('pageshow', (event) => {
      if (!event?.persisted) return;
      if (!hostEnabled || !current.open) return;
      if (!current.owner || !current.repo || current.number == null) return;
      const bridge = globalThis.PRTreeBridge;
      if (
        typeof bridge?.isExtensionContextAlive === 'function' &&
        !bridge.isExtensionContextAlive()
      ) {
        return;
      }
      const props = buildProps();
      if (typeof props.onRefresh === 'function') {
        void props.onRefresh().catch((err) => {
          const msg = String(err?.message || err || '');
          if (/Extension context invalidated|Extension was reloaded/i.test(msg)) {
            return;
          }
          console.warn('[pr+] pageshow refresh failed', err);
        });
      }
    });
  }

  /**
   * Wipe in-memory SWR + page-origin IndexedDB PR detail cache.
   * Invoked from popup settings via PR_TREE_CLEAR_DETAIL_CACHE.
   */
  async function clearDetailCache() {
    try {
      const r = detailCache.clear?.();
      if (r && typeof r.then === 'function') await r;
    } catch (err) {
      console.warn('[pr+] detailCache.clear failed', err);
    }
    // Fresh handle in case the singleton cache missed IDB (tests / fallback)
    try {
      const idb = globalThis.PRModalDetailIdb?.createDetailIdb?.();
      if (idb?.clear) await idb.clear();
    } catch (err) {
      console.warn('[pr+] IDB clear failed', err);
    }
    return { ok: true };
  }

  function listenClearDetailCache() {
    try {
      chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
        if (message?.type !== 'PR_TREE_CLEAR_DETAIL_CACHE') return false;
        void clearDetailCache()
          .then((res) => {
            try {
              sendResponse(res || { ok: true });
            } catch {
              /* channel closed */
            }
          })
          .catch((err) => {
            try {
              sendResponse({
                ok: false,
                error: err?.message || String(err),
              });
            } catch {
              /* ignore */
            }
          });
        // Keep channel open for async sendResponse
        return true;
      });
    } catch {
      /* ignore */
    }
  }

  globalThis.PRModalHost = {
    install,
    openModal,
    closeModal,
    tryRestoreOpenModal,
    tryEmbedFromLocation,
    restoreNativeView,
    ensureGithubPrToggle,
    persistRouteState,
    setEnabled,
    /** After list paint: CSS + prefs so click is not cold. */
    warmUp,
    isEnabled: () => hostEnabled,
    parsePrFromAnchor,
    parsePrPagePath,
    isPullsListPage,
    clearDetailCache,
    /** Test / debug: PR list keyboard focus helpers */
    _listFocus: {
      clear: clearPullsListFocus,
      dismiss: dismissPullsListFocusIfAny,
      apply: applyPullsListFocus,
      step: stepPullsListFocus,
      openFocused: openFocusedPullsListRow,
      resolveIndex: resolvePullsListFocusIndex,
      get focusNumber() {
        return listFocusNumber;
      },
      set focusNumber(v) {
        listFocusNumber = v;
      },
    },
    /** Test / debug: pulls command palette */
    _pullsPalette: {
      open: openPullsPalette,
      close: closePullsPalette,
      isOpen: isPullsPaletteOpen,
      paint: paintPullsPalette,
      activate: activatePullsPaletteItem,
      stepFocus: stepPullsPaletteFocus,
      get query() {
        return pullsPaletteQuery;
      },
      set query(v) {
        pullsPaletteQuery = String(v || '');
      },
      get focusIndex() {
        return pullsPaletteFocusIndex;
      },
      get items() {
        return pullsPaletteItems;
      },
    },
    _getState: () => ({
      ...current,
      hostEnabled,
      prefsReady,
      modalCssReady,
      listFocusNumber,
      pullsPaletteOpen,
      pullsPaletteQuery,
      pullsPaletteFocusIndex,
    }),
    _detailCache: detailCache,
  };

  listenClearDetailCache();
  install();
  // Preload modal CSS as soon as the content script boots (before clicks)
  try {
    void ensureAssets();
  } catch {
    /* ignore */
  }

