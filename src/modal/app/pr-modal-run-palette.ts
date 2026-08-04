/** Command palette action runner extracted from PrModalApp */
import { buildGithubPrPageUrl } from '../lib/ui-polish';
import { copyTextToClipboard } from '../lib/copy-to-clipboard';

export function runPaletteCommand(d: Record<string, any>, cmd: any) {
  const {
    setPaletteHelpOpen, setPaletteOpen, setPaletteQuery, openStackOrListPr, navigateAdjacentPr,
    focusConversationCommentItem, clearConversationCommentFocus, applyReviewFilterToggle,
    applySelectionKeyboardMove, openSelectionComposer, copySelectionCode, copySelectionUrl,
    onToggleDiff, toggleSidePanel, setSearchOpen, setSearchQuery, setSearchHits, setSearchHitIndex,
    toggleFullscreen, onToggleShellFullscreen, startEditTitle, startEditBody, openBasePicker, onSetDraftStage, onMergePr,
    onUpdateBranch, onSubscribe, onUnsubscribe, openMilestonePicker, clearMilestone, onRerequestReview,
    openReviewerPicker, openAssigneePicker, onRemoveReviewer, onRemoveAssignee, openLabelPicker,
    onLeaveReviewAction, onClosePr, onReopenPr, applySetLabels, detail, layoutMode, LAYOUT_DIFF,
    applyActionRef, setActionMsg, focusCommentBox, onRefresh, collapseActiveFile, expandActiveFile,
    collapseFold, expandFold, stepNavPrev, stepNavNext, scrollDiffPage, optArrowScrollSelect,
    toggleViewedActiveFile, toggleActiveFileCollapse, contextThreadCollapse, contextThreadExpand,
    contextThreadFold, contextThreadGotoDiff, contextThreadComment, contextThreadResolve,
    focusedThreadFold, focusedThreadGotoDiff, focusedThreadComment, focusedThreadResolve,
    scrollConversationPanel, navConversationComment, navComment, navSearch, navFile,
    moveSelectionUp, moveSelectionDown,
    extendSelectionUp, extendSelectionDown, navAdjacentPrev, navAdjacentNext, openGithub,
    promptLabels, promptMilestone, promptBase, promptAddReviewer, promptRemoveReviewer,
    promptAddAssignee, promptRemoveAssignee, rerequestReview, leaveReview, mergePr, updateBranch,
    convertDraft, readyForReview, toggleDraftStage, editTitle, editBody, subscribe, unsubscribe,
    closePr, reopenPr, applySuggestion, focusComment, openStackPr, openPullRequest,
    setActiveFileCollapse, applyGotoQuery, onDiscardPendingReview, onReplyToThread, onResolveThread,
    runContextThreadAction, searchOpen, searchInputRef, setTitleEditSignal, setEditingBody,
    setSelectionIslandPhase, setShowSelectionComposer, setPicker, closePicker,
    useModalStore: useModalStoreDep, uiRef, isReviewVerdictKind, isViewerPrAuthor,
    onSetMilestone,
  } = d;
  // Optional helpers (may be provided by App or fall back to global / no-op)
  const runCtx =
    typeof runContextThreadAction === 'function'
      ? runContextThreadAction
      : (typeof contextThreadFold === 'function'
          ? (kind: string) => {
              if (kind === 'fold') contextThreadFold?.();
              else if (kind === 'gotoDiff') contextThreadGotoDiff?.();
              else if (kind === 'comment') contextThreadComment?.();
              else if (kind === 'resolve') contextThreadResolve?.();
              else if (kind === 'foldCollapse') contextThreadCollapse?.();
              else if (kind === 'foldExpand') contextThreadExpand?.();
            }
          : () => {});
  if (!cmd) return;
  // Help toggle keeps the palette open
  if (cmd.action === 'toggleHelp') {
    if (typeof setPaletteHelpOpen === 'function') setPaletteHelpOpen((v: boolean) => !v);
    return;
  }
  if (typeof setPaletteOpen === 'function') setPaletteOpen(false);
  if (typeof setPaletteQuery === 'function') setPaletteQuery('');
  if (typeof setPaletteHelpOpen === 'function') setPaletteHelpOpen(false);
  const action = cmd.action;
  const p = cmd.payload || {};
  // Live layout when store is available (stale closure safety)
  const liveLayout =
    (typeof useModalStoreDep?.getState === 'function'
      ? useModalStoreDep.getState()?.layoutMode
      : null) || layoutMode;
  switch (action) {
    case 'openPullRequest': {
      const n = Number(p.number ?? cmd.number);
      if (Number.isFinite(n) && n > 0) openStackOrListPr(n);
      break;
    }
    case 'focusConversationComment':
      focusConversationCommentItem();
      break;
    case 'clearConversationCommentFocus':
      clearConversationCommentFocus();
      break;
    case 'openStackPr': {
      const n = Number(p.number);
      if (Number.isFinite(n) && n > 0) openStackOrListPr(n);
      break;
    }
    case 'navAdjacentPrev':
      navigateAdjacentPr('prev');
      break;
    case 'navAdjacentNext':
      navigateAdjacentPr('next');
      break;
    // Diff view actions (also reachable via keyboard; palette when layout=diff)
    case 'navFilePrev':
      navFile(-1);
      break;
    case 'navFileNext':
      navFile(1);
      break;
    case 'scrollDiffPagePrev':
      scrollDiffPage(-1);
      break;
    case 'scrollDiffPageNext':
      scrollDiffPage(1);
      break;
    case 'optArrowScrollSelectPrev':
      optArrowScrollSelect(-1);
      break;
    case 'optArrowScrollSelectNext':
      optArrowScrollSelect(1);
      break;
    case 'toggleViewedActiveFile':
      toggleViewedActiveFile();
      break;
    case 'toggleActiveFileCollapse':
      toggleActiveFileCollapse();
      break;
    case 'collapseActiveFile':
      setActiveFileCollapse(true);
      break;
    case 'expandActiveFile':
      setActiveFileCollapse(false);
      break;
    case 'contextThreadCollapse':
      runCtx('foldCollapse');
      break;
    case 'contextThreadExpand':
      runCtx('foldExpand');
      break;
    case 'collapseFold':
    case 'expandFold': {
      // Fallback if resolveArrowFoldAction returned generic action names
      const collapse = action === 'collapseFold';
      if (liveLayout === LAYOUT_DIFF) {
        setActiveFileCollapse?.(collapse);
      } else {
        runCtx(collapse ? 'foldCollapse' : 'foldExpand');
      }
      break;
    }

    case 'stepNavPrev':
      if (searchOpen) navSearch?.(-1);
      else if (liveLayout === LAYOUT_DIFF) navComment?.(-1);
      else navConversationComment?.(-1);
      break;
    case 'stepNavNext':
      if (searchOpen) navSearch?.(1);
      else if (liveLayout === LAYOUT_DIFF) navComment?.(1);
      else navConversationComment?.(1);
      break;
    case 'scrollConversationOptPrev':
      scrollConversationPanel(-1, false);
      break;
    case 'scrollConversationOptNext':
      scrollConversationPanel(1, false);
      break;
    case 'scrollConversationPagePrev':
      scrollConversationPanel(-1, true);
      break;
    case 'scrollConversationPageNext':
      scrollConversationPanel(1, true);
      break;
    case 'contextThreadFold':
    case 'focusedThreadFold':
      runCtx('fold');
      break;
    case 'contextThreadGotoDiff':
    case 'focusedThreadGotoDiff':
      runCtx('gotoDiff');
      break;
    case 'contextThreadComment':
    case 'focusedThreadComment':
      runCtx('comment');
      break;
    case 'contextThreadResolve':
    case 'focusedThreadResolve':
      runCtx('resolve');
      break;
    case 'toggleReviewFilterUnresolved':
      applyReviewFilterToggle('unresolved');
      break;
    case 'toggleReviewFilterResolved':
      applyReviewFilterToggle('resolved');
      break;
    case 'toggleReviewFilterPending':
      applyReviewFilterToggle('pending');
      break;
    case 'moveSelectionUp':
      applySelectionKeyboardMove(-1, false);
      break;
    case 'moveSelectionDown':
      applySelectionKeyboardMove(1, false);
      break;
    case 'extendSelectionUp':
      applySelectionKeyboardMove(-1, true);
      break;
    case 'extendSelectionDown':
      applySelectionKeyboardMove(1, true);
      break;
    case 'openSelectionComment':
      if (typeof setSelectionIslandPhase === 'function') {
        setSelectionIslandPhase('comment');
      }
      if (typeof setShowSelectionComposer === 'function') {
        setShowSelectionComposer(true);
      } else {
        openSelectionComposer?.();
      }
      break;
    case 'copySelectionCode':
      void copySelectionCode?.();
      break;
    case 'copySelectionUrl':
      void copySelectionUrl?.();
      break;
    case 'toggleDiff':
      onToggleDiff?.();
      break;
    case 'toggleSidePanel':
      toggleSidePanel?.();
      break;
    case 'openSearch':
      setSearchOpen?.(true);
      queueMicrotask(() => {
        try {
          searchInputRef?.current?.focus?.();
          searchInputRef?.current?.select?.();
        } catch {
          /* ignore */
        }
      });
      break;
    case 'toggleFullscreen':
      if (typeof onToggleShellFullscreen === 'function') {
        onToggleShellFullscreen();
      } else if (typeof toggleFullscreen === 'function') {
        toggleFullscreen();
      }
      break;
    case 'editTitle':
      if (typeof setTitleEditSignal === 'function') {
        setTitleEditSignal((n: number) => n + 1);
      } else {
        startEditTitle?.();
      }
      break;
    case 'editBody':
      if (typeof setEditingBody === 'function') {
        setEditingBody(true);
      } else {
        startEditBody?.();
      }
      break;
    case 'promptBase':
      openBasePicker();
      break;
    case 'convertDraft':
      void onSetDraftStage('draft');
      break;
    case 'readyForReview':
      void onSetDraftStage('ready');
      break;
    case 'toggleDraftStage':
      // ⌥⇧D: draft → ready, open PR → convert to draft
      void onSetDraftStage(detail?.draft ? 'ready' : 'draft');
      break;
    case 'mergePr':
      void onMergePr(p.method || 'merge');
      break;
    case 'updateBranch':
      void onUpdateBranch();
      break;
    case 'subscribe':
      void onSubscribe(true);
      break;
    case 'unsubscribe':
      void onSubscribe(false);
      break;
    case 'promptMilestone':
      void onSetMilestone(false);
      break;
    case 'clearMilestone':
      void onSetMilestone(true);
      break;
    case 'rerequestReview':
      void onRerequestReview();
      break;
    case 'promptAddReviewer':
      openReviewerPicker();
      break;
    case 'promptRemoveReviewer': {
      if (p.login) {
        void onRemoveReviewer(p.login);
        break;
      }
      const opts = (detail?.requestedReviewers || []).map((id) => ({ id, label: id }));
      if (!opts.length) {
        setActionMsg('No requested reviewers to remove.');
        break;
      }
      setPicker({
        type: 'reviewer',
        title: 'Remove reviewer',
        options: opts,
        query: '',
        allowFreeText: true,
        onPick: (opt) => {
          closePicker();
          if (opt?.id) void onRemoveReviewer(opt.id);
        },
      });
      break;
    }
    case 'removeReviewer':
      if (p.login) void onRemoveReviewer(p.login);
      break;
    case 'promptAddAssignee':
      openAssigneePicker();
      break;
    case 'promptRemoveAssignee': {
      if (p.login) {
        void onRemoveAssignee(p.login);
        break;
      }
      const opts = (detail?.assignees || []).map((id) => ({ id, label: id }));
      if (!opts.length) {
        setActionMsg('No assignees to remove.');
        break;
      }
      setPicker({
        type: 'assignee',
        title: 'Unassign',
        options: opts,
        query: '',
        allowFreeText: true,
        onPick: (opt) => {
          closePicker();
          if (opt?.id) void onRemoveAssignee(opt.id);
        },
      });
      break;
    }
    case 'removeAssignee':
      if (p.login) void onRemoveAssignee(p.login);
      break;
    case 'promptLabels':
      openLabelPicker?.();
      break;
    case 'leaveReview': {
      const kind = p.kind || 'comment';
      if (
        typeof isReviewVerdictKind === 'function' &&
        isReviewVerdictKind(kind) &&
        typeof isViewerPrAuthor === 'function' &&
        isViewerPrAuthor(detail)
      ) {
        setActionMsg?.('Cannot approve or request changes on your own pull request.');
        break;
      }
      // Finish modal already open → its capture-phase Opt chords own submit.
      // Do not fall through to one-shot submitPullReview (that skipped the modal).
      if (
        typeof document !== 'undefined' &&
        document.querySelector('[data-prp-finish-review="1"]')
      ) {
        break;
      }
      // Diff: always open Finish-your-review (never direct-submit from shortcut).
      // Read live store + DOM — render-closure layoutMode can lag behind uiRef.
      const leaveLayout =
        liveLayout ||
        uiRef?.current?.layoutMode ||
        layoutMode;
      const diffActive =
        leaveLayout === LAYOUT_DIFF ||
        (typeof document !== 'undefined' &&
          Boolean(
            document.querySelector(
              '.prp-body-panel--diff.prp-body-panel--active, .prp-modal--diff'
            )
          ));
      if (diffActive) {
        try {
          window.dispatchEvent(
            new CustomEvent('prp-open-finish-review', {
              detail: { kind },
            })
          );
        } catch {
          /* open failed — do not silent-submit */
          setActionMsg?.('Could not open Finish your review.');
        }
        break;
      }
      // Conversation Review tab / palette while not on Diff
      void onLeaveReviewAction?.(kind);
      break;
    }
    case 'closePr':
      void onClosePr();
      break;
    case 'reopenPr':
      void onReopenPr();
      break;
    case 'openGithub':
      if (detail?.htmlUrl) window.open(detail.htmlUrl, '_blank', 'noopener,noreferrer');
      break;
    case 'refreshDetail': {
      // Same entry as header IconSync / ⌥⇧G — App supplies layout-aware onRefresh
      if (typeof onRefresh === 'function') {
        void onRefresh();
        setActionMsg?.('Refreshing…');
      } else {
        setActionMsg?.('Refresh unavailable');
      }
      break;
    }
    case 'copyPrGithubLink': {
      // Same URL as header hyperlink control
      void (async () => {
        try {
          let webOrigin = detail?.webOrigin || null;
          if (!webOrigin && detail?.htmlUrl) {
            try {
              webOrigin = new URL(String(detail.htmlUrl)).origin;
            } catch {
              webOrigin = null;
            }
          }
          const url = buildGithubPrPageUrl({
            owner: detail?.owner,
            repo: detail?.repo,
            number: detail?.number,
            htmlUrl: detail?.htmlUrl,
            webOrigin,
          });
          if (!url) {
            setActionMsg?.('No PR link to copy');
            return;
          }
          try {
            (globalThis as any).__prpLastCopiedPrUrl = url;
            document.documentElement?.setAttribute?.(
              'data-prp-last-copied-pr-url',
              url
            );
          } catch {
            /* ignore */
          }
          const ok = await copyTextToClipboard(url);
          setActionMsg?.(ok ? 'PR link copied' : 'Copy failed');
          try {
            (globalThis as any).__prpLastCopyPrOk = ok;
            document.documentElement?.setAttribute?.(
              'data-prp-last-copy-pr-ok',
              ok ? '1' : '0'
            );
          } catch {
            /* ignore */
          }
        } catch (err: any) {
          setActionMsg?.(err?.message || 'Copy failed');
        }
      })();
      break;
    }
    case 'focusComment':
      focusCommentBox();
      break;
    case 'applySuggestion': {
      const fn = applyActionRef.current;
      if (typeof fn === 'function') fn();
      else setActionMsg('Hover a suggestion block first, then apply.');
      break;
    }
    case 'toggleLabel': {
      // Same write-through as aside labels — never full soft-refresh.
      if (!p.name || !detail) break;
      const names = (detail.labels || []).map((l: any) => l.name || l);
      const next = names.includes(p.name)
        ? names.filter((n: any) => n !== p.name)
        : [...names, p.name];
      void applySetLabels(next);
      break;
    }
    case 'noop':
    default:
      break;
  }
}
