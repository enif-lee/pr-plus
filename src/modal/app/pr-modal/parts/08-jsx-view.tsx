
  return (
    <div
      ref={overlayRef}
      className={`prp-overlay ${
        isEmbed ? 'prp-shell--embed' : shellClassName(shellMode)
      } ${fsCls}${
        !isEmbed && shellFullscreenHint ? ' prp-shell--fs-hint' : ''
      } ${theme.className}${closing ? ' prp-overlay--leaving' : ''} ${presentCls}`.trim()}
      tabIndex={-1}
      data-color-mode={theme.mode}
      data-presentation={isEmbed ? 'embed' : 'modal'}
      data-shell={shellMode}
      data-fullscreen={shellFullscreen ? '1' : '0'}
      data-fs-hint={shellFullscreenHint ? '1' : '0'}
      data-layout={layoutMode === LAYOUT_DIFF ? 'diff' : 'conversation'}
      data-leaving={closing ? '1' : '0'}
    >
      <OptHintsOverlayClass targetRef={overlayRef} />
      {!isEmbed ? (
        <div className="prp-backdrop" onClick={requestClose} />
      ) : null}
      <div
        className={cls}
        ref={shellRef}
        role={isEmbed ? 'region' : 'dialog'}
        aria-modal={isEmbed ? undefined : 'true'}
        aria-label={detail ? `Pull request #${detail.number}` : 'Pull request'}
        data-color-mode={theme.mode}
        data-shell={isEmbed ? 'embed' : shellMode}
        data-presentation={isEmbed ? 'embed' : 'modal'}
        data-fullscreen={isEmbed ? '0' : shellFullscreen ? '1' : '0'}
        data-sheet-width={appliedSheetWidth}
        data-modal-width={appliedModalSize.width}
        data-modal-height={appliedModalSize.height}
        style={shellSizeStyle}
      >
        {showSheetResizer ? (
          <div
            className="prp-shell-resizer prp-shell-resizer--sheet"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize side panel"
            aria-valuemin={SHEET_MIN_WIDTH}
            aria-valuemax={vwNow || undefined}
            aria-valuenow={appliedSheetWidth}
            tabIndex={0}
            onPointerDown={onSheetResizeStart}
          />
        ) : null}
        {showModalResizer ? (
          <div
            className="prp-shell-resizer prp-shell-resizer--modal"
            role="separator"
            aria-label="Resize modal panel"
            aria-valuemin={MODAL_MIN_WIDTH}
            aria-valuemax={vwNow || undefined}
            aria-orientation="horizontal"
            tabIndex={0}
            data-modal-min-h={MODAL_MIN_HEIGHT}
            data-modal-max-h={vhNow || undefined}
            onPointerDown={onModalResizeStart}
          />
        ) : null}
        <ActionToast
          key={actionMsgSeq || 0}
          message={actionMsg}
          onDismiss={() => {
            // Clear store after exit animation so the same message can re-fire
            if (useModalStore.getState().actionMsg) setActionMsg('');
          }}
        />
        <ShortcutMonitor
          enabled={open}
          isMac={isMac}
          dismissMs={SHORTCUT_MONITOR_DISMISS_MS}
        />
        <Header
          detail={detail}
          onClose={showCloseChrome ? requestClose : undefined}
          onToggleDiff={onToggleDiff}
          layoutMode={layoutMode}
          actionBusy={actionBusy}
          onClosePr={onClosePr}
          onReopenPr={onReopenPr}
          onEditTitle={onEditTitle}
          titleEditSignal={titleEditSignal}
          onChangeBase={openBasePicker}
          baseBranchRef={baseBranchRef}
          sectionLoading={isInitialLoad}
          shortcutMod={shortcutMod}
          shellMode={shellMode}
          onToggleShell={showShellToggleChrome ? onToggleShell : undefined}
          shellFullscreen={shellFullscreen}
          onToggleFullscreen={
            showFullscreenChrome ? onToggleShellFullscreen : undefined
          }
          presentation={isEmbed ? 'embed' : 'modal'}
          onRestoreNative={
            showRestoreNativeChrome ? () => onRestoreNative?.() : undefined
          }
          onSubscribe={onSubscribe}
          loadStage={loadStage}
          onActionMsg={setActionMsg}
          onRefresh={
            typeof onRefresh === 'function'
              ? () =>
                  onRefresh({
                    mode:
                      layoutMode === LAYOUT_DIFF
                        ? 'full-threads'
                        : 'visible-threads',
                    threadNodeIds:
                      layoutMode === LAYOUT_DIFF
                        ? undefined
                        : visibleConvThreadNodeIdsRef.current.slice(),
                  })
              : null
          }
        />
        <StackStrip
          items={stackItems}
          branches={stackPath.branches}
          resetKey={prIdentity}
          currentNumber={detail?.number ?? null}
          onOpenPr={(n: number) => {
            // Preserve current Diff / Conversation when hopping stacked PRs
            openStackOrListPr(n);
          }}
          onPathChange={(parentHeadRef, childNumber) => {
            setStackPathSelections((prev) => ({
              ...prev,
              [parentHeadRef]: Number(childNumber),
            }));
          }}
        />
        {/* Conversation: full-width find bar under header.
            Diff: search is inlined in DiffToolbar (replaces review filters). */}
        <SearchBar
          open={searchOpen && layoutMode !== LAYOUT_DIFF}
          query={searchQuery}
          hits={searchHits}
          hitIndex={searchHitIndex}
          inputRef={searchInputRef}
          searching={searchBusy}
          showLoadComments={showLoadComments}
          onLoadComments={onSearchLoadComments}
          loadCommentsBusy={Boolean(loadStage?.busy && loadStage?.phase === 'threads')}
          onChange={onSearchQueryCommit}
          onClose={onSearchClose}
          onNext={onSearchNext}
          onPrev={onSearchPrev}
        />
        {error ? <div className="prp-status prp-status--error">{error}</div> : null}
        {/*
          Keep-alive panels: Conversation (and Diff once detail exists) stay mounted
          so layout toggles are hide/show + opacity fade — not remount.
        */}
        <div className="prp-body-panels">
        {(detail || isInitialLoad) ? (
          <div
            className={`prp-body-panel prp-body-panel--conversation${
              layoutMode === LAYOUT_CENTERED ? ' prp-body-panel--active' : ''
            }`}
            data-active={layoutMode === LAYOUT_CENTERED ? '1' : '0'}
            aria-hidden={layoutMode !== LAYOUT_CENTERED}
          >
          <ConversationView
            presentation={isEmbed ? 'embed' : 'modal'}
            detail={
              detail
                ? {
                    ...detail,
                    files: annotatedFiles,
                    magicLinks:
                      detail.magicLinks?.length
                        ? detail.magicLinks
                        : (openPulls || []).find(
                            (p) => Number(p.number) === Number(detail.number)
                          )?.magicLinks || [],
                  }
                : null
            }
            onRegisterAsideToggle={onRegisterAsideToggle}
            onRegisterContextThreadActions={onRegisterContextThreadActions}
            mentionCandidates={mentionCandidates}
            commentText={commentText}
            setCommentText={setCommentText}
            actionBusy={actionBusy}
            actionMsg={actionMsg}
            onLeaveReviewAction={onLeaveReviewAction}
            onDiscardPending={onDiscardPendingReview}
            sectionLoading={isInitialLoad}
            onDeleteIssueComment={onDeleteIssueComment}
            onDeleteReviewComment={onDeleteReviewComment}
            onEditIssueComment={(id, body) => onSaveEditComment('issue', id, body)}
            onEditReviewComment={(id, body) => onSaveEditComment('review', id, body)}
            editingBody={editingBody}
            onStartEditBody={() => setEditingBody(true)}
            onCancelEditBody={() => setEditingBody(false)}
            onSaveBody={onSaveBody}
            editingComment={editingComment}
            onStartEditComment={(kind, id) => setEditingComment({ kind, id })}
            onCancelEditComment={() => setEditingComment(null)}
            onSaveEditComment={onSaveEditComment}
            pendingCount={totalPendingCount}
            onLoadMoreReviewThreads={onLoadMoreReviewThreads}
            onJumpToReviewThread={jumpToReviewComment}
            onVisibleThreadNodeIds={(ids: string[]) => {
              visibleConvThreadNodeIdsRef.current = Array.isArray(ids)
                ? ids
                : [];
            }}
            reverseComments={reverseComments}
            reviewThreadsMeta={detail?.reviewThreadsMeta || null}
            searchQuery={(searchQuery || '').trim()}
            searchHits={searchHits}
            searchHitIndex={searchHitIndex}
            activeSearchHit={activeSearchHit}
            onAddReviewer={openReviewerPicker}
            onRemoveReviewer={onRemoveReviewer}
            onAddAssignee={openAssigneePicker}
            onRemoveAssignee={onRemoveAssignee}
            onAddLabel={openLabelPicker}
            onRemoveLabel={onRemoveLabel}
            onApplySuggestion={onApplySuggestion}
            onRegisterApply={(fn) => {
              applyActionRef.current = fn;
            }}
            onRegisterEditorSave={(fn) => {
              editorSaveRef.current = fn;
            }}
            onSetMilestone={onSetMilestone}
            onOpenMilestonePicker={() => void openMilestonePicker()}
            onClearMilestone={() => void onSetMilestone(true)}
            onEnsureAllCommits={ensureAllCommits}
            onEnsureAllFiles={ensureAllFiles}
            commitsLoading={commitListLoading}
            filesLoading={fileListLoading}
            sidePending={sidePending}
            prTags={prTags}
            prTagsLoading={prTagsLoading}
            prTagsError={prTagsError}
            onRerequestReviewer={onRerequestReviewer}
            onMergePr={onMergePr}
            onUpdateBranch={onUpdateBranch}
            onSetDraftStage={onSetDraftStage}
            onClosePr={onClosePr}
            onReopenPr={onReopenPr}
            commentBoxRef={commentBoxRef}
            onUploadFile={onUploadFile}
            reviewerAddRef={reviewerAddRef}
            assigneeAddRef={assigneeAddRef}
            labelAddRef={labelAddRef}
            milestoneAddRef={milestoneAddRef}
            onReplyToThread={onReplyToThread}
            onResolveThread={onResolveThread}
            onOpenLinkedPr={(n: number) => openStackOrListPr(n)}
            knownPullNumbers={(Array.isArray(openPulls) ? openPulls : [])
              .map((p: any) => Number(p?.number))
              .filter((n: number) => Number.isFinite(n) && n > 0)}
            /* Keep-alive conversation panel is still mounted in Diff — never
               portal Opt hints for a hidden panel (would paint over Diff). */
          />
          </div>
        ) : null}
        {detail ? (
          <div
            className={`prp-body-panel prp-body-panel--diff${
              layoutMode === LAYOUT_DIFF ? ' prp-body-panel--active' : ''
            }`}
            data-active={layoutMode === LAYOUT_DIFF ? '1' : '0'}
            aria-hidden={layoutMode !== LAYOUT_DIFF}
          >
          <div
            className={`prp-diff-layout${
              fileNav.collapsed ? ' prp-diff-layout--nav-collapsed' : ''
            }`}
            style={
              {
                // Keep a 3-track template for any grid fallbacks; primary layout
                // is flex + animated --prp-file-nav-width (see styles.css).
                gridTemplateColumns: fileNavGridTemplate(fileNav),
                ['--prp-file-nav-width' as any]: fileNav.collapsed
                  ? '0px'
                  : `${clampFileNavWidth(fileNav.width)}px`,
                ['--prp-file-nav-resizer' as any]: fileNav.collapsed ? '0px' : '4px',
              } as React.CSSProperties
            }
            data-file-nav-collapsed={fileNav.collapsed ? '1' : '0'}
            data-file-nav-width={clampFileNavWidth(fileNav.width)}
          >
            {/*
              Nav + resizer stay mounted so width/opacity can animate. Collapse
              is purely CSS (0-width tracks / flex basis); do not unmount.
            */}
            <FolderFileTree
              files={displayFiles}
              /** Resolve-status-scoped only — not shrunk by ext/query multi-select */
              extSourceFiles={reviewScopedFiles}
              tree={fileTree}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
              activePath={activeFilePath}
              onSelect={onSelectFile}
              collapsedFiles={collapsedFiles}
              onToggleFileCollapse={onToggleFileCollapse}
              fileQuery={fileQuery}
              onFileQuery={setFileQuery}
              onSearchFocus={() => {
                void ensureAllFiles();
              }}
              filesLoading={fileListLoading}
              selectedExts={fileExtFilter}
              onSelectedExts={setFileExtFilter}
              unreadOnly={fileUnreadOnly}
              onUnreadOnly={setFileUnreadOnly}
              threadCounts={threadCounts}
              viewedPaths={viewedPaths}
              onToggleViewed={onToggleViewed}
              navCollapsed={fileNav.collapsed}
              onToggleNavCollapse={onToggleFileNavCollapse}
              fileIndex={
                typeof activeFileNavIndex === 'function'
                  ? activeFileNavIndex(displayFiles, activeFilePath)
                  : -1
              }
              fileTotal={displayFiles.length}
              onPrevFile={() => navFile(-1)}
              onNextFile={() => navFile(1)}
            />
            <div
              className="prp-file-nav-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize files navigator"
              aria-valuenow={clampFileNavWidth(fileNav.width)}
              aria-valuemin={160}
              aria-valuemax={520}
              data-collapsed={fileNav.collapsed ? '1' : '0'}
              onPointerDown={onFileNavResizeStart}
              title="Drag to resize files navigator"
            />
            <div className="prp-diff-pane">
              <DiffToolbar
                detail={detail}
                fileNavCollapsed={fileNav.collapsed}
                onToggleFileNav={onToggleFileNavCollapse}
                annotatedFileCount={displayFiles.length}
                rowCount={virtualRows.length}
                filtered={
                  Boolean(diffFilesOverride) ||
                  Boolean(diffReviewFilter) ||
                  Boolean(String(fileQuery || '').trim()) ||
                  fileExtFilter.size > 0 ||
                  fileUnreadOnly
                }
                diffMode={diffMode}
                reviewFilter={diffReviewFilter}
                onReviewFilter={setDiffReviewFilter}
                showReviewFilter={
                  hasAnyReviewThreads(threadCounts) || totalPendingCount > 0
                }
                unresolvedCount={reviewThreadTotals.unresolved}
                resolvedCount={reviewThreadTotals.resolved}
                onDiffMode={(mode: string) => {
                  setDiffMode(mode);
                  setScrollTop(0);
                  if (listRef.current) listRef.current.scrollTop = 0;
                }}
                commits={detail.commits || []}
                commitFilter={diffCommitFilter}
                onCommitFilter={applyDiffCommitFilter}
                onOpenCommitPicker={() => {
                  void ensureAllCommits();
                }}
                commitLoading={diffCommitLoading || commitListLoading}
                commitError={diffCommitError}
                commitLabel={diffCommitLabel}
                commitDisabled={!onFetchCompareFiles}
                comments={mappedComments}
                commentIndex={commentIndex}
                onPrevComment={() => navComment(-1)}
                onNextComment={() => navComment(1)}
                pendingBatch={null}
                pendingServerCount={pendingCount}
                totalPendingCount={totalPendingCount}
                onDiscardPending={onDiscardPendingReview}
                onLeaveReviewAction={onLeaveReviewAction}
                actionBusy={actionBusy}
                actionMsg={actionMsg}
                colorMode={theme.mode}
                onUploadFile={onUploadFile}
                mentionCandidates={mentionCandidates}
                linkCtx={{
                  owner: detail.owner,
                  repo: detail.repo,
                  magicLinks:
                    detail.magicLinks?.length
                      ? detail.magicLinks
                      : (openPulls || []).find(
                          (p) => Number(p.number) === Number(detail.number)
                        )?.magicLinks || [],
                }}
                searchOpen={searchOpen && layoutMode === LAYOUT_DIFF}
                searchQuery={searchQuery}
                searchHits={searchHits}
                searchHitIndex={searchHitIndex}
                searchInputRef={searchInputRef}
                searchBusy={searchBusy}
                showSearchLoadComments={showLoadComments}
                onSearchLoadComments={onSearchLoadComments}
                searchLoadCommentsBusy={Boolean(
                  loadStage?.busy && loadStage?.phase === 'threads'
                )}
                onSearchChange={onSearchQueryCommit}
                onSearchClose={onSearchClose}
                onSearchNext={onSearchNext}
                onSearchPrev={onSearchPrev}
              />
              <DiffFloatingController
                onPrevFile={() => navFile(-1)}
                onNextFile={() => navFile(1)}
                onPrevPage={() => scrollDiffPage(-1)}
                onNextPage={() => scrollDiffPage(1)}
                onGoto={(q: string) => applyGotoQuery(q)}
                isMac={
                  typeof navigator !== 'undefined' &&
                  /Mac|iPhone|iPad/.test(navigator.platform || '')
                }
              />
              <VirtualDiff
                virtualRows={virtualRows}
                /* scroll is owned inside VirtualDiff (rAF + local state).
                 * Only pass scrollTop for programmatic jumps so App never
                 * re-renders the whole modal on every wheel/pixel. */
                scrollTop={scrollTop}
                viewportHeight={viewportHeight}
                onViewportHeight={(h: number) => {
                  // Threshold avoids App re-render on scrollbar/sub-pixel noise
                  if (h > 0 && Math.abs(h - viewportHeight) >= 4) {
                    setViewportHeight(h);
                  }
                }}
                listRef={listRef}
                activeFilePath={activeFilePath}
                highlightRowIndex={
                  hit?.rowIndex ??
                  (commentIndex >= 0 ? mappedComments[commentIndex]?.rowIndex : undefined)
                }
                searchQuery={(searchQuery || '').trim()}
                searchMatchRows={searchMatchRows}
                activeSearchHit={hit}
                activeSearchOccurrence={activeSearchOccurrence}
                searchHits={searchHits}
                searchHitIndex={searchHitIndex}
                onScroll={undefined}
                onSelectionStart={onSelectionStart}
                onSelectionExtend={onSelectionExtend}
                onSelectionEnd={onSelectionEnd}
                onFileComment={onFileHeaderComment}
                onToggleCollapse={onToggleFileCollapse}
                onExpandGap={onExpandDiffGap}
                expandBusyKey={diffExpandBusyKey}
                viewedPaths={viewedPaths}
                onToggleViewed={onToggleViewed}
                threadsByCommentId={threadsByCommentId}
                onReply={onReplyToThread}
                pendingCount={totalPendingCount}
                onResolve={onResolveThread}
                onDeleteReviewComment={onDeleteReviewComment}
                onEditReviewComment={onStartEditReviewComment}
                onSaveEditReviewComment={(id, body) =>
                  onSaveEditComment('review', id, body)
                }
                onCancelEditReviewComment={() => setEditingComment(null)}
                editingCommentId={
                  editingComment?.kind === 'review' ? editingComment.id : null
                }
                onRegisterEditorSave={(fn) => {
                  editorSaveRef.current = fn;
                }}
                onApplySuggestion={onApplySuggestion}
                onRegisterApply={(fn) => {
                  applyActionRef.current = fn;
                }}
                actionBusy={actionBusy}
                viewerLogin={detail.viewerLogin}
                prOpen={detail.state === 'open'}
                linkCtx={{
                  owner: detail.owner,
                  repo: detail.repo,
                  magicLinks:
                    detail.magicLinks?.length
                      ? detail.magicLinks
                      : (openPulls || []).find(
                          (p) => Number(p.number) === Number(detail.number)
                        )?.magicLinks || [],
                }}
                onUploadFile={onUploadFile}
                mentionCandidates={mentionCandidates}
                isThreadCollapsed={isDiffCommentCollapsed}
                onToggleThreadCollapse={onToggleThreadCollapse}
                commentHeightOpts={commentHeightOpts}
                selectionIsland={
                  showSelectionComposer || selectionIslandLeaving ? (
                    <SelectionCommentBar
                      draft={selectionDraft}
                      onDraft={setSelectionDraft}
                      onSubmitImmediate={onSubmitSelectionCommentImmediate}
                      onSubmitPending={onSubmitSelectionCommentPending}
                      onCancel={() => dismissSelectionIsland()}
                      actionBusy={actionBusy}
                      leaving={selectionIslandLeaving}
                      pendingCount={totalPendingCount}
                      onUploadFile={onUploadFile}
                      mentionCandidates={mentionCandidates}
                      virtualRows={virtualRows}
                      detail={detail}
                      phase={selectionIslandPhase}
                      onPhaseChange={setSelectionIslandPhase}
                      onCopyFeedback={(msg: string) =>
                        setActionMsg(String(msg || ''))
                      }
                      linkCtx={{
                        owner: detail.owner,
                        repo: detail.repo,
                        magicLinks: detail.magicLinks || [],
                      }}
                    />
                  ) : null
                }
              />

            </div>
          </div>
          </div>
        ) : null}
        {isInitialLoad && layoutMode === LAYOUT_DIFF && !detail ? (
          <div
            className="prp-body-panel prp-body-panel--diff prp-body-panel--active"
            data-active="1"
          >
            <LoadingSkeleton variant="diff" />
          </div>
        ) : null}
        </div>
        <CommandPalette
          open={paletteOpen}
          query={paletteQuery}
          onQuery={setPaletteQuery}
          commands={paletteCommands}
          onRun={runPaletteCommand}
          onClose={() => setPaletteOpen(false)}
        />
        <ConfirmDialog
          open={Boolean(confirmState)}
          title={confirmState?.title}
          message={confirmState?.message}
          confirmLabel={confirmState?.confirmLabel}
          cancelLabel={confirmState?.cancelLabel}
          tone={confirmState?.tone}
          colorMode={theme.mode}
          onConfirm={() => closeConfirm(true)}
          onCancel={() => closeConfirm(false)}
        />
        <SearchableSelect
          open={!!picker}
          title={picker?.title}
          options={picker?.options || []}
          query={picker?.query || ''}
          onQuery={(q) => setPicker((prev) => (prev ? { ...prev, query: q } : prev))}
          onPick={(opt) => picker?.onPick?.(opt)}
          onClose={closePicker}
          allowFreeText={picker?.allowFreeText !== false}
          allowCreate={Boolean(picker?.allowCreate)}
          onCreate={
            picker?.onCreate
              ? (name: string) => picker.onCreate(name)
              : null
          }
          createBusy={Boolean(picker?.createBusy)}
          multi={Boolean(picker?.multi)}
          initialSelectedIds={picker?.initialSelectedIds || null}
          onConfirm={
            picker?.onConfirm
              ? (ids: string[]) => picker.onConfirm(ids)
              : null
          }
          confirmLabel={picker?.confirmLabel || 'Apply'}
          anchorRef={pickerAnchorRef}
          placement="bottom"
          placeholder={
            picker?.placeholder ||
            (picker?.type === 'base'
              ? 'Filter or type a branch…'
              : picker?.type === 'label'
                ? 'Filter or type labels…'
                : picker?.type === 'milestone'
                  ? 'Filter milestones or type a new title…'
                  : picker?.type === 'assignee'
                    ? 'Filter or type usernames…'
                    : 'Filter or type a username…')
          }
        />
      </div>
    </div>
  );
}


export default PrModalApp;

