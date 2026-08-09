/**
 * Capture-phase keyboard + opt-hold effects (Phase 7).
 * uiRef/actionsRef assigned in PrModalApp each render before this hook.
 */
import { useEffect } from 'react';
import { useModalStore } from '../store/modal-store';
import { isSideActionAllowedOnLayout } from '../lib/layout-side-actions';
import { resolveReactionAddControl } from '../lib/comment-reactions';

export function usePrModalHotkeys(h: Record<string, any>): void {
  const open = h.open;
  const isEmbed = h.isEmbed;
  const onRestoreNative = h.onRestoreNative;
  const uiRef = h.uiRef;
  const actionsRef = h.actionsRef;
  const paletteOpen = h.paletteOpen;
  const searchOpen = h.searchOpen;
  const layoutMode = h.layoutMode;
  const editingBody = h.editingBody;
  const editingComment = h.editingComment;
  const picker = h.picker;
  const confirmState = h.confirmState;
  const showSelectionComposer = h.showSelectionComposer;
  const selectionIslandPhase = h.selectionIslandPhase;
  const conversationCommentFocusRef = h.conversationCommentFocusRef;
  const LAYOUT_DIFF = h.LAYOUT_DIFF;
  const commentIndex = h.commentIndex;
  const mappedComments = h.mappedComments;
  const requestClose = h.requestClose;
  const onToggleDiff = h.onToggleDiff;
  const collapseDiff = h.collapseDiff;
  const closePicker = h.closePicker;
  const focusConversationCommentItem = h.focusConversationCommentItem;
  const clearConversationCommentFocus = h.clearConversationCommentFocus;
  const runContextThreadAction = h.runContextThreadAction;
  const stepThreadReply = h.stepThreadReply;
  const applySelectionKeyboardMove = h.applySelectionKeyboardMove;
  const tryReenterExitedMultiReply = h.tryReenterExitedMultiReply;
  const navComment = h.navComment;
  const navConversationComment = h.navConversationComment;
  const setSelectionIslandPhase = h.setSelectionIslandPhase;
  const setShowSelectionComposer = h.setShowSelectionComposer;
  const selectionIslandPhaseRef = h.selectionIslandPhaseRef;
  const scrollSelectionIntoView = h.scrollSelectionIntoView;
  const optHeldRef = h.optHeldRef;
  const optHintsSuppressedRef = h.optHintsSuppressedRef;
  const clearSelectionActionsTimer = h.clearSelectionActionsTimer;
  const selectionMoveRafRef = h.selectionMoveRafRef;
  const pendingSelectionMoveRef = h.pendingSelectionMoveRef;
  const syncSelectionActionReveal = h.syncSelectionActionReveal;
  const isMac = h.isMac;
  const setPaletteOpen = h.setPaletteOpen;
  const setPaletteQuery = h.setPaletteQuery;
  const setSearchOpen = h.setSearchOpen;
  const setEditingBody = h.setEditingBody;
  const setEditingComment = h.setEditingComment;
  const setShellFullscreen = h.setShellFullscreen;
  const toggleShellFullscreen = h.toggleShellFullscreen;
  const searchInputRef = h.searchInputRef;
  const runPaletteCommand = h.runPaletteCommand;
  const openStackOrListPr = h.openStackOrListPr;
  const navigateAdjacentPr = h.navigateAdjacentPr;
  const stackItems = h.stackItems;
  const openPulls = h.openPulls;
  const editorSaveRef = h.editorSaveRef;
  const copySelectionCode = h.copySelectionCode;
  const copySelectionUrl = h.copySelectionUrl;
  const dismissSelectionIsland = h.dismissSelectionIsland;
  const scrollConversationPanel = h.scrollConversationPanel;
  const scrollDiffPage = h.scrollDiffPage;
  const navFile = h.navFile;
  const navSearch = h.navSearch;
  const applyReviewFilterToggle = h.applyReviewFilterToggle;
  const toggleViewedActiveFile = h.toggleViewedActiveFile;
  const toggleActiveFileCollapse = h.toggleActiveFileCollapse;
  const setActiveFileCollapse = h.setActiveFileCollapse;
  const toggleSidePanel = h.toggleSidePanel;
  const optArrowScrollSelect = h.optArrowScrollSelect;
  const applyGotoQuery = h.applyGotoQuery;
  const isMultiReplyThreadFocused = h.isMultiReplyThreadFocused;
  const isCommentReactionPickerOpen = h.isCommentReactionPickerOpen;
  const dismissCommentReactionPicker = h.dismissCommentReactionPicker;
  const touchGithubCommandPaletteOpen = h.touchGithubCommandPaletteOpen;
  const shortcutKeyFromEvent = h.shortcutKeyFromEvent;
  const normalizeShortcutKey = h.normalizeShortcutKey;
  const isCodeBodySelection = h.isCodeBodySelection;
  const isThreadSelection = h.isThreadSelection;
  const publishShortcutMonitorFire = h.publishShortcutMonitorFire;
  const buildShortcutMonitorFire = h.buildShortcutMonitorFire;
  const buildShortcutMonitorFireFromParts = h.buildShortcutMonitorFireFromParts;
  const resolveModalShortcutAction = h.resolveModalShortcutAction;
  const resolveModalEscapeOwner = h.resolveModalEscapeOwner;
  const resolveEmbedShortcutAction = h.resolveEmbedShortcutAction;
  const resolveComposerContextShortcutAction = h.resolveComposerContextShortcutAction;
  const resolvePrModalOptAction = h.resolvePrModalOptAction;
  const isEditableKeyboardTarget = h.isEditableKeyboardTarget;
  const isComposerKeyboardTarget = h.isComposerKeyboardTarget;
  const isGithubCommandPaletteOpen = h.isGithubCommandPaletteOpen;
  const shouldIgnoreModalEscapeForGithubPalette = h.shouldIgnoreModalEscapeForGithubPalette;
  const allowPrModalOptPeerWhileEditable = h.allowPrModalOptPeerWhileEditable;
  const findComposerShortcutSurface = h.findComposerShortcutSurface;
  const isNestedEscapeLayerOpen = h.isNestedEscapeLayerOpen;
  const PRP_CONTEXT_THREAD_TAB_LEAVE = h.PRP_CONTEXT_THREAD_TAB_LEAVE;
  const stackDigitSlotNumber = h.stackDigitSlotNumber;

  const collapseActiveFile = h.collapseActiveFile || (() => setActiveFileCollapse?.(true));
  const expandActiveFile = h.expandActiveFile || (() => setActiveFileCollapse?.(false));
  const openPalette = h.openPalette || (() => setPaletteOpen?.(true));
  const openSearch = h.openSearch || (() => setSearchOpen?.(true));
  const recoverGithubCommandPaletteTopLayer = h.recoverGithubCommandPaletteTopLayer;
  const promptAddReviewer = h.promptAddReviewer;
  const findGithubCommandPaletteDialog = h.findGithubCommandPaletteDialog;


  useEffect(() => {
    if (open) return undefined;
    clearSelectionActionsTimer();
    if (selectionMoveRafRef.current) {
      cancelAnimationFrame(selectionMoveRafRef.current);
      selectionMoveRafRef.current = 0;
    }
    pendingSelectionMoveRef.current = null;
    try {
      publishShortcutMonitorFire(null);
    } catch {
      /* ignore */
    }
    return undefined;
  }, [open]);

  /** Report a fired product shortcut to the isolated monitor HUD (no App setState). */
  function reportShortcutMonitor(fire: any) {
    if (!fire || !fire.text) return;
    try {
      publishShortcutMonitorFire({ ...fire, at: fire.at || Date.now() });
    } catch {
      /* ignore */
    }
  }

  function reportShortcutAction(action: string) {
    // E2E / host observability: last resolved product action
    try {
      if (typeof document !== 'undefined' && action) {
        document.documentElement.setAttribute(
          'data-prp-last-shortcut-action',
          String(action)
        );
      }
    } catch {
      /* ignore */
    }
    if (!action || typeof buildShortcutMonitorFire !== 'function') return;
    reportShortcutMonitor(buildShortcutMonitorFire(action, isMac));
  }

  /**
   * Opt-hold → store only (no App setState). Leaf OptBtnHint + overlay class bridge
   * re-render; ConversationView tree stays memoized.
   * Fullscreen Mermaid/Image viewers own the stage — never paint tips underneath.
   */
  function syncOptHintsActive() {
    const ui = uiRef.current || {};
    let viewerOpen = false;
    try {
      viewerOpen = Boolean(
        typeof document !== 'undefined' &&
          (document.querySelector('[data-prp-mermaid-viewer="1"]') ||
            document.querySelector('[data-prp-image-viewer="1"]'))
      );
    } catch {
      viewerOpen = false;
    }
    const active =
      Boolean(optHeldRef.current) &&
      !optHintsSuppressedRef.current &&
      !ui.paletteOpen &&
      !ui.confirmOpen &&
      !viewerOpen;
    useModalStore.getState().setOptHintsActive(active);
    // Selection action group: Opt-hold reveal (no idle auto-show)
    try {
      syncSelectionActionReveal();
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!open) {
      optHeldRef.current = false;
      optHintsSuppressedRef.current = false;
      useModalStore.getState().setOptHintsActive(false);
      return undefined;
    }
    let lastHeld = false;
    const sync = (e: KeyboardEvent) => {
      const held = Boolean(e.altKey);
      if (held === lastHeld) {
        if (!held) {
          optHintsSuppressedRef.current = false;
          syncOptHintsActive();
        }
        return;
      }
      lastHeld = held;
      optHeldRef.current = held;
      if (!held) optHintsSuppressedRef.current = false;
      syncOptHintsActive();
    };
    /**
     * Automation / mid-hold sampling bridge. Synthetic KeyboardEvents from the
     * page world sometimes fail to latch altKey for content-script listeners;
     * e2e holdChord dispatches this while Alt is held so OptBtnHint portals paint.
     * detail.active: boolean
     */
    const onForce = (e: Event) => {
      try {
        const active = Boolean((e as CustomEvent)?.detail?.active);
        lastHeld = active;
        optHeldRef.current = active;
        if (!active) optHintsSuppressedRef.current = false;
        syncOptHintsActive();
      } catch {
        /* ignore */
      }
    };
    const clear = () => {
      if (!lastHeld) return;
      lastHeld = false;
      optHeldRef.current = false;
      optHintsSuppressedRef.current = false;
      useModalStore.getState().setOptHintsActive(false);
    };
    window.addEventListener('prp-set-opt-hints', onForce as any, true);
    window.addEventListener('keydown', sync, true);
    window.addEventListener('keyup', sync, true);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clear();
    });
    return () => {
      window.removeEventListener('prp-set-opt-hints', onForce as any, true);
      window.removeEventListener('keydown', sync, true);
      window.removeEventListener('keyup', sync, true);
      window.removeEventListener('blur', clear);
    };
  }, [open]);

  // Palette / confirm open while Opt held — hide badges without App optHeld state
  useEffect(() => {
    syncOptHintsActive();
  }, [paletteOpen, confirmState, open]);

  // Watch GH ⌘K palette open state so Escape race (GH closes first) still skips pr+ close
  useEffect(() => {
    if (!open) return undefined;
    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc) return undefined;

    const touch = () => {
      try {
        if (typeof touchGithubCommandPaletteOpen === 'function') {
          touchGithubCommandPaletteOpen(doc);
        } else {
          globalThis.PRListFocus?.touchGithubCommandPaletteOpen?.(doc);
        }
      } catch {
        /* ignore */
      }
    };
    touch();

    const mo = new MutationObserver(() => touch());
    try {
      const dlg = typeof findGithubCommandPaletteDialog === 'function'
        ? findGithubCommandPaletteDialog(doc)
        : doc.getElementById('command-palette-pjax-container');
      if (dlg) {
        mo.observe(dlg, {
          attributes: true,
          attributeFilter: ['open', 'class', 'style', 'hidden', 'aria-hidden'],
        });
      }
      // Palette host may mount after open — watch body for dialog insert
      if (doc.body) {
        mo.observe(doc.body, { childList: true, subtree: true });
      }
    } catch {
      /* ignore */
    }

    // After ⌘K / Ctrl+K GH opens palette asynchronously
    const onMaybeOpen = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && String(e.key || '').toLowerCase() === 'k') {
        queueMicrotask(touch);
        requestAnimationFrame(touch);
        setTimeout(touch, 50);
        setTimeout(touch, 200);
      }
    };
    window.addEventListener('keydown', onMaybeOpen, true);

    return () => {
      mo.disconnect();
      window.removeEventListener('keydown', onMaybeOpen, true);
    };
  }, [open]);

  /**
   * Tab past last / before first stop in a focused thread composer → step
   * next/prev review comment (same as ⌥J / ⌥K).
   */
  useEffect(() => {
    if (!open) return undefined;
    const onLeave = (ev: Event) => {
      const ce = ev as CustomEvent;
      const dir = Number(ce?.detail?.dir) || 1;
      try {
        actionsRef.current?.stepContextThreadFromTab?.(dir);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener(
      PRP_CONTEXT_THREAD_TAB_LEAVE,
      onLeave as EventListener
    );
    return () =>
      window.removeEventListener(
        PRP_CONTEXT_THREAD_TAB_LEAVE,
        onLeave as EventListener
      );
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const alt = Boolean(e.altKey);
      // Physical-key token — never use raw e.key for product chords (macOS ⌥ glyphs)
      const key =
        typeof shortcutKeyFromEvent === 'function'
          ? shortcutKeyFromEvent(e)
          : typeof normalizeShortcutKey === 'function'
            ? normalizeShortcutKey({
                key: e.key,
                code: e.code,
                alt,
              })
            : String(e.key || '').toLowerCase();
      const ui = uiRef.current || {};
      const act = actionsRef.current || {};
      const doc = typeof document !== 'undefined' ? document : null;

      // Keep sticky "was open" timestamp current while typing in GH palette
      let ghOpenNow = false;
      try {
        ghOpenNow =
          typeof touchGithubCommandPaletteOpen === 'function'
            ? touchGithubCommandPaletteOpen(doc)
            : Boolean(
                globalThis.PRListFocus?.touchGithubCommandPaletteOpen?.(doc) ||
                  globalThis.PRListFocus?.isGithubCommandPaletteOpen?.(doc) ||
                  (typeof isGithubCommandPaletteOpen === 'function' &&
                    isGithubCommandPaletteOpen(doc))
              );
      } catch {
        try {
          ghOpenNow =
            typeof isGithubCommandPaletteOpen === 'function' &&
            isGithubCommandPaletteOpen(doc);
        } catch {
          ghOpenNow = false;
        }
      }

      // While GH palette is open: never steal chords (let GH handle).
      // On Escape after GH already closed the dialog on this same keydown:
      // short grace suppresses pr+ shell close only — then shortcuts resume.
      if (ghOpenNow) {
        return;
      }
      if (e.key === 'Escape') {
        const ignoreEsc =
          typeof shouldIgnoreModalEscapeForGithubPalette === 'function'
            ? shouldIgnoreModalEscapeForGithubPalette(doc, { target: e.target })
            : Boolean(
                globalThis.PRListFocus?.shouldIgnoreModalEscapeForGithubPalette?.(
                  doc,
                  { target: e.target }
                )
              );
        if (ignoreEsc) {
          // GH may leave <dialog> stuck in the CSS top layer after close
          try {
            globalThis.PRListFocus?.recoverGithubCommandPaletteTopLayer?.(doc);
          } catch {
            /* ignore */
          }
          return;
        }
      }

      // Diff selection shortcuts (only when not typing in an editable field).
      // `key` is already code-normalized (⌥C → "c" even when e.key is "ç").
      const ae = typeof document !== 'undefined' ? document.activeElement : null;
      const typing =
        ae &&
        (ae === document.body
          ? false
          : (ae as HTMLElement).isContentEditable ||
            /^(INPUT|TEXTAREA|SELECT)$/i.test((ae as HTMLElement).tagName || ''));
      // Live store — App may not re-render on every selection change.
      // Action dock may be hidden (Opt/hover only); shortcuts still work on
      // line/file selection alone (AC: ⌥C without dock).
      const chordSel = useModalStore.getState().lineSelection;
      const hasLineOrFileSel = Boolean(
        chordSel &&
          !(
            typeof isThreadSelection === 'function'
              ? isThreadSelection(chordSel)
              : chordSel.kind === 'thread' ||
                chordSel.subjectType === 'thread' ||
                chordSel.kind === 'inline-comment'
          )
      );
      if (
        !typing &&
        ui.layoutMode === LAYOUT_DIFF &&
        hasLineOrFileSel &&
        key === 'c'
      ) {
        // ⌥C → Comment · ⌘C → Copy code · ⌘⌥C → Copy URL
        if (mod && alt) {
          e.preventDefault();
          e.stopPropagation();
          reportShortcutAction('copySelectionUrl');
          void act.copySelectionUrl?.();
          return;
        }
        if (mod && !alt) {
          e.preventDefault();
          e.stopPropagation();
          reportShortcutAction('copySelectionCode');
          void act.copySelectionCode?.();
          return;
        }
        if (!mod && alt && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          reportShortcutAction('openSelectionComment');
          act.openSelectionComment?.();
          return;
        }
      }

      // Finish-review form owns Esc layering + Opt chords (⌥I focus input,
      // leave-review submit) while open. Do not pre-blur, close shell, or
      // steal ⌥I into Diff/Conversation composers.
      const finishReviewOpen = Boolean(
        typeof document !== 'undefined' &&
          document.querySelector('[data-prp-finish-review="1"]')
      );
      if (finishReviewOpen) {
        if (e.key === 'Escape') return;
        if (e.altKey && !e.metaKey && !e.ctrlKey) return;
      }

      // Escape: dismiss nested UI first, otherwise close the whole modal
      // (including from Diff — do not shrink back to conversation).
      // Window-capture runs *before* document listeners (Diff settings, etc.),
      // so shell close must gate on open nested markers, not only stopPropagation.
      if (e.key === 'Escape') {
        const ae =
          typeof document !== 'undefined'
            ? (document.activeElement as HTMLElement | null)
            : null;
        const nestedOpen =
          typeof isNestedEscapeLayerOpen === 'function'
            ? isNestedEscapeLayerOpen(document)
            : Boolean(
                document.querySelector?.(
                  '[data-prp-review-filter-menu="1"], .prp-sselect-panel, [data-prp-nested-layer="1"]'
                )
              );
        const titleEditFocused = Boolean(
          ae &&
            (ae as HTMLElement).classList?.contains('prp-header__title-input')
        );
        const reactionOpen =
          typeof isCommentReactionPickerOpen === 'function' &&
          isCommentReactionPickerOpen(document);
        const viewerOpen = Boolean(
          typeof document !== 'undefined' &&
            (document.querySelector('[data-prp-mermaid-viewer="1"]') ||
              document.querySelector('[data-prp-image-viewer="1"]'))
        );
        const focusEl =
          ae ||
          (e.target as HTMLElement | null);
        const editableFocused = Boolean(
          isEditableKeyboardTarget(focusEl) ||
            isEditableKeyboardTarget(e.target)
        );

        const owner =
          typeof resolveModalEscapeOwner === 'function'
            ? resolveModalEscapeOwner({
                finishReviewOpen: Boolean(
                  typeof document !== 'undefined' &&
                    document.querySelector('[data-prp-finish-review="1"]')
                ),
                confirmOpen: Boolean(ui.confirmOpen),
                paletteOpen: Boolean(ui.paletteOpen),
                pickerOpen: Boolean(ui.pickerOpen),
                searchOpen: Boolean(ui.searchOpen),
                selectionComposerOpen: Boolean(ui.showSelectionComposer),
                editingBodyOrComment: Boolean(
                  ui.editingBody || ui.editingComment
                ),
                reactionPickerOpen: Boolean(reactionOpen),
                viewerOpen,
                titleEditFocused,
                nestedLayerOpen: nestedOpen,
                editableFocused,
              })
            : null;

        // Pure owner says nested: never close shell (finish-review / confirm /
        // pickers / Diff settings / SearchableSelect / viewers / title edit).
        if (owner === 'dismiss-nested' || nestedOpen) {
          // Confirm / finish already own Esc; store pickers/palette/search need
          // explicit dismiss here when App is the only handler for store state.
          if (ui.confirmOpen) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (viewerOpen) {
            // Viewer components close themselves
            return;
          }
          if (reactionOpen) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof dismissCommentReactionPicker === 'function') {
              dismissCommentReactionPicker(document);
            }
            return;
          }
          if (titleEditFocused) {
            // Header title Esc cancels edit
            return;
          }
          if (ui.pickerOpen) {
            e.preventDefault();
            e.stopPropagation();
            act.closePicker?.();
            return;
          }
          if (ui.paletteOpen) {
            e.preventDefault();
            e.stopPropagation();
            setPaletteOpen(false);
            return;
          }
          if (ui.searchOpen || useModalStore.getState().searchOpen) {
            e.preventDefault();
            e.stopPropagation();
            setSearchOpen(false);
            try {
              focusEl?.blur?.();
            } catch {
              /* ignore */
            }
            return;
          }
          if (ui.showSelectionComposer) {
            e.preventDefault();
            if (ui.selectionIslandPhase === 'comment') {
              act.openSelectionActions?.();
            } else {
              dismissSelectionIsland();
            }
            return;
          }
          if (ui.editingBody || ui.editingComment) {
            e.preventDefault();
            setEditingBody(false);
            setEditingComment(null);
            editorSaveRef.current = null;
            return;
          }
          // Diff settings / SearchableSelect / header overflow: window-capture
          // runs before their document listeners — actively dismiss here so Esc
          // is not a no-op when CDP/synthetic keys skip document capture order.
          e.preventDefault();
          e.stopPropagation();
          try {
            const gear = document.querySelector(
              '[data-prp-review-filter-gear="1"][aria-expanded="true"]'
            ) as HTMLElement | null;
            if (gear) {
              gear.click();
            } else if (
              document.querySelector(
                '[data-prp-review-filter-menu="1"], .prp-diff-review-settings--portal'
              )
            ) {
              // Menu open without expanded attr — toggle gear or remove marker
              const g = document.querySelector(
                '[data-prp-review-filter-gear="1"]'
              ) as HTMLElement | null;
              g?.click?.();
            }
          } catch {
            /* ignore */
          }
          try {
            // SearchableSelect: close open panels via Escape on trigger/panel
            const panel = document.querySelector(
              '.prp-sselect-panel, [data-prp-nested-layer="1"]'
            ) as HTMLElement | null;
            if (panel) {
              panel.dispatchEvent(
                new KeyboardEvent('keydown', {
                  key: 'Escape',
                  bubbles: true,
                  cancelable: true,
                })
              );
            }
          } catch {
            /* ignore */
          }
          // Also blur if an editable still holds focus under a nested layer
          if (editableFocused) {
            try {
              focusEl?.blur?.();
            } catch {
              /* ignore */
            }
          }
          return;
        }

        if (owner === 'blur-input' || editableFocused) {
          e.preventDefault();
          e.stopPropagation();
          try {
            focusEl?.blur?.();
          } catch {
            /* ignore */
          }
          // Diff Find may stay mounted one frame after close — force store
          if (useModalStore.getState().searchOpen) {
            setSearchOpen(false);
          }
          return;
        }

        e.preventDefault();
        act.onClose?.();
        return;
      }

      const editable = isEditableKeyboardTarget(e.target);
      const aeForComposer =
        (typeof document !== 'undefined'
          ? (document.activeElement as HTMLElement | null)
          : null) || (e.target as HTMLElement | null);
      // Prefer live store layout so Diff keep-alive does not claim Conversation
      // footer (would steal ⌥I from review-thread focus).
      const liveLayoutForComposer =
        useModalStore.getState().layoutMode || ui.layoutMode;
      // Footer tips stay visible without focus on Conversation only.
      const composerSurface =
        typeof findComposerShortcutSurface === 'function'
          ? findComposerShortcutSurface({
              activeElement: aeForComposer,
              eventTarget: e.target,
              layoutMode: liveLayoutForComposer,
            })
          : {
              active: isComposerKeyboardTarget(aeForComposer),
              root: null as HTMLElement | null,
              mdc: null as HTMLElement | null,
            };
      const composerFocused = Boolean(composerSurface.active);
      // Option product chords: allow Control+Option (⌥⌃R) but not ⌘+Option.
      // `alt` already from e.altKey above (physical-key normalize).
      const ctrlKey = Boolean(e.ctrlKey);
      const altOnly = alt && !e.metaKey && !ctrlKey;
      const shift = Boolean(e.shiftKey);
      // Capabilities for composer-context chords (DOM on focused / default form)
      let canResolveComposer = false;
      let canToggleModeComposer = false;
      let canStartPendingComposer = false;
      if (composerFocused && typeof document !== 'undefined') {
        try {
          const root =
            composerSurface.root ||
            (aeForComposer?.closest?.(
              '[data-prp-composer-root]'
            ) as HTMLElement | null);
          canResolveComposer = Boolean(
            root?.hasAttribute?.('data-prp-can-resolve') ||
              root?.querySelector?.('[data-prp-composer-resolve]')
          );
          canToggleModeComposer = Boolean(
            root?.hasAttribute?.('data-prp-can-toggle-mode') ||
              root?.querySelector?.('[data-prp-composer-mode-tabs]') ||
              document.querySelector?.(
                '.prp-card--composer [data-prp-composer-mode-tabs]'
              )
          );
          canStartPendingComposer = Boolean(
            root?.querySelector?.('[data-prp-composer-start-review]')
          );
        } catch {
          /* ignore */
        }
      }

      // Composer-context chords win over product peers when a surface is
      // active (focused mdc OR Conversation footer). Exception: ⌥I while a
      // review thread is keyboard-focused (not typing) → contextThreadComment.
      if (
        composerFocused &&
        !ui.paletteOpen &&
        typeof resolveComposerContextShortcutAction === 'function'
      ) {
        const composerAct = resolveComposerContextShortcutAction({
          mod: composerFocused ? mod : mod && !alt,
          shift,
          alt: alt && !e.metaKey,
          ctrl: ctrlKey,
          key,
          code: e.code,
          composerFocused: true,
          canResolve: canResolveComposer,
          canToggleMode: canToggleModeComposer,
          canStartPending: canStartPendingComposer,
        });
        let takeComposerEarly = Boolean(composerAct);
        if (
          takeComposerEarly &&
          composerAct === 'composerFocusInput' &&
          !(
            typeof isComposerKeyboardTarget === 'function' &&
            isComposerKeyboardTarget(aeForComposer)
          )
        ) {
          try {
            const stc = useModalStore.getState();
            const onDiffThread =
              stc.layoutMode === LAYOUT_DIFF &&
              (Number(stc.commentIndex) >= 0 ||
                stc.activeDiffCommentId != null);
            const convA = String(
              stc.focusedConversationAnchor ||
                stc.pendingConversationNavAnchor ||
                ''
            ).trim();
            const onConvThread = convA.startsWith('review-comment:');
            if (onDiffThread || onConvThread) {
              takeComposerEarly = false;
            }
          } catch {
            /* ignore */
          }
        }
        if (takeComposerEarly && composerAct) {
          e.preventDefault();
          e.stopPropagation();
          if (e.altKey) {
            optHintsSuppressedRef.current = true;
            syncOptHintsActive();
          }
          reportShortcutAction(String(composerAct));
          const mdc =
            composerSurface.mdc ||
            (aeForComposer?.closest?.(
              '[data-prp-composer], .prp-mdc'
            ) as HTMLElement | null);
          const root =
            composerSurface.root ||
            (aeForComposer?.closest?.(
              '[data-prp-composer-root]'
            ) as HTMLElement | null);
          switch (composerAct) {
            case 'composerSubmit': {
              try {
                if (mdc) {
                  mdc.dispatchEvent(
                    new CustomEvent('prp-composer-submit', {
                      bubbles: true,
                      cancelable: true,
                    })
                  );
                  break;
                }
                const btn = root?.querySelector?.(
                  '[data-prp-composer-submit]:not([disabled])'
                ) as HTMLButtonElement | null;
                btn?.click?.();
              } catch {
                /* ignore */
              }
              break;
            }
            case 'composerFocusInput': {
              try {
                mdc?.dispatchEvent(
                  new CustomEvent('prp-composer-focus-input', {
                    bubbles: true,
                    cancelable: true,
                  })
                );
                const ta =
                  mdc?.querySelector?.('[data-prp-composer-input]') ||
                  root?.querySelector?.('[data-prp-composer-input]');
                (ta as HTMLTextAreaElement | null)?.focus?.();
              } catch {
                /* ignore */
              }
              break;
            }
            case 'composerResolve': {
              try {
                const btn = root?.querySelector?.(
                  '[data-prp-composer-resolve]:not([disabled])'
                ) as HTMLButtonElement | null;
                if (btn) {
                  btn.click();
                  break;
                }
              } catch {
                /* ignore */
              }
              act.runContextThreadAction?.('resolve');
              break;
            }
            case 'composerModeToggle': {
              try {
                const host =
                  root?.closest?.('.prp-card--composer') ||
                  document.querySelector?.('.prp-card--composer');
                const cTab = host?.querySelector?.(
                  '[data-prp-composer-mode="comment"]'
                ) as HTMLButtonElement | null;
                const rTab = host?.querySelector?.(
                  '[data-prp-composer-mode="review"]'
                ) as HTMLButtonElement | null;
                if (cTab && rTab) {
                  const commentOn =
                    cTab.getAttribute('aria-selected') === 'true';
                  (commentOn ? rTab : cTab).click();
                }
              } catch {
                /* ignore */
              }
              break;
            }
            case 'composerStartPending': {
              try {
                const btn = root?.querySelector?.(
                  '[data-prp-composer-start-review]:not([disabled])'
                ) as HTMLButtonElement | null;
                btn?.click?.();
              } catch {
                /* ignore */
              }
              break;
            }
            default:
              break;
          }
          return;
        }
      }

      // Option / Option+Shift command actions (former mod → opt; no mod back-compat)
      // Opt+Shift peers (⌥⇧L labels, ⌥⇧P milestone, …) fire even while typing.
      // Plain Opt stays blocked while typing so text entry is not stolen.
      if (
        altOnly &&
        !ui.paletteOpen &&
        typeof resolvePrModalOptAction === 'function' &&
        (typeof allowPrModalOptPeerWhileEditable !== 'function' ||
          allowPrModalOptPeerWhileEditable({
            editableTarget: editable,
            shift,
          }))
      ) {
        const peer = resolvePrModalOptAction({
          alt: true,
          shift,
          mod: false,
          key,
          code: e.code,
        });
        // Diff owns ⌥⇧R for viewed-toggle — do not steal for Add reviewer
        const liveLayoutForPeer =
          useModalStore.getState().layoutMode || ui.layoutMode;
        const skipPeerForDiffViewed =
          liveLayoutForPeer === LAYOUT_DIFF &&
          shift &&
          key === 'r' &&
          (peer?.action === 'promptAddReviewer' ||
            peer?.id === 'opt-reviewer' ||
  // @ts-expect-error modal dynamic action/picker shapes
            peer?.id === 'add-reviewer');
        // Conversation-only meta (labels/assignees/…) never runs on Diff;
        // Diff-only side peers never run on Conversation.
        const peerBlockedByLayout =
          peer?.action &&
          typeof isSideActionAllowedOnLayout === 'function' &&
          !isSideActionAllowedOnLayout(String(peer.action), liveLayoutForPeer);
        if (peer?.action && peerBlockedByLayout && !skipPeerForDiffViewed) {
          // Swallow chord so keep-alive Conversation chrome cannot fire pickers.
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (peer?.action && !skipPeerForDiffViewed) {
          e.preventDefault();
          e.stopPropagation();
          // Competing product chord owns the surface — dismiss reaction picker.
          try {
            if (
              typeof isCommentReactionPickerOpen === 'function' &&
              isCommentReactionPickerOpen(document) &&
              typeof dismissCommentReactionPicker === 'function'
            ) {
              dismissCommentReactionPicker(document);
            }
          } catch {
            /* ignore */
          }
          // Leave the typing surface so pickers can take focus
          if (editable) {
            try {
              (document.activeElement as HTMLElement | null)?.blur?.();
            } catch {
              /* ignore */
            }
          }
          optHintsSuppressedRef.current = true;
          syncOptHintsActive();
          // Shortcut monitor: opt peer already has title + chord labels
          if (typeof buildShortcutMonitorFireFromParts === 'function') {
            const chord = isMac
  // @ts-expect-error modal dynamic action/picker shapes
              ? peer.labelMac || peer.label
  // @ts-expect-error modal dynamic action/picker shapes
              : peer.labelWin || peer.labelMac || peer.label;
            reportShortcutMonitor(
              buildShortcutMonitorFireFromParts(
                String(chord || ''),
                String(peer.title || peer.action),
                String(peer.action || '')
              )
            );
          } else {
            reportShortcutAction(String(peer.action));
          }
  // @ts-expect-error modal dynamic action/picker shapes
          if (peer.action === 'openPalette') {
            setPaletteOpen(true);
            setPaletteQuery('');
            return;
          }
          // Diff leave-review chords: open Finish modal only (never one-shot submit).
          // Finish modal (when open) owns the same chords for actual submit.
          if (peer.action === 'leaveReview') {
            const finishOpen = Boolean(
              typeof document !== 'undefined' &&
                document.querySelector('[data-prp-finish-review="1"]')
            );
            if (finishOpen) {
              // Modal capture/bubble handler performs submit with modal body
              return;
            }
            const liveLayout =
              useModalStore.getState().layoutMode || ui.layoutMode;
            const onDiff =
              liveLayout === LAYOUT_DIFF ||
              (typeof document !== 'undefined' &&
                Boolean(document.querySelector('.prp-modal--diff')));
            if (onDiff) {
              try {
                window.dispatchEvent(
                  new CustomEvent('prp-open-finish-review', {
                    detail: { kind: peer.payload?.kind || 'comment' },
                  })
                );
              } catch {
                /* ignore */
              }
              return;
            }
          }
          // High-traffic nav peers: call act handlers directly. Avoids
          // runPaletteCommand ReferenceErrors / missing deps killing the chord
          // after the monitor already reported a successful fire.
          const peerAct = String(peer.action || '');
          if (peerAct === 'toggleDiff') {
            act.onToggleDiff?.();
            return;
          }
          if (peerAct === 'toggleSidePanel') {
            act.toggleSidePanel?.();
            return;
          }
          if (peerAct === 'toggleFullscreen') {
            if (!isEmbed) {
              setShellFullscreen((prev) => toggleShellFullscreen(prev));
            }
            return;
          }
          // Route through palette runner (merge confirm, pickers, etc.)
          try {
            act.runPaletteCommand?.({
              action: peer.action,
              payload: peer.payload || {},
              id: peer.id,
              title: peer.title,
            });
          } catch (err) {
            try {
              console.warn(
                '[pr-plus] runPaletteCommand failed:',
                peerAct,
                err?.message || err
              );
            } catch {
              /* ignore */
            }
          }
          return;
        }
      }

      // Live context — App often does not re-render on ⌥J/K focus (store leaf only),
      // so uiRef.contextThreadActive can stay stale false and block ⌥C/F/D/⌃R.
      const storeUi = useModalStore.getState();
      const liveConvAnchor = String(
        conversationCommentFocusRef.current?.anchor ||
          storeUi.focusedConversationAnchor ||
          storeUi.pendingConversationNavAnchor ||
          ''
      ).trim();
      const liveConvFocus = Boolean(liveConvAnchor);
      const onDiff =
        ui.layoutMode === LAYOUT_DIFF || storeUi.layoutMode === LAYOUT_DIFF;
      // Diff: ⌥C/D/⌃R stay available (handlers seed commentIndex 0 if needed).
      // Conversation keep-alive focus must not win on Diff (hidden panel).
      const liveContextThread = onDiff ? true : liveConvFocus;
      const liveSel = storeUi.lineSelection;
      // Real Diff thread focus: ⌥J/K comment nav, active id, or ↑↓ caret on a thread.
      const liveDiffThreadFocused =
        onDiff &&
        (Number(storeUi.commentIndex) >= 0 ||
          storeUi.activeDiffCommentId != null ||
          isThreadSelection(liveSel));
      // Conversation ←/→ only fold when a review-thread stop is focused.
      const liveFocusedReviewThread = onDiff
        ? liveDiffThreadFocused
        : liveConvAnchor.startsWith('review-comment:');
      // Code-body selection only — thread/file carets must not force file fold
      // (otherwise ← / ⌥F close the file while a thread is focused via ↑↓).
      const liveLineSelection = isCodeBodySelection(liveSel);

      let action =
        typeof resolveModalShortcutAction === 'function'
          ? resolveModalShortcutAction({
              // When Option is held, do not treat Ctrl/⌘ as "mod" — Ctrl pairs with ⌥ for resolve.
              // For ⌘Enter submit while composer-focused, keep real mod.
              mod: composerFocused ? mod : mod && !alt,
              shift,
              alt: alt && !e.metaKey,
              /** Physical Control (⌥⌃R resolve) — not ⌘/meta */
              ctrl: ctrlKey,
              key,
              code: e.code,
              editingBody: ui.editingBody,
              editingComment: ui.editingComment,
              paletteOpen: ui.paletteOpen,
              githubPaletteOpen: false, // already bailed above when open
              editableTarget: editable,
              composerFocused,
              canResolve: canResolveComposer,
              canToggleMode: canToggleModeComposer,
              canStartPending: canStartPendingComposer,
              searchOpen: Boolean(ui.searchOpen),
              hasLineSelection: liveLineSelection,
              diffThreadFocused: liveDiffThreadFocused,
              focusedReviewThread: liveFocusedReviewThread,
              layoutMode: ui.layoutMode,
              conversationCommentFocused: liveConvFocus,
              contextThreadActive: liveContextThread,
              multiReplyThreadFocused:
                liveContextThread && isMultiReplyThreadFocused(),
              presentation: isEmbed ? 'embed' : 'modal',
              isEmbed,
            })
          : null;

      // Embed restore (also via pure page-embed helper)
      if (
        !action &&
        isEmbed &&
        typeof resolveEmbedShortcutAction === 'function'
      ) {
        action = resolveEmbedShortcutAction({
          mod: mod && !e.altKey,
          alt: altOnly,
          shift,
          key,
          code: e.code,
          presentation: 'embed',
          editableTarget: editable,
        });
      }

      if (!action) return;

      // Prefer live store for layout-gated chords (uiRef can lag under hold)
      const liveLayoutMode =
        useModalStore.getState().layoutMode || ui.layoutMode;

      // Diff ↔ Conversation side-action isolation (meta pickers vs Diff file chrome)
      if (
        typeof isSideActionAllowedOnLayout === 'function' &&
        !isSideActionAllowedOnLayout(String(action), liveLayoutMode)
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      // Opt-hold tips vanish immediately after a chord fires (until Opt release)
      if (e.altKey) {
        optHintsSuppressedRef.current = true;
        syncOptHintsActive();
      }
      // Bottom-right monitor — only real fires (resolved + about to run)
      reportShortcutAction(String(action));

      // Any product shortcut that takes ownership dismisses emoji/reaction picker
      // (except the reactions-open action itself).
      try {
        const actName = String(action || '');
        const isReactionOpenAct =
          actName === 'contextCommentReact' ||
          actName === 'openReactions' ||
          actName === 'toggleReactions';
        if (
          !isReactionOpenAct &&
          typeof isCommentReactionPickerOpen === 'function' &&
          isCommentReactionPickerOpen(document) &&
          typeof dismissCommentReactionPicker === 'function'
        ) {
          dismissCommentReactionPicker(document);
        }
      } catch {
        /* ignore */
      }

      switch (action) {
        case 'openPalette':
          setPaletteOpen(true);
          setPaletteQuery('');
          break;
        case 'toggleDiff':
          act.onToggleDiff?.();
          break;
        case 'toggleSidePanel':
          act.toggleSidePanel?.();
          break;
        case 'openSearch': {
          setSearchOpen(true);
          // Focus finder input + select all (also on re-press after navigate).
          // Retry: bar may still be mounting; when already open, re-claim focus
          // from Diff rows so Cmd+F never falls through to the browser find UI.
          const focusSearchInput = () => {
            try {
              const el = searchInputRef.current as HTMLInputElement | null;
              if (!el) return false;
              el.focus({ preventScroll: true });
              // Select full value so re-type replaces the previous query
              const len = String(el.value || '').length;
              if (typeof el.select === 'function') el.select();
              else if (typeof el.setSelectionRange === 'function') {
                el.setSelectionRange(0, len);
              }
              return (
                typeof document !== 'undefined' &&
                document.activeElement === el
              );
            } catch {
              return false;
            }
          };
          queueMicrotask(() => {
            if (focusSearchInput()) return;
            requestAnimationFrame(() => {
              if (focusSearchInput()) return;
              window.setTimeout(focusSearchInput, 40);
            });
          });
          break;
        }
        case 'toggleFullscreen':
          if (!isEmbed) {
            setShellFullscreen((prev) => toggleShellFullscreen(prev));
          }
          break;
        case 'focusConversationComment':
          act.focusConversationCommentItem?.();
          break;
        case 'clearConversationCommentFocus':
          act.clearConversationCommentFocus?.();
          break;
        case 'contextThreadFold':
        case 'focusedThreadFold':
          act.runContextThreadAction?.('fold');
          break;
        case 'contextThreadGotoDiff':
        case 'focusedThreadGotoDiff':
          act.runContextThreadAction?.('gotoDiff');
          break;
        case 'contextThreadComment':
        case 'focusedThreadComment':
          act.runContextThreadAction?.('comment');
          break;
        case 'stepThreadReplyPrev':
          act.stepThreadReply?.(-1);
          break;
        case 'stepThreadReplyNext':
          act.stepThreadReply?.(1);
          break;
        case 'contextThreadResolve':
        case 'focusedThreadResolve':
          act.runContextThreadAction?.('resolve');
          break;
        case 'contextCommentCopyBody':
        case 'contextCommentCopyLink':
        case 'contextCommentQuote':
        case 'contextCommentHide':
        case 'contextCommentEdit':
        case 'contextCommentDelete':
        case 'contextCommentReact': {
          try {
            const selMap: Record<string, string[]> = {
              contextCommentCopyBody: ['[data-prp-copy-comment="1"]'],
              contextCommentCopyLink: ['[data-prp-copy-comment-link="1"]'],
              contextCommentQuote: ['[data-prp-quote-reply="1"]'],
              contextCommentHide: [
                '[data-prp-hide-comment="1"]',
                '[data-prp-unhide-comment="1"]',
              ],
              contextCommentEdit: [
                '[data-prp-edit-comment="1"]',
                'button[aria-label*="Edit" i]',
              ],
              contextCommentDelete: [
                '[data-prp-delete-comment="1"]',
                'button[aria-label*="Delete" i]',
              ],
              contextCommentReact: [
                '[data-prp-reaction-add="1"]',
                '.prp-reactions__add',
              ],
            };
            const sels = selMap[String(action)] || [];
            // Prefer the visible layout panel (Diff/Conversation) so keep-alive
            // clones do not receive ⌥E and open a mis-positioned emoji menu.
            const activePanel =
              (document.querySelector(
                '.prp-body-panel--active'
              ) as HTMLElement | null) || null;
            const host =
              (activePanel?.querySelector?.(
                '.prp-inline-thread--context-active, .prp-inline-thread[data-context-active="1"], .prp-card--kb-focus, .prp-conversation-kb-focus, .prp-review-group__row--kb-focus, .prp-vline--comment-selected .prp-inline-thread'
              ) as HTMLElement | null) ||
              (document.querySelector(
                '.prp-body-panel--active .prp-inline-thread--context-active, .prp-body-panel--active .prp-inline-thread[data-context-active="1"], .prp-card--kb-focus, .prp-conversation-kb-focus, .prp-review-group__row--kb-focus, .prp-inline-thread[data-context-active="1"], .prp-vline--comment-selected .prp-inline-thread, .prp-inline-thread--context-active'
              ) as HTMLElement | null) ||
              (document.querySelector(
                '.prp-overlay [data-search-anchor].prp-card--kb-focus, .prp-overlay .prp-card--kb-focus'
              ) as HTMLElement | null) ||
              null;
            const root =
              host ||
              activePanel ||
              (document.querySelector('.prp-overlay') as HTMLElement | null);
            let btn: HTMLElement | null = null;
            // ⌥E / react: prefer unit-focused reply (not root-first querySelector)
            if (String(action) === 'contextCommentReact') {
              btn = resolveReactionAddControl(root) || null;
            }
            if (!btn) {
              for (const s of sels) {
                btn = (root?.querySelector?.(s) || null) as HTMLElement | null;
                if (btn && !(btn as HTMLButtonElement).disabled) {
                  const br = btn.getBoundingClientRect?.();
                  if (br && br.width >= 2 && br.height >= 2) break;
                }
                btn = null;
              }
            }
            if (!btn) {
              for (const s of sels) {
                const candidates = [
                  ...(root?.querySelectorAll?.(s) || []),
                ] as HTMLElement[];
                btn =
                  candidates.find((el) => {
                    if ((el as HTMLButtonElement).disabled) return false;
                    const br = el.getBoundingClientRect?.();
                    return br && br.width >= 2 && br.height >= 2;
                  }) || null;
                if (btn) break;
              }
            }
            if (btn) {
              btn.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
              btn.click();
              // ⌥E: after picker mounts, focus first emoji so Tab/arrows start there
              if (String(action) === 'contextCommentReact') {
                const focusFirstEmoji = () => {
                  const emoji = document.querySelector(
                    '.prp-reactions__picker [data-prp-reaction-emoji="1"], .prp-reactions__picker-btn'
                  ) as HTMLButtonElement | null;
                  if (!emoji) return false;
                  try {
                    emoji.focus({ preventScroll: true });
                  } catch {
                    emoji.focus?.();
                  }
                  return document.activeElement === emoji;
                };
                requestAnimationFrame(() => {
                  if (focusFirstEmoji()) return;
                  requestAnimationFrame(() => {
                    if (focusFirstEmoji()) return;
                    window.setTimeout(focusFirstEmoji, 40);
                  });
                });
              }
            }
          } catch {
            /* ignore */
          }
          break;
        }
        case 'composerSubmit': {
          // Prefer custom event on focused MarkdownComposer; fallback click submit btn
          try {
            const ae = document.activeElement as HTMLElement | null;
            const mdc = ae?.closest?.('[data-prp-composer]') as HTMLElement | null;
            if (mdc) {
              mdc.dispatchEvent(
                new CustomEvent('prp-composer-submit', {
                  bubbles: true,
                  cancelable: true,
                })
              );
              break;
            }
            const root = ae?.closest?.('[data-prp-composer-root]');
            const btn = root?.querySelector?.(
              '[data-prp-composer-submit]:not([disabled])'
            ) as HTMLButtonElement | null;
            btn?.click?.();
          } catch {
            /* ignore */
          }
          break;
        }
        case 'composerFocusInput': {
          try {
            const ae = document.activeElement as HTMLElement | null;
            const mdc = ae?.closest?.('[data-prp-composer]') as HTMLElement | null;
            mdc?.dispatchEvent(
              new CustomEvent('prp-composer-focus-input', {
                bubbles: true,
                cancelable: true,
              })
            );
            const ta =
              mdc?.querySelector?.('[data-prp-composer-input]') ||
              ae?.closest?.('[data-prp-composer-root]')?.querySelector?.(
                '[data-prp-composer-input]'
              );
            (ta as HTMLTextAreaElement | null)?.focus?.();
          } catch {
            /* ignore */
          }
          break;
        }
        case 'composerResolve': {
          // Prefer form resolve button; else context-thread resolve API
          try {
            const ae = document.activeElement as HTMLElement | null;
            const root = ae?.closest?.('[data-prp-composer-root]');
            const btn = root?.querySelector?.(
              '[data-prp-composer-resolve]:not([disabled])'
            ) as HTMLButtonElement | null;
            if (btn) {
              btn.click();
              break;
            }
          } catch {
            /* ignore */
          }
          act.runContextThreadAction?.('resolve');
          break;
        }
        case 'composerStartPending': {
          try {
            const ae = document.activeElement as HTMLElement | null;
            const root = ae?.closest?.(
              '[data-prp-composer-root]'
            ) as HTMLElement | null;
            const btn = root?.querySelector?.(
              '[data-prp-composer-start-review]:not([disabled])'
            ) as HTMLButtonElement | null;
            btn?.click?.();
          } catch {
            /* ignore */
          }
          break;
        }
        case 'composerModeToggle': {
          try {
            const ae = document.activeElement as HTMLElement | null;
            const root = ae?.closest?.('[data-prp-composer-root]');
            const commentTab = root
              ?.closest?.('.prp-card--composer')
              ?.querySelector?.(
                '[data-prp-composer-mode="comment"]'
              ) as HTMLButtonElement | null;
            const reviewTab = root
              ?.closest?.('.prp-card--composer')
              ?.querySelector?.(
                '[data-prp-composer-mode="review"]'
              ) as HTMLButtonElement | null;
            // Prefer tabs from title region (sibling structure)
            const host =
              root?.closest?.('.prp-card--composer') ||
              document.querySelector?.('.prp-card--composer');
            const cTab =
              commentTab ||
              (host?.querySelector?.(
                '[data-prp-composer-mode="comment"]'
              ) as HTMLButtonElement | null);
            const rTab =
              reviewTab ||
              (host?.querySelector?.(
                '[data-prp-composer-mode="review"]'
              ) as HTMLButtonElement | null);
            if (cTab && rTab) {
              const commentOn =
                cTab.getAttribute('aria-selected') === 'true';
              (commentOn ? rTab : cTab).click();
            }
          } catch {
            /* ignore */
          }
          break;
        }
        case 'restoreNativeView':
          if (isEmbed && typeof onRestoreNative === 'function') {
            onRestoreNative();
          }
          break;
        case 'stepNavPrev':
          // Find → Diff threads → Conversation comments (⌥K)
          if (ui.searchOpen) {
            act.navSearch?.(-1);
          } else if (liveLayoutMode === LAYOUT_DIFF) {
            act.navComment?.(-1);
          } else {
            act.navConversationComment?.(-1);
          }
          break;
        case 'stepNavNext':
          // Find → Diff threads → Conversation comments (⌥J)
          if (ui.searchOpen) {
            act.navSearch?.(1);
          } else if (liveLayoutMode === LAYOUT_DIFF) {
            act.navComment?.(1);
          } else {
            act.navConversationComment?.(1);
          }
          break;
        case 'navFilePrev':
          if (liveLayoutMode === LAYOUT_DIFF) act.navFile?.(-1);
          break;
        case 'navFileNext':
          if (liveLayoutMode === LAYOUT_DIFF) act.navFile?.(1);
          break;
        case 'openDiffGoto': {
          if (liveLayoutMode === LAYOUT_DIFF) {
            try {
              window.dispatchEvent(new CustomEvent('prp-open-diff-goto'));
            } catch {
              /* ignore */
            }
          }
          break;
        }
        case 'scrollDiffPagePrev':
          if (
            ui.layoutMode === LAYOUT_DIFF ||
            useModalStore.getState().layoutMode === LAYOUT_DIFF
          ) {
            act.scrollDiffPage?.(-1);
          }
          break;
        case 'scrollDiffPageNext':
          if (
            ui.layoutMode === LAYOUT_DIFF ||
            useModalStore.getState().layoutMode === LAYOUT_DIFF
          ) {
            act.scrollDiffPage?.(1);
          }
          break;
        case 'optArrowScrollSelectPrev':
          if (ui.layoutMode === LAYOUT_DIFF) act.optArrowScrollSelect?.(-1);
          break;
        case 'optArrowScrollSelectNext':
          if (ui.layoutMode === LAYOUT_DIFF) act.optArrowScrollSelect?.(1);
          break;
        case 'scrollConversationOptPrev':
          if (ui.layoutMode !== LAYOUT_DIFF) {
            act.scrollConversationPanel?.(-1, false);
          }
          break;
        case 'scrollConversationOptNext':
          if (ui.layoutMode !== LAYOUT_DIFF) {
            act.scrollConversationPanel?.(1, false);
          }
          break;
        case 'scrollConversationPagePrev':
          if (ui.layoutMode !== LAYOUT_DIFF) {
            act.scrollConversationPanel?.(-1, true);
          }
          break;
        case 'scrollConversationPageNext':
          if (ui.layoutMode !== LAYOUT_DIFF) {
            act.scrollConversationPanel?.(1, true);
          }
          break;
        case 'toggleViewedActiveFile':
          if (ui.layoutMode === LAYOUT_DIFF) act.toggleViewedActiveFile?.();
          break;
        case 'toggleActiveFileCollapse':
          if (ui.layoutMode === LAYOUT_DIFF) act.toggleActiveFileCollapse?.();
          break;
        case 'collapseActiveFile':
          if (ui.layoutMode === LAYOUT_DIFF) act.setActiveFileCollapse?.(true);
          break;
        case 'expandActiveFile':
          if (ui.layoutMode === LAYOUT_DIFF) act.setActiveFileCollapse?.(false);
          break;
        case 'contextThreadCollapse':
          act.runContextThreadAction?.('foldCollapse');
          break;
        case 'contextThreadExpand':
          act.runContextThreadAction?.('foldExpand');
          break;
        case 'collapseFold':
          if (ui.layoutMode === LAYOUT_DIFF) act.setActiveFileCollapse?.(true);
          else act.runContextThreadAction?.('foldCollapse');
          break;
        case 'expandFold':
          if (ui.layoutMode === LAYOUT_DIFF) act.setActiveFileCollapse?.(false);
          else act.runContextThreadAction?.('foldExpand');
          break;
        case 'toggleReviewFilterUnresolved':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applyReviewFilterToggle?.('unresolved');
          }
          break;
        case 'toggleReviewFilterResolved':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applyReviewFilterToggle?.('resolved');
          }
          break;
        case 'toggleReviewFilterPending':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applyReviewFilterToggle?.('pending');
          }
          break;
        case 'moveSelectionUp':
          if (ui.layoutMode === LAYOUT_DIFF) {
            // Prefer live re-entry latch before rAF-coalesced line move
            if (!act.tryReenterExitedMultiReply?.(-1)) {
              act.applySelectionKeyboardMove?.(-1, false);
            }
          }
          break;
        case 'moveSelectionDown':
          if (ui.layoutMode === LAYOUT_DIFF) {
            if (!act.tryReenterExitedMultiReply?.(1)) {
              act.applySelectionKeyboardMove?.(1, false);
            }
          }
          break;
        case 'extendSelectionUp':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applySelectionKeyboardMove?.(-1, true);
          }
          break;
        case 'extendSelectionDown':
          if (ui.layoutMode === LAYOUT_DIFF) {
            act.applySelectionKeyboardMove?.(1, true);
          }
          break;
        case 'navAdjacentPrev':
          act.navigateAdjacentPr?.('prev');
          break;
        case 'navAdjacentNext':
          act.navigateAdjacentPr?.('next');
          break;
        default: {
          // navStackDigit1 … navStackDigit9
          const m = String(action || '').match(/^navStackDigit([1-9])$/);
          if (m) {
            const digit = Number(m[1]);
            const items = act.stackItems || [];
            const num =
              typeof stackDigitSlotNumber === 'function'
                ? stackDigitSlotNumber(digit, items)
                : Number(items[digit - 1]?.number);
            if (num != null && Number.isFinite(num) && num > 0) {
              act.openStackOrListPr?.(num);
            }
          }
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, isEmbed, onRestoreNative]);


}
