
  function renderComposerCard() {
    return (
      <Card
        className="prp-card--composer"
        title={
          <div className="prp-composer-mode" role="tablist" aria-label="Comment or review">
            <button
              type="button"
              role="tab"
              aria-selected={composerMode === 'comment'}
              className={`prp-composer-mode__tab${
                composerMode === 'comment' ? ' prp-composer-mode__tab--active' : ''
              }`}
              onClick={() => setComposerMode('comment')}
            >
              Comment
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={composerMode === 'review'}
              className={`prp-composer-mode__tab${
                composerMode === 'review' ? ' prp-composer-mode__tab--active' : ''
              }`}
              onClick={() => setComposerMode('review')}
            >
              Review
              {pendingCount > 0 ? (
                <span className="prp-composer-mode__badge" title="Pending review items">
                  {pendingCount}
                </span>
              ) : null}
            </button>
          </div>
        }
      >
        <div className="prp-composer prp-composer--review" ref={commentBoxRef}>
          {/* Pending file threads live at the top of the Review form (not timeline) */}
          {composerMode === 'review' && pendingReviewGroup ? (
            <div
              className="prp-composer__pending-threads"
              data-pending-threads={
                Array.isArray(pendingReviewGroup.threads)
                  ? pendingReviewGroup.threads.length
                  : 0
              }
            >
              <div className="prp-composer__pending-head">
                <span className="prp-composer__pending-title">
                  Pending review
                </span>
                <Badge tone="warn" title="Not yet submitted">
                  {Array.isArray(pendingReviewGroup.threads)
                    ? pendingReviewGroup.threads.length
                    : pendingCount}{' '}
                  thread
                  {(Array.isArray(pendingReviewGroup.threads)
                    ? pendingReviewGroup.threads.length
                    : pendingCount) === 1
                    ? ''
                    : 's'}
                </Badge>
              </div>
              {pendingReviewGroup.body ? (
                <div className="prp-review-group__body prp-composer__pending-body">
                  {renderSearchableBody(
                    pendingReviewGroup.body,
                    `review:${pendingReviewGroup.id}`,
                    true
                  )}
                </div>
              ) : null}
              {renderReviewGroupThreadList(pendingReviewGroup, 'composer-', {
                compact: true,
              })}
            </div>
          ) : null}
          <MarkdownComposer
            value={commentText}
            onChange={setCommentText}
            placeholder={
              composerMode === 'review'
                ? 'Leave a review summary (optional with pending threads)…'
                : 'Write a comment…'
            }
            compact
            rows={3}
            disabled={actionBusy}
            showTabs
            onUploadFile={onUploadFile}
            linkCtx={linkCtx}
            mentionCandidates={mentionCandidates}
          />
          {composerMode === 'comment' ? (
            <div className="prp-composer__row prp-composer__row--review">
              <Button
                variant="primary"
                size="sm"
                disabled={actionBusy || !String(commentText || '').trim()}
                onClick={() => onLeaveReviewAction?.('issue-comment')}
                title="Post conversation comment"
              >
                Submit
              </Button>
              {detail.state === 'open' && !detail.merged ? (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={actionBusy}
                  onClick={onClosePr}
                  title="Close pull request"
                >
                  Close pull request
                </Button>
              ) : null}
              {detail.state === 'closed' && !detail.merged ? (
                <Button
                  size="sm"
                  variant="ok"
                  disabled={actionBusy}
                  onClick={onReopenPr}
                  title="Reopen pull request"
                >
                  Reopen
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="prp-composer__row prp-composer__row--review">
              <Button
                variant="primary"
                size="sm"
                disabled={
                  actionBusy || (!String(commentText || '').trim() && !pendingCount)
                }
                onClick={() => onLeaveReviewAction?.('comment')}
                title={
                  pendingCount > 0
                    ? 'Submit pending review as comment'
                    : 'Submit review as comment'
                }
              >
                Submit review
              </Button>
              {showReviewVerdict ? (
                <>
                  <Button
                    size="sm"
                    variant="ok"
                    disabled={actionBusy}
                    onClick={() => onLeaveReviewAction?.('approve')}
                    title="Approve pull request"
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="warn"
                    disabled={actionBusy}
                    onClick={() => onLeaveReviewAction?.('request_changes')}
                    title="Request changes"
                  >
                    Request changes
                  </Button>
                </>
              ) : null}
              {pendingCount > 0 && typeof onDiscardPending === 'function' ? (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={actionBusy}
                  onClick={() => onDiscardPending?.()}
                  title="Discard pending review"
                >
                  Discard
                </Button>
              ) : null}
            </div>
          )}

        </div>
      </Card>
    );
  }

  function renderPanelRow(row: any) {
    switch (row?.type) {
      case 'description':
        return renderDescriptionCard();
      case 'composer':
        return renderComposerCard();
      case 'merge':
        return renderMergeBox();
      case 'gap':
        return renderThreadGap(
          Number(row.hiddenCount ?? paged.hiddenCount ?? reviewThreadsMeta?.hiddenCount) ||
            0
        );
      case 'empty':
        return null;
      case 'item':
        return renderTimelineItemCard(row.item, row.keyPrefix || '');
      default:
        return null;
    }
  }

  const isFocusedThreadCollapsed = useCallback(
    (commentId: string) => {
      const found = findTimelineThreadById(commentId);
      if (!found?.thread) return false;
      if (found.reviewGroupId != null) {
        return !isGroupThreadOpen(found.reviewGroupId, found.thread);
      }
      return isReviewThreadCollapsed(found.thread);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timelineItems, groupThreadOpenOverrides, threadCollapseOverrides]
  );

  return (
    <div
      ref={convRootRef}
      className={`prp-conversation${asideCollapsed ? ' prp-conversation--aside-collapsed' : ''}${
        embedScrollChain ? ' prp-conversation--embed-scroll' : ''
      }`}
      style={
        {
          ['--prp-aside-w' as string]: `${conversationAsideWidthPx(asideCollapsed)}px`,
        } as React.CSSProperties
      }
      data-aside-collapsed={asideCollapsed ? '1' : '0'}
      data-embed-scroll={embedScrollChain ? '1' : undefined}
    >
      {/* Leaf store subscribers — do not re-render this tree on ⌥J/K or Opt-hold */}
      <ConversationKbFocusScroller onFocusThread={onKbFocusThread} />
      <ConversationKbEnterExpand
        onExpand={expandFocusedThread}
        isCollapsed={isFocusedThreadCollapsed}
      />
      <div className="prp-conversation__main">
        {sectionLoading && !detail ? (
          <LoadingSkeleton variant="conversation" />
        ) : (
          <VirtualConversationList
            paged={paged}
            reviewThreadsMeta={reviewThreadsMeta}
            canLoadMore={typeof onLoadMoreReviewThreads === 'function'}
            reverseComments={Boolean(reverseComments)}
            descriptionBody={detail.body || ''}
            isThreadCollapsed={isReviewThreadCollapsed}
            isGroupThreadExpanded={(groupItem: any, thread: any) =>
              isGroupThreadOpen(groupItem?.id, thread)
            }
            // Search hit scroll; keyboard focus uses store pendingNav in VCL
            scrollToAnchor={activeAnchor}
            renderRow={renderPanelRow}
            onVisibleThreadNodeIds={onVisibleThreadNodeIds}
          />
        )}
      </div>

      {/* Vertical splitter between main and meta; hosts compact toggle */}
      <div
        className="prp-conversation__splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="Panel splitter"
      >
        <button
          type="button"
          className="prp-aside-collapse-btn prp-has-tip prp-opt-hint-host"
          onClick={onToggleAside}
          aria-label={
            asideCollapsed ? 'Expand metadata panel' : 'Collapse metadata panel'
          }
          aria-expanded={!asideCollapsed}
        >
          <OptBtnHint label={sidePanelKbd}
            preferredPlacement="bottom"
          />
          {asideCollapsed ? (
            <IconChevronLeft size={14} aria-hidden="true" />
          ) : (
            <IconChevronRight size={14} aria-hidden="true" />
          )}
          <TipPopover
            title={
              asideCollapsed
                ? 'Expand metadata panel'
                : 'Collapse metadata panel'
            }
            shortcut={sidePanelKbd}
          />
        </button>
      </div>
      <div
        className={`prp-scroll-float-host prp-edge-fade prp-conversation__aside-host${
          asideCollapsed ? ' prp-conversation__aside-host--collapsed' : ''
        }`}
      >
      <aside
        ref={asideScrollRef}
        className={`prp-conversation__aside prp-scroll-float${
          asideCollapsed ? ' prp-conversation__aside--collapsed' : ''
        }`}
        aria-label={
          asideCollapsed
            ? 'Pull request metadata (collapsed)'
            : 'Pull request metadata'
        }
        onScroll={(e) => {
          const el = e.currentTarget;
          el.classList.add('prp-is-scrolling');
          const t = (el as any).__prpScrollHide;
          if (t) clearTimeout(t);
          (el as any).__prpScrollHide = setTimeout(() => {
            el.classList.remove('prp-is-scrolling');
          }, 700);
        }}
      >
        {asideCollapsed ? (
          <AsideCompactRail detail={detail} tags={prTags} />
        ) : (
          <>
        <MetaList
          title="Reviewers"
          rows={
            typeof buildUnifiedReviewerRows === 'function'
              ? buildUnifiedReviewerRows(detail).map((row: any) => {
                  const bot =
                    Boolean(row?.isBot) ||
                    (typeof isBotAccount === 'function'
                      ? isBotAccount(row, detail) || isBotAccount(row?.login, detail)
                      : false);
                  return {
                    ...row,
                    isBot: bot,
                    // Pending requests are already outstanding; bots never re-requestable
                    canRerequest:
                      !bot &&
                      String(row?.status || '').toUpperCase() !== 'PENDING',
                    canRemove: !bot,
                  };
                })
              : (detail.requestedReviewers || []).map((login: string) => {
                  const bot =
                    typeof isBotAccount === 'function'
                      ? isBotAccount(login, detail)
                      : /\[bot\]$/i.test(login);
                  return {
                    login,
                    status: 'PENDING',
                    isBot: bot,
                    canRerequest: false,
                    canRemove: !bot,
                  };
                })
          }
          emptyLabel="No reviewers yet"
          onAdd={canEditMeta ? onAddReviewer : null}
          onRemove={canEditMeta ? onRemoveReviewer : null}
          onRerequest={
            canEditMeta && typeof onRerequestReviewer === 'function'
              ? (login: string) => onRerequestReviewer(login)
              : null
          }
          addLabel="Add reviewer…"
          actionBusy={actionBusy}
          addButtonRef={reviewerAddRef}
          avatarUrls={detail.avatarUrls}
          
          addShortcut="⌥⇧R"
        />
        <MetaList
          title="Assignees"
          rows={(detail.assignees || []).map((login: string) => {
            const bot =
              typeof isBotAccount === 'function'
                ? isBotAccount(login, detail)
                : /\[bot\]$/i.test(String(login || ''));
            return { login, isBot: bot, canRemove: !bot };
          })}
          emptyLabel="No assignees"
          onAdd={canEditMeta ? onAddAssignee : null}
          onRemove={canEditMeta ? onRemoveAssignee : null}
          addLabel="Add assignee…"
          actionBusy={actionBusy}
          addButtonRef={assigneeAddRef}
          avatarUrls={detail.avatarUrls}
          
          addShortcut="⌥⇧A"
        />
        <AsideSection title="Labels">
          <div className="prp-label-row">
            {(detail.labels || []).length === 0 ? (
              <span className="prp-muted">No labels</span>
            ) : (
              (detail.labels || []).map((l: any) => (
                <span key={l.name || l} className="prp-label-chip">
                  <LabelLink owner={detail.owner} repo={detail.repo} label={l} />
                  {canEditMeta && onRemoveLabel ? (
                    <button
                      type="button"
                      className="prp-label-chip__remove"
                      disabled={actionBusy}
                      onClick={() => onRemoveLabel(l.name || l)}
                    >
                      ✕
                    </button>
                  ) : null}
                </span>
              ))
            )}
          </div>
          {canEditMeta && onAddLabel ? (
            <button
              type="button"
              className="prp-add-link prp-opt-hint-host"
              disabled={actionBusy}
              onClick={onAddLabel}
              ref={labelAddRef}
              title="Add label… (⌥⇧L)"
            >
              <OptBtnHint label="⌥⇧L"
                preferredPlacement="right"
              />
              Add label…
            </button>
          ) : null}
        </AsideSection>
        <AsideSection title="Projects">
          {(detail.projects || []).length ? (
            <ul className="prp-list prp-aside-projects">
              {(detail.projects || []).map((p: any) => {
                const title = String(p?.title || '').trim() || 'Project';
                const href = String(p?.url || '').trim();
                const num = p?.number != null ? Number(p.number) : null;
                return (
                  <li key={String(p?.id || title)} className="prp-aside-projects__item">
                    {href ? (
                      <a
                        className="prp-entity-link"
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        title={title}
                      >
                        {title}
                      </a>
                    ) : (
                      <span title={title}>{title}</span>
                    )}
                    {Number.isFinite(num) ? (
                      <span className="prp-muted prp-aside-projects__num">
                        #{num}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <span className="prp-muted">None yet</span>
          )}
        </AsideSection>
        <AsideSection title="Milestone">
          <div className="prp-label-row prp-milestone">
            {!detail.milestone ? (
              <span className="prp-muted prp-milestone__empty">No milestone</span>
            ) : (
              <span className="prp-label-chip prp-milestone-chip">
                <span
                  className="prp-milestone-chip__title"
                  title={`#${detail.milestone.number}`}
                >
                  {detail.milestone.title ||
                    `Milestone #${detail.milestone.number}`}
                </span>
                <span className="prp-muted prp-milestone-chip__num">
                  #{detail.milestone.number}
                </span>
                {canEditMeta && onClearMilestone ? (
                  <button
                    type="button"
                    className="prp-label-chip__remove"
                    disabled={actionBusy}
                    title="Clear milestone"
                    aria-label="Clear milestone"
                    onClick={onClearMilestone}
                  >
                    ✕
                  </button>
                ) : null}
              </span>
            )}
          </div>
          {canEditMeta && (onOpenMilestonePicker || onSetMilestone) ? (
            <button
              type="button"
              className="prp-add-link prp-opt-hint-host"
              disabled={actionBusy}
              onClick={() =>
                onOpenMilestonePicker
                  ? onOpenMilestonePicker()
                  : onSetMilestone?.(false)
              }
              ref={milestoneAddRef}
              title={`${detail.milestone ? 'Change' : 'Set'} milestone… (⌥⇧P)`}
            >
              <OptBtnHint label="⌥⇧P"
                preferredPlacement="right"
              />
              {detail.milestone ? 'Change milestone…' : 'Set milestone…'}
            </button>
          ) : null}
        </AsideSection>
        <AsideSection title="Development" loading={pendingDevelopment}>
          {(() => {
            const dev =
              Array.isArray(detail.developmentIssues) &&
              detail.developmentIssues.length
                ? detail.developmentIssues
                : (detail.linkedIssues || []).map((n: number) => ({
                    number: n,
                    title: '',
                    url: `https://github.com/${detail.owner}/${detail.repo}/issues/${n}`,
                    state: '',
                  }));
            if (!dev.length) {
              return pendingDevelopment ? null : (
                <span className="prp-muted">None yet</span>
              );
            }
            return (
              <>
                <p className="prp-muted prp-aside-dev__hint">
                  Successfully merging this pull request may close these issues.
                </p>
                <ul className="prp-aside-dev prp-aside-dev--badges" role="list">
                  {dev.map((item: any) => {
                    const num = Number(item?.number);
                    if (!Number.isFinite(num) || num <= 0) return null;
                    const title = String(item?.title || '').trim();
                    const href =
                      String(item?.url || '').trim() ||
                      `https://github.com/${detail.owner}/${detail.repo}/issues/${num}`;
                    const state = String(item?.state || '').toLowerCase();
                    const tone =
                      state === 'open'
                        ? 'open'
                        : state === 'closed'
                          ? 'muted'
                          : 'muted';
                    const label = title ? `#${num} ${title}` : `#${num}`;
                    const openMode =
                      typeof resolveDevelopmentMainOpen === 'function'
                        ? resolveDevelopmentMainOpen(item, {
                            owner: detail.owner,
                            repo: detail.repo,
                            knownPullNumbers: Array.isArray(knownPullNumbers)
                              ? knownPullNumbers
                              : [],
                          })
                        : { mode: 'navigate', number: num, href };
                    const canInModal =
                      openMode.mode === 'inModal' &&
                      typeof onOpenLinkedPr === 'function';
                    return (
                      <li key={num} className="prp-aside-dev__badge-item">
                        <div
                          className={`prp-aside-dev__badge prp-aside-dev__badge--${tone}`}
                        >
                          <a
                            className="prp-aside-dev__badge-main"
                            href={openMode.href || href}
                            title={
                              canInModal
                                ? `${label} · open in this view`
                                : label
                            }
                            onClick={(e) => {
                              if (!canInModal) return; // same-tab page navigate
                              e.preventDefault();
                              e.stopPropagation();
                              onOpenLinkedPr(Number(openMode.number || num));
                            }}
                          >
                            <span className="prp-aside-dev__badge-num">
                              #{num}
                            </span>
                            {title ? (
                              <span className="prp-aside-dev__badge-title">
                                {title}
                              </span>
                            ) : null}
                          </a>
                          <a
                            className="prp-aside-dev__badge-ext"
                            href={openMode.href || href}
                            target="_blank"
                            rel="noreferrer"
                            title="Open in new tab"
                            aria-label={`Open #${num} in new tab`}
                          >
                            <IconLinkExternal
                              size={12}
                              className="prp-aside-dev__badge-ext-icon"
                              aria-hidden="true"
                            />
                          </a>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            );
          })()}
        </AsideSection>
        {showChecks || pendingChecks ? (
          <AsideSection title="Checks" loading={pendingChecks && !showChecks}>
            {showChecks ? <ChecksPanel checks={detail.checks} /> : null}
          </AsideSection>
        ) : null}
        <AsideSection
          title={`Tags${
            Array.isArray(prTags) && prTags.length ? ` (${prTags.length})` : ''
          }`}
          collapsible
          defaultOpen={false}
          loading={
            Boolean(prTagsLoading) && !(Array.isArray(prTags) && prTags.length)
          }
        >
          <AsideTagsList
            tags={prTags || []}
            owner={detail.owner}
            repo={detail.repo}
            loading={prTagsLoading}
            error={prTagsError}
          />
        </AsideSection>
        <AsideSection
          title={`Commits${
            detail.commitsCount != null
              ? ` (${detail.commitsCount})`
              : detail.commits?.length
                ? ` (${detail.commits.length})`
                : ''
          }`}
          collapsible
          defaultOpen={false}
          loading={
            pendingCommits &&
            !(Array.isArray(detail.commits) && detail.commits.length)
          }
        >
          <AsideCommitsTimeline
            commits={detail.commits || []}
            owner={detail.owner}
            repo={detail.repo}
            mayHaveMore={mayHaveMoreCommits(detail)}
            loadingMore={commitsLoading}
            onEnsureAll={onEnsureAllCommits}
          />
        </AsideSection>
        <AsideSection
          title={`Files${
            detail.changedFiles != null
              ? ` (${detail.changedFiles})`
              : detail.files?.length
                ? ` (${detail.files.length})`
                : ''
          }`}
          collapsible
          defaultOpen={false}
          loading={
            (pendingFiles || filesLoading) &&
            !(Array.isArray(detail.files) && detail.files.length)
          }
        >
          <AsideFilesTree
            files={detail.files || []}
            mayHaveMore={mayHaveMoreFiles(detail)}
            loadingMore={filesLoading}
            onEnsureAll={onEnsureAllFiles}
          />
        </AsideSection>

          </>
        )}
      </aside>
      {/* Compact rail is too narrow for a scrollbar chrome; hide entirely. */}
      {!asideCollapsed ? (
        <FloatingScrollbar
          scrollerRef={asideScrollRef}
          contentKey="expanded"
        />
      ) : null}
      </div>
    </div>
  );
}

export const ConversationView = memo(ConversationViewImpl);
export default ConversationView;

