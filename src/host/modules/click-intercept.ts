// TypeScript SoT — assembled by build scripts (classic runtime JS emit)

  function onClickCapture(event: any) {
    // Always heal stuck GH ⌘K top layer (even when pr+ modal is open)
    recoverGithubPaletteIfStuck();
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
    let anchor: any = null;
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

    // Pref: listOpenMode=page → let GitHub navigate to /pull/N (no modal).
    // autoOpenEmbed still decides embed vs native on the PR page.
    try {
      if (normalizeListOpenMode(prefs?.listOpenMode) === 'page') {
        return;
      }
    } catch {
      /* fall through to modal */
    }

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
    if (typeof isPartnerOrShellRuntime === 'function' && isPartnerOrShellRuntime()) {
      return;
    }
    document.addEventListener('click', onClickCapture, true);
    ensurePullsListKeyboard();
    // GH ⌘K can leave :modal stuck after Esc — watch Escape/pointer/mutations
    try {
      ensureGithubPaletteTopLayerWatch();
    } catch {
      /* ignore */
    }
    // Modal + full-page embed: activity-gated head.sha auto-refresh
    try {
      ensureAutoRefreshWatch();
    } catch {
      /* ignore */
    }
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
      const bridge = (globalThis as any).PRTreeBridge;
      if (
        typeof bridge?.isExtensionContextAlive === 'function' &&
        !bridge.isExtensionContextAlive()
      ) {
        return;
      }
      try {
        noteAutoRefreshAction({ force: true });
      } catch {
        /* ignore */
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
      const idb = (globalThis as any).PRModalDetailIdb?.createDetailIdb?.();
      if (idb?.clear) await idb.clear();
    } catch (err) {
      console.warn('[pr+] IDB clear failed', err);
    }
    return { ok: true };
  }

  function listenClearDetailCache() {
    try {
      chrome.runtime?.onMessage?.addListener((message: any, _sender: any, sendResponse: any) => {
        if (message?.type === 'PR_TREE_OPEN_PR') {
          if (!hostFeaturesEvaluated) {
            try {
              sendResponse({ ok: true, ready: false });
            } catch {
              /* ignore */
            }
            return true;
          }
          if (!hostEnabled) {
            try {
              sendResponse({
                ok: false,
                ready: true,
                hostEnabled: false,
                reason: 'plugin-disabled',
              });
            } catch {
              /* ignore */
            }
            return true;
          }
          try {
            void openModal({
              owner: message.owner,
              repo: message.repo,
              number: message.number,
              page: message.page,
              position: message.position,
              presentation:
                typeof isPartnerOrShellRuntime === 'function' &&
                isPartnerOrShellRuntime()
                  ? 'modal'
                  : message.presentation,
              commitSha: message.commitSha,
              commitEndSha: message.commitEndSha,
              filePath: message.filePath,
              fileKey: message.fileKey,
              startLine: message.startLine,
              endLine: message.endLine,
              side: message.side,
            });
            sendResponse({ ok: true, ready: true, hostEnabled: true });
          } catch (err: any) {
            sendResponse({
              ok: false,
              ready: true,
              hostEnabled: true,
              error: err?.message || String(err),
            });
          }
          return true;
        }
        if (message?.type === 'PR_TREE_CLOSE_PR') {
          try {
            closeModal();
            sendResponse({ ok: true });
          } catch (err: any) {
            sendResponse({ ok: false, error: err?.message || String(err) });
          }
          return true;
        }
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

  (globalThis as any).PRModalHost = {
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
    runtime: () => HOST_RUNTIME,
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

