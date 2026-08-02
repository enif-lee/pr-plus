// TypeScript SoT — assembled by build scripts (classic runtime JS emit)
// Narrow onPatchDetail implementation (extracted for line-budget).

  function runOnPatchDetail(patch, owner, repo, number) {
      
        const ack = (status: 'applied' | 'stale' | 'failed', error?: string) => ({
          status,
          ...(error ? { error } : null),
        });
        try {
          if (!patch || typeof patch !== 'object') {
            return ack('failed', 'invalid patch');
          }
          if (!current.open || !current.detail) {
            return ack('stale');
          }
          if (
            owner &&
            repo &&
            number &&
            (current.owner !== owner ||
              current.repo !== repo ||
              Number(current.number) !== Number(number))
          ) {
            return ack('stale');
          }

          const S = detailStoreApi();
          const touchesSupersede =
            typeof S?.patchTouchesSupersedeMeta === 'function'
              ? S.patchTouchesSupersedeMeta(patch)
              : [
                  'assignees',
                  'labels',
                  'requestedReviewers',
                  'milestone',
                  'title',
                  'body',
                  'draft',
                  'state',
                  'merged',
                  'baseRef',
                  'subscribed',
                ].some((k) => Object.prototype.hasOwnProperty.call(patch, k));
          // Meta soft-refresh supersede only — do NOT bump openGen/detailFetchGen.
          if (touchesSupersede) {
            metaRefreshGen += 1;
          }

          const next = {
            ...current.detail,
            ...patch,
            avatarUrls: {
              ...(current.detail.avatarUrls || {}),
              ...(patch.avatarUrls && typeof patch.avatarUrls === 'object'
                ? patch.avatarUrls
                : {}),
            },
            _metaSeq: 0,
          };
          if (Object.prototype.hasOwnProperty.call(patch, 'assignees')) {
            next.assignees = Array.isArray(patch.assignees)
              ? patch.assignees
              : [];
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'labels')) {
            next.labels = Array.isArray(patch.labels) ? patch.labels : [];
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'requestedReviewers')) {
            next.requestedReviewers = Array.isArray(patch.requestedReviewers)
              ? patch.requestedReviewers
              : [];
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'milestone')) {
            next.milestone = patch.milestone == null ? null : patch.milestone;
          }
          // Shield list→detail / revalidate from stale core that would flash then
          // drop the just-written labels (and peers).
          try {
            if (typeof notePeopleMetaAuthority === 'function') {
              notePeopleMetaAuthority(patch, {
                owner: current.owner,
                repo: current.repo,
                number: current.number,
              });
            }
          } catch {
            /* ignore */
          }

          if (S) {
            ensureDetailStore(next);
            // Meta from patch keys only — never re-stamp full merged detail meta.
            const metaPartial =
              typeof S.pickMeta === 'function' ? S.pickMeta(patch) : {};
            if (metaPartial && Object.keys(metaPartial).length) {
              S.applyMeta(current.detailStore, metaPartial, {
                trustEmpty: true,
                source: 'patch',
                sketch: false,
              });
            }
            if (Object.prototype.hasOwnProperty.call(patch, 'comments')) {
              S.applyComments(current.detailStore, next.comments, {
                settled: true,
                pageMeta: next.commentsMeta,
                timelineEvents: next.timelineEvents,
              });
            } else if (
              Object.prototype.hasOwnProperty.call(patch, 'timelineEvents')
            ) {
              // Meta writes (labels/milestone/…) re-fetch system events without
              // re-sending the full comments list.
              const items = Array.isArray(current.detailStore?.comments?.items)
                ? current.detailStore.comments.items
                : Array.isArray(next.comments)
                  ? next.comments
                  : [];
              S.applyComments(current.detailStore, items, {
                settled: Boolean(current.detailStore?.comments?.settled),
                pageMeta:
                  current.detailStore?.comments?.pageMeta ?? next.commentsMeta,
                timelineEvents: Array.isArray(patch.timelineEvents)
                  ? patch.timelineEvents
                  : [],
              });
            }
            if (
              Object.prototype.hasOwnProperty.call(patch, 'reviewComments') ||
              Object.prototype.hasOwnProperty.call(patch, 'reviewThreads') ||
              Object.prototype.hasOwnProperty.call(patch, 'reviewThreadsMeta') ||
              Object.prototype.hasOwnProperty.call(patch, 'reviewCommentsMeta')
            ) {
              S.applyThreadsFromMergedDetail(current.detailStore, next);
            }
            if (
              Object.prototype.hasOwnProperty.call(patch, 'viewerPendingReview')
            ) {
              S.applyPendingReview(
                current.detailStore,
                next.viewerPendingReview ?? null
              );
            }
            if (Object.prototype.hasOwnProperty.call(patch, 'reviews')) {
              S.applyReviews(current.detailStore, next.reviews, {
                settled: true,
              });
            }
            if (Object.prototype.hasOwnProperty.call(patch, 'files')) {
              S.applyFiles(current.detailStore, next.files, {
                settled: true,
                gitattributesText: next.gitattributesText,
              });
            }
            if (Object.prototype.hasOwnProperty.call(patch, 'commits')) {
              S.applyCommits(current.detailStore, next.commits, {
                settled: true,
              });
            }
            if (Object.prototype.hasOwnProperty.call(patch, 'changedFiles')) {
              S.applyMeta(
                current.detailStore,
                { changedFiles: next.changedFiles },
                { trustEmpty: true, source: 'patch', sketch: false }
              );
            }
            if (Object.prototype.hasOwnProperty.call(patch, 'commitsCount')) {
              S.applyMeta(
                current.detailStore,
                { commitsCount: next.commitsCount },
                { trustEmpty: true, source: 'patch', sketch: false }
              );
            }
            // Body emoji reactions (PR description) — write-through from App
            if (Object.prototype.hasOwnProperty.call(patch, 'bodyReactions')) {
              S.applyMeta(
                current.detailStore,
                {
                  bodyReactions: Array.isArray(patch.bodyReactions)
                    ? patch.bodyReactions
                    : [],
                },
                { trustEmpty: true, source: 'patch', sketch: false }
              );
            }
            publishDetailFromStore();
          } else {
            current.detail = next;
          }
          try {
            const key = detailKey(current.owner, current.repo, current.number);
            detailCache.set(key, current.detail);
          } catch {
            /* ignore cache */
          }
          if (
            Object.prototype.hasOwnProperty.call(patch, 'draft') ||
            Object.prototype.hasOwnProperty.call(patch, 'merged') ||
            Object.prototype.hasOwnProperty.call(patch, 'state')
          ) {
            try {
              if (typeof applyOpenPullLifecycle === 'function') {
                applyOpenPullLifecycle(
                  current.owner,
                  current.repo,
                  current.number,
                  {
                    draft: patch.draft,
                    merged: patch.merged,
                    state: patch.state,
                  }
                );
              }
            } catch {
              /* ignore */
            }
          }
          const touchesListRow =
            Object.prototype.hasOwnProperty.call(patch, 'labels') ||
            Object.prototype.hasOwnProperty.call(patch, 'title') ||
            Object.prototype.hasOwnProperty.call(patch, 'draft') ||
            Object.prototype.hasOwnProperty.call(patch, 'assignees') ||
            Object.prototype.hasOwnProperty.call(patch, 'milestone') ||
            Object.prototype.hasOwnProperty.call(patch, 'comments') ||
            Object.prototype.hasOwnProperty.call(patch, 'baseRef') ||
            Object.prototype.hasOwnProperty.call(patch, 'headRef');
          if (touchesListRow) {
            try {
              applyOpenDetailToListRow({
                number: current.number,
                detail: current.detail,
                forceLabels: Object.prototype.hasOwnProperty.call(
                  patch,
                  'labels'
                ),
              });
            } catch {
              /* ignore */
            }
          }
          render();
          return ack('applied');
        } catch (err: any) {
          return ack('failed', err?.message || String(err));
        }
      
  }

