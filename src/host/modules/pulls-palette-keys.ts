  // continued host module segment
  function onPullsListKeydown(event) {
    // Escape / close races leave GH dialog in :modal — always schedule heal
    // (do not gate on current.open; embed can be open while top layer is stuck).
    if (event.key === 'Escape' || event.key === 'Esc') {
      scheduleGithubPaletteTopLayerHeal();
    } else {
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
    // Heal stuck GH top layer before any early-return (incl. pr+ modal open)
    recoverGithubPaletteIfStuck();
    if (current.open) return;
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

