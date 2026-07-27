
  /** Shared pending/submitted thread list rows (file:line + expand). */
  function renderReviewGroupThreadList(
    item: any,
    keyPrefix = '',
    opts: { compact?: boolean } = {}
  ) {
    const reviewId = item.id;
    const allThreads = Array.isArray(item.threads) ? item.threads : [];
    if (!allThreads.length) {
      return opts.compact ? (
        <p className="prp-muted prp-review-group__empty prp-composer__pending-empty">
          No pending file comments yet.
        </p>
      ) : null;
    }
    return (
      <ul
        className={`prp-review-group__list${
          opts.compact ? ' prp-review-group__list--in-composer' : ''
        }`}
      >
        {allThreads.map((t: any) => {
          const open = isGroupThreadOpen(reviewId, t);
          const fileLoc = formatThreadFileLoc(t);
          const threadAnchor =
            t?.id != null ? `review-comment:${t.id}` : '';
          const baseRowClass = `prp-review-group__row${
            open ? ' prp-review-group__row--open' : ''
          }${t.resolved ? ' prp-review-group__row--resolved' : ''}${
            t.pending ? ' prp-review-group__row--pending' : ''
          }`;
          return (
            <ConversationKbFocusHost
              key={String(t.id)}
              as="li"
              anchor={threadAnchor}
              className={baseRowClass}
              focusClassName="prp-review-group__row--kb-focus"
              data-thread-focus-anchor={threadAnchor || undefined}
              data-search-anchor={threadAnchor || undefined}
            >
              <div className="prp-review-group__row-head">
                <GroupThreadFoldBtn
                  anchor={threadAnchor}
                  open={open}
                  onToggle={() => toggleGroupThread(reviewId, t)}
                  fileLoc={fileLoc || ''}
                  path={t.path}
                  pendingBadge={
                    t.pending && !opts.compact ? (
                      <Badge tone="warn" className="prp-review-group__badge">
                        Pending
                      </Badge>
                    ) : null
                  }
                  outdatedBadge={
                    t.outdated ? (
                      <Badge tone="muted" className="prp-review-group__badge">
                        Outdated
                      </Badge>
                    ) : null
                  }
                  resolvedBadge={
                    t.resolved && !t.pending ? (
                      <Badge tone="ok" className="prp-review-group__badge">
                        Resolved
                      </Badge>
                    ) : null
                  }
                />
                {typeof onJumpToReviewThread === 'function' && t.path ? (
                  <GroupThreadJumpBtn
                    anchor={threadAnchor}
                    fileLoc={fileLoc || t.path}
                    onJump={() =>
                      onJumpToReviewThread({
                        id: t.id,
                        path: t.path,
                        line: t.line,
                        startLine: t.startLine ?? t.line,
                        side: t.side || 'RIGHT',
                        outdated: Boolean(t.outdated),
                      })
                    }
                  />
                ) : null}
              </div>
              {open ? (
                <div className="prp-review-group__thread">
                  {renderReviewThreadCard(t, `${keyPrefix}g${reviewId}-`, {
                    forceExpanded: true,
                    hideOuterHeader: true,
                  })}
                </div>
              ) : null}
            </ConversationKbFocusHost>
          );
        })}
      </ul>
    );
  }

  function renderReviewGroupCard(item: any, keyPrefix = '') {
    const reviewId = item.id;
    const allThreads = Array.isArray(item.threads) ? item.threads : [];
    const state = String(item.state || 'COMMENTED').toUpperCase();
    const isPending =
      Boolean(item.pending) ||
      state === 'PENDING' ||
      allThreads.some((t: any) => t.pending);
    // Pending groups are shown inside the Review composer — never the timeline
    if (isPending) return null;
    const stateLabel =
      state === 'APPROVED'
        ? 'approved'
        : state === 'CHANGES_REQUESTED'
          ? 'requested changes'
          : 'left a comment';
    const groupAnchor = `review-group:${reviewId}`;
    const baseClass = searchCardClass(
      groupAnchor,
      'prp-card--timeline prp-card--timeline-review-group'
    );

    return (
      <ConversationKbFocusClassName
        key={`${keyPrefix}${String(item.key || item.id)}`}
        anchor={groupAnchor}
        baseClass={baseClass}
      >
        {(className, focused) => (
          <Card
            className={className}
            data-search-anchor={groupAnchor}
            tabIndex={focused ? -1 : undefined}
          >
            <div className="prp-conversation-feed__meta">
              <Avatar login={item.author} avatarUrl={item.avatarUrl} size="md" />
              <strong>
                <UserLink login={item.author || 'user'} />
              </strong>
              {item.isBot ? <Badge tone="muted">Bot</Badge> : null}
              <span className="prp-muted prp-review-group__action">{stateLabel}</span>
              {item.at ? (
                <span className="prp-muted">{formatWhen(item.at)}</span>
              ) : null}
            </div>
            {item.body ? (
              <div className="prp-review-group__body">
                {renderSearchableBody(item.body, `review:${reviewId}`, true)}
              </div>
            ) : null}
            {renderReviewGroupThreadList(item, keyPrefix)}
          </Card>
        )}
      </ConversationKbFocusClassName>
    );
  }

  function renderTimelineItemCard(item: any, keyPrefix = '') {
    const isIssue = item.kind === 'issue-comment';
    const isReviewThread =
      item.kind === 'review-thread' || item.kind === 'review-comment';
    const isReviewGroup = item.kind === 'review-group';
    const isReviewEvent = item.kind === 'review';
    const editKind = isIssue ? 'issue' : isReviewThread ? 'review' : null;

    if (isReviewGroup) {
      return renderReviewGroupCard(item, keyPrefix);
    }
    if (isReviewThread) {
      return renderReviewThreadCard(item, keyPrefix);
    }

    const itemAnchor = isIssue
      ? `issue-comment:${item.id}`
      : isReviewEvent
        ? `review:${item.id}`
        : `item:${item.id}`;
    const baseClass = searchCardClass(
      itemAnchor,
      `prp-card--timeline prp-card--timeline-${item.kind || 'item'}`
    );
    return (
      <ConversationKbFocusClassName
        key={`${keyPrefix}${String(item.id || item.key)}`}
        anchor={itemAnchor}
        baseClass={baseClass}
      >
        {(className, focused) => (
          <Card
            className={className}
            data-search-anchor={itemAnchor}
            tabIndex={focused ? -1 : undefined}
          >
            <div className="prp-conversation-feed__meta">
              <Avatar login={item.author} avatarUrl={item.avatarUrl} size="md" />
              <strong>
                <UserLink login={item.author || 'user'} />
              </strong>
              <Badge tone="muted">{kindLabelFor(item.kind || 'item')}</Badge>
              {item.state ? (
                <Badge tone={String(item.state).toLowerCase()}>{item.state}</Badge>
              ) : null}
              {item.at ? (
                <span className="prp-muted">{formatWhen(item.at)}</span>
              ) : null}
              {commentActions(editKind, item.id, Boolean(item.canDelete), item.body)}
            </div>
            {editKind ? (
              renderTimelineBody(item, editKind, itemAnchor)
            ) : (
              renderSearchableBody(item.body || '', itemAnchor, true)
            )}
          </Card>
        )}
      </ConversationKbFocusClassName>
    );
  }

  /**
   * Classic dual-window fold: "N hidden items · Load more… · Load all"
   * (same chrome for mid-list dual-window and end-of-list single window).
   */
  function renderThreadGap(hiddenCount: number) {
    if (typeof onLoadMoreReviewThreads !== 'function') return null;
    const n = Number(hiddenCount) || 0;
    return (
      <div className="prp-timeline-gap" role="region" aria-label="Hidden review threads">
        <div className="prp-timeline-gap__line" aria-hidden="true" />
        <div className="prp-timeline-gap__body">
          <span className="prp-timeline-gap__count">
            {n > 0 ? `${n} hidden items` : 'More review threads'}
          </span>
          <div className="prp-timeline-gap__actions">
            <button
              type="button"
              className="prp-timeline-gap__load"
              disabled={actionBusy}
              onClick={() => void onLoadMoreReviewThreads?.()}
              title="Load more review threads between newest and oldest"
            >
              Load more…
            </button>
            <button
              type="button"
              className="prp-timeline-gap__load"
              disabled={actionBusy}
              onClick={() => void onLoadMoreReviewThreads?.('all')}
              title="Load every remaining review thread"
            >
              Load all
            </button>
          </div>
        </div>
        <div className="prp-timeline-gap__line" aria-hidden="true" />
      </div>
    );
  }

  function formatThreadFileLoc(t: any) {
    if (!t?.path) return '';
    if (
      t.startLine != null &&
      t.line != null &&
      t.startLine !== t.line
    ) {
      return `${t.path}:${t.startLine}–${t.line}`;
    }
    if (t.line != null) return `${t.path}:${t.line}`;
    return t.path;
  }

  function renderReviewThreadCard(
    item: any,
    keyPrefix = '',
    opts: { forceExpanded?: boolean; hideOuterHeader?: boolean } = {}
  ) {
    const threadId = item.id;
    const rootAnchor = `review-comment:${threadId}`;
    const reviewReplies = (item.replies || []).map((r: any) => ({
      ...r,
      createdAt: r.createdAt || r.at || null,
    }));
    const threadHit =
      isAnchorHit(rootAnchor) ||
      reviewReplies.some((r: any) => isAnchorHit(`review-comment:${r.id}`));
    const threadCurrent =
      isAnchorCurrent(rootAnchor) ||
      reviewReplies.some((r: any) => isAnchorCurrent(`review-comment:${r.id}`));
    // Inside a review-group path row, expand always (row chevron is the control)
    const collapsed = opts.forceExpanded
      ? false
      : isReviewThreadCollapsed(item);
    const fileLoc = formatThreadFileLoc(item);
    // Group already has path row; standalone needs conversation-level header
    const showOuterHeader = !opts.hideOuterHeader && !opts.forceExpanded;

    // Same shape Diff VirtualDiff passes into InlineThread
    const row = {
      commentId: item.id,
      author: item.author,
      avatarUrl: item.avatarUrl,
      body: item.body,
      filePath: item.path,
      newLine: item.line,
      startLine: item.startLine ?? item.line,
      side: item.side || 'RIGHT',
      threadNodeId: item.threadNodeId || null,
      resolved: Boolean(item.resolved),
      outdated: Boolean(item.outdated),
      pending: Boolean(item.pending),
      createdAt: item.at || item.createdAt || null,
    };
    const thread = {
      id: item.id,
      root: {
        id: item.id,
        author: item.author,
        avatarUrl: item.avatarUrl,
        body: item.body,
        path: item.path,
        line: item.line,
        startLine: item.startLine ?? item.line,
        side: item.side || 'RIGHT',
        createdAt: item.at || item.createdAt || null,
        pending: Boolean(item.pending),
        outdated: Boolean(item.outdated),
        resolved: Boolean(item.resolved),
        threadNodeId: item.threadNodeId || null,
      },
      replies: reviewReplies,
      threadNodeId: item.threadNodeId || null,
      resolved: Boolean(item.resolved),
      outdated: Boolean(item.outdated),
      pending: Boolean(item.pending),
    };

    const threadBaseClass = `prp-card prp-card--timeline prp-card--timeline-review-thread prp-conversation-inline-thread${
      collapsed ? ' prp-card--timeline-review-thread--collapsed' : ''
    }${threadHit ? ' prp-card--search-match' : ''}${
      threadCurrent ? ' prp-card--search-current' : ''
    }`;

    return (
      <ConversationKbFocusClassName
        key={`${keyPrefix}${String(item.id || item.key)}`}
        anchor={rootAnchor}
        baseClass={threadBaseClass}
      >
        {(className, focused) => (
      <div
        className={className}
        data-search-anchor={rootAnchor}
        data-thread-focus-anchor={rootAnchor}
        tabIndex={focused ? -1 : undefined}
      >
        {showOuterHeader ? (
          <div className="prp-conversation-thread-header">
            <button
              type="button"
              className={`prp-conversation-thread-header__toggle${
                focused ? ' prp-opt-hint-host' : ''
              }`}
              onClick={() => toggleThreadCollapse(item)}
              aria-expanded={!collapsed}
              title={
                focused
                  ? collapsed
                    ? 'Expand thread (⌥F)'
                    : 'Collapse thread (⌥F)'
                  : collapsed
                    ? 'Expand thread'
                    : 'Collapse thread'
              }
              aria-label={collapsed ? 'Expand thread' : 'Collapse thread'}
            >
              {focused ? (
                <OptBtnHint label="⌥F" preferredPlacement="top" />
              ) : null}
              <span className="prp-conversation-thread-header__chev" aria-hidden="true">
                <IconDisclosure open={!collapsed} size={16} />
              </span>
              <span
                className="prp-mono prp-conversation-thread-header__path"
                title={fileLoc || item.path || ''}
              >
                {fileLoc || item.path || 'thread'}
              </span>
              {item.pending ? (
                <Badge tone="warn">Pending</Badge>
              ) : null}
              {item.outdated ? (
                <Badge tone="muted">Outdated</Badge>
              ) : null}
              {item.resolved ? <Badge tone="ok">Resolved</Badge> : null}
            </button>
            {typeof onJumpToReviewThread === 'function' && item.path ? (
              <button
                type="button"
                className={`prp-icon-btn prp-conversation-thread-header__jump${
                  focused ? ' prp-opt-hint-host' : ''
                }`}
                title={
                  focused
                    ? `View in Diff · ${fileLoc || item.path} (⌥D)`
                    : `View in Diff · ${fileLoc || item.path}`
                }
                aria-label={`View ${fileLoc || item.path} in Diff`}
                onClick={() =>
                  onJumpToReviewThread({
                    id: item.id,
                    path: item.path,
                    line: item.line,
                    startLine: item.startLine ?? item.line,
                    side: item.side || 'RIGHT',
                    outdated: Boolean(item.outdated),
                  })
                }
              >
                {focused ? (
                  <OptBtnHint label="⌥D" preferredPlacement="top" />
                ) : null}
                <IconFileDiff size={16} />
              </button>
            ) : null}
          </div>
        ) : null}
        <InlineThread
          className="prp-inline-thread--conversation"
          row={row}
          thread={thread}
          onReply={(th: any, opts: any) =>
            onReplyToThread?.(
              {
                id: threadId,
                path: item.path,
                line: item.line,
                side: item.side || 'RIGHT',
                threadNodeId: item.threadNodeId || null,
                root: item,
              },
              opts
            )
          }
          onResolve={onResolveThread}
          onDelete={(id: any) => onDeleteReviewComment?.(id)}
          onEdit={(id: any, body: string) =>
            onStartEditComment?.('review', id, body)
          }
          onSaveEdit={(id: any, body: string) =>
            onSaveEditComment?.('review', id, body)
          }
          onCancelEdit={onCancelEditComment}
          editingCommentId={
            editingComment?.kind === 'review' ? editingComment.id : null
          }
          onRegisterEditorSave={onRegisterEditorSave}
          onApplySuggestion={onApplySuggestion}
          onRegisterApply={onRegisterApply}
          actionBusy={actionBusy}
          viewerLogin={detail.viewerLogin}
          prOpen={detail.state === 'open'}
          linkCtx={linkCtx}
          onUploadFile={onUploadFile}
          mentionCandidates={mentionCandidates}
          collapsed={collapsed}
          onToggleCollapse={() => toggleThreadCollapse(item)}
          pendingCount={pendingCount}
          searchQuery={qSearch}
          activeSearchHit={activeSearchHit}
          searchHits={searchHits}
          searchHitIndex={searchHitIndex}
          showFileHeader={false}
          showHunk
          snippet={item.snippet || null}
        />
      </div>
        )}
      </ConversationKbFocusClassName>
    );
  }

  function renderDescriptionCard() {
    return (
      <Card
        title="Description"
        className={searchCardClass('body', 'prp-card--desc')}
        data-search-anchor="body"
        actions={
          !sectionLoading && !editingBody ? (
            <button
              type="button"
              className="prp-icon-btn"
              disabled={actionBusy}
              title="Edit description"
              aria-label="Edit description"
              onClick={onStartEditBody}
            >
              <IconPencil size={13} />
            </button>
          ) : null
        }
      >
        {editingBody ? (
          <BodyEditor
            value={detail.body || ''}
            actionBusy={actionBusy}
            onSave={onSaveBody}
            onCancel={onCancelEditBody}
            onRegisterSave={onRegisterEditorSave}
            onUploadFile={onUploadFile}
            linkCtx={linkCtx}
            mentionCandidates={mentionCandidates}
          />
        ) : (
          renderSearchableBody(
            detail.body || '_No description provided._',
            'body',
            false
          )
        )}
      </Card>
    );
  }

  function renderMergeBox() {
    const conflictFiles = Array.isArray(ms.conflictFiles) ? ms.conflictFiles : [];
    const resolveUrl = ms.resolveConflictsUrl || null;

    return (
      <div
        className={`prp-merge-box prp-merge-box--${boxTone}`}
        data-merge-kind={ms.kind}
        role="region"
        aria-label="Merge status"
      >
        <div className="prp-merge-box__status-block">
          <span
            className={`prp-merge-box__icon prp-merge-box__icon--${ms.tone}`}
            aria-hidden="true"
          >
            <IconMergeStatus kind={ms.kind} size={16} />
          </span>
          <div className="prp-merge-box__copy">
            <h3 className="prp-merge-box__headline">{ms.headline}</h3>
            <p className="prp-merge-box__helper">
              {ms.kind === 'conflicts' ? (
                <>
                  Use the{' '}
                  {resolveUrl ? (
                    <a
                      href={resolveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      web editor
                    </a>
                  ) : (
                    'web editor'
                  )}{' '}
                  or the command line to resolve conflicts before continuing.
                </>
              ) : (
                ms.helper
              )}
            </p>
          </div>
          {ms.showResolveConflicts && resolveUrl ? (
            <a
              className="prp-btn prp-btn--default prp-merge-box__resolve"
              href={resolveUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Resolve conflicts
            </a>
          ) : null}
        </div>

        {ms.kind === 'conflicts' && conflictFiles.length > 0 ? (
          <ul className="prp-merge-box__conflict-files" aria-label="Conflicting files">
            {conflictFiles.map((path: string) => (
              <li key={path} className="prp-merge-box__conflict-file">
                <IconFileDiff size={14} aria-hidden="true" />
                <span className="prp-merge-box__conflict-path" title={path}>
                  {path}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {hasChecksData(detail.checks) ? (
          <MergeBoxChecks checks={detail.checks} />
        ) : ms.checksLine ? (
          <p className="prp-merge-box__checks-line prp-muted">{ms.checksLine}</p>
        ) : null}

        {detail.state === 'open' && !detail.merged ? (
          <div className="prp-merge-box__actions">
            {ms.showMerge ? (
              <div
                className={`prp-merge-method prp-merge-method--${ms.ctaVariant || 'default'}${
                  ms.forceMerge ? ' prp-merge-method--force' : ''
                }`}
                ref={mergeMenuRef}
                data-cta-variant={ms.ctaVariant || 'default'}
                data-force-merge={ms.forceMerge ? '1' : '0'}
                data-can-merge={ms.canMerge ? '1' : '0'}
              >
                <div className="prp-merge-method__split prp-opt-hint-host">
                  <OptBtnHint label="⌥⇧M" />
                  <Button
                    className={`prp-merge-method__primary prp-merge-method__primary--${
                      ms.ctaVariant || 'default'
                    }`}
                    variant={ms.ctaVariant || (ms.canMerge ? 'ok' : 'default')}
                    disabled={actionBusy || !ms.canMerge}
                    onClick={() => onMergePr?.(normalizeMergeMethod(mergeMethod))}
                    title={
                      ms.forceMerge
                        ? 'Force merge — bypasses failing checks / branch protection if your token has permission'
                        : MERGE_METHODS.find((m) => m.id === mergeMethod)?.description ||
                          'Merge pull request'
                    }
                    shortcut="⌥⇧M"
                  >
                    {mergeMethodButtonLabel(mergeMethod, {
                      force: Boolean(ms.forceMerge),
                    })}
                  </Button>
                  <button
                    type="button"
                    className={`prp-merge-method__caret prp-merge-method__caret--${
                      ms.ctaVariant || 'default'
                    }`}
                    disabled={actionBusy || !ms.canMerge}
                    aria-haspopup="menu"
                    aria-expanded={mergeMenuOpen}
                    aria-label="Select merge method"
                    title="Select merge method"
                    onClick={() => setMergeMenuOpen((o) => !o)}
                  >
                    ▾
                  </button>
                </div>
                {mergeMenuOpen ? (
                  <ul className="prp-merge-method__menu" role="menu">
                    {MERGE_METHODS.map((m) => (
                      <li key={m.id} role="none">
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={mergeMethod === m.id}
                          className={`prp-merge-method__item${
                            mergeMethod === m.id ? ' prp-merge-method__item--active' : ''
                          }`}
                          onClick={() => {
                            setMergeMethod(m.id);
                            setMergeMenuOpen(false);
                          }}
                        >
                          <span className="prp-merge-method__item-label">{m.label}</span>
                          <span className="prp-merge-method__item-desc prp-muted">
                            {m.description}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {ms.showUpdateBranch ? (
              <span className="prp-opt-hint-host">
                <OptBtnHint label="⌥⇧U" />
                <Button size="sm" disabled={actionBusy} onClick={onUpdateBranch} shortcut="⌥⇧U">
                  Update branch
                </Button>
              </span>
            ) : null}

            {ms.draftToggle === 'ready' ? (
              <span className="prp-opt-hint-host">
                <OptBtnHint label="⌥⇧D" />
                <Button
                  size="sm"
                  variant="primary"
                  disabled={actionBusy}
                  onClick={() => onSetDraftStage?.('ready')}
                  shortcut="⌥⇧D"
                >
                  Ready for review
                </Button>
              </span>
            ) : null}
            {ms.draftToggle === 'draft' ? (
              <span className="prp-opt-hint-host">
                <OptBtnHint label="⌥⇧D" />
                <Button
                  size="sm"
                  disabled={actionBusy}
                  onClick={() => onSetDraftStage?.('draft')}
                  shortcut="⌥⇧D"
                >
                  Convert to draft
                </Button>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }
