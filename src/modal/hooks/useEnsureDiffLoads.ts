// @ts-nocheck
import { useCallback, useEffect } from 'react';
import {
  filterTagsByCommitShas,
  getRepoTagsCache,
  isRepoTagsCacheFresh,
  mergeNewestFirstTagPage,
  setRepoTagsCache,
} from '../lib/tags-cache';
import { filesListNeedsFullFetch } from '../lib/detail-idb';
import {
  compareCacheKey,
  isAllCommitsFilter,
  normalizeDiffCommitFilter,
  resolveCompareRange,
} from '../lib/diff-commit-filter';
import { useDetailUiStore } from '../store/detail-ui-store';
import { formatMessage } from '../lib/i18n';
import { LAYOUT_DIFF } from '../lib/layout-mode';

export function useEnsureDiffLoads(b: any) {
  const {
    detail, prTags, prIdentity, tagsLoadedForKeyRef, tagsLoadGenRef,
    setPrTags, setPrTagsError, setPrTagsLoading,
    commitsFullyLoadedRef, commitsFlightRef, commitsFlightSeqRef,
    setCommitListLoading, onFetchAllPrCommits, onFetchAllPrFiles,
    onFetchCompareFiles, applyDomainDetailToHost, onPatchDetail,
    filesFullyLoadedRef, filesFlightRef, filesFlightSeqRef,
    setFileListLoading, diffFilesOverride, setDiffFilesOverride,
    setDiffCommitFilter, setDiffCommitError, setDiffCommitLabel,
    setDiffCommitLoading, compareFilesCacheRef, compareFetchGenRef,
    setScrollTop, listRef, annotatedFiles,
    appLocale, layoutMode,
  } = b;
  const patchHostDetail = b.patchHostDetail || applyDomainDetailToHost;

const ensurePrTags = useCallback(async () => {
  if (!detail?.owner || !detail?.repo) return;
  const api = globalThis.PRTreeFetch;
  const shas = [
    detail.headSha,
    ...((detail.commits || []).map((c: any) => c?.sha).filter(Boolean) as string[]),
  ];
  const uniq = [
    ...new Set(shas.map((s) => String(s).trim()).filter(Boolean)),
  ];
  const cacheKey = `${String(detail.owner).toLowerCase()}/${String(
    detail.repo
  ).toLowerCase()}#${detail.number || ''}:${detail.headSha || ''}:${uniq.length}`;
  if (tagsLoadedForKeyRef.current === cacheKey && Array.isArray(prTags)) {
    return;
  }

  const applyFiltered = (all: RepoTag[]) => {
    const filtered = filterTagsByCommitShas(all, uniq);
    setPrTags(filtered);
    setPrTagsError(null);
    tagsLoadedForKeyRef.current = cacheKey;
  };

  // Fresh repo cache → filter client-side only
  const cached = getRepoTagsCache(detail.owner, detail.repo);
  if (isRepoTagsCacheFresh(cached) && cached) {
    applyFiltered(cached.tags);
    return;
  }

  if (typeof api?.fetchRepoTags !== 'function' && typeof api?.fetchTagsForCommits !== 'function') {
    setPrTags([]);
    return;
  }

  const gen = ++tagsLoadGenRef.current;
  setPrTagsLoading(true);
  setPrTagsError(null);
  try {
    // Prefer full repo list into cache (newest-first pages); then filter.
    if (typeof api.fetchRepoTags === 'function') {
      let entry = cached;
      let page = 1;
      const pageSize = 100;
      let needMore = true;
      let guard = 0;
      while (needMore && guard < 10) {
        guard += 1;
        // fetchRepoTags loads up to maxPages in one call — use maxPages:1
        // per iteration only if API supports; otherwise one multi-page call.
        if (page === 1 && !entry) {
          const all = await api.fetchRepoTags(detail.owner, detail.repo, {
            maxPages: 10,
          });
          if (gen !== tagsLoadGenRef.current) return;
          const list = (Array.isArray(all) ? all : []).map((t: any) => ({
            name: String(t?.name || ''),
            sha: String(t?.sha || t?.commit?.sha || ''),
            zipballUrl: t?.zipballUrl || t?.zipball_url || '',
            tarballUrl: t?.tarballUrl || t?.tarball_url || '',
          }));
          const merged = mergeNewestFirstTagPage(null, list, {
            pageSize,
            pageIndex: 1,
          });
          // fetchRepoTags already walked pages — mark complete
          entry = {
            ...merged.entry,
            pagesLoaded: Math.max(
              1,
              Math.ceil(list.length / pageSize) || 1
            ),
            complete: true,
          };
          setRepoTagsCache(detail.owner, detail.repo, entry);
          needMore = false;
        } else {
          needMore = false;
        }
      }
      if (gen !== tagsLoadGenRef.current) return;
      applyFiltered(entry?.tags || []);
    } else if (typeof api.fetchTagsForCommits === 'function') {
      const tags = await api.fetchTagsForCommits(
        detail.owner,
        detail.repo,
        uniq
      );
      if (gen !== tagsLoadGenRef.current) return;
      setPrTags(Array.isArray(tags) ? tags : []);
      setPrTagsError(null);
      tagsLoadedForKeyRef.current = cacheKey;
    }
  } catch (err: any) {
    if (gen !== tagsLoadGenRef.current) return;
    const msg = err?.message || String(err);
    if (/unknown type:\s*PR_TREE_FETCH_TAGS/i.test(msg)) {
      setPrTags([]);
      setPrTagsError(null);
      try {
        console.warn(
          '[pr+] Tags require reloading the extension (chrome://extensions → pr+ → Reload).',
          msg
        );
      } catch {
        /* ignore */
      }
    } else {
      setPrTagsError(msg);
      setPrTags([]);
    }
  } finally {
    if (gen === tagsLoadGenRef.current) setPrTagsLoading(false);
  }
}, [detail?.owner, detail?.repo, detail?.number, detail?.headSha, detail?.commits]);

useEffect(() => {
  tagsLoadedForKeyRef.current = '';
  tagsLoadGenRef.current += 1;
}, [prIdentity]);

const ensureAllCommits = useCallback(async () => {
  if (!detail || typeof onFetchAllPrCommits !== 'function') return;
  if (commitsFullyLoadedRef.current || commitsFlightRef.current) return;
  // Have a complete list already — nothing to fetch.
  if (Array.isArray(detail.commits) && detail.commits.length > 0) {
    const total = Number(detail.commitsCount);
    if (!Number.isFinite(total) || total <= detail.commits.length) {
      commitsFullyLoadedRef.current = true;
      return;
    }
    // Partial list (mayHaveMore) — fall through to full fetch.
  }
  const identity = prIdentity;
  const flight = ++commitsFlightSeqRef.current;
  commitsFlightRef.current = flight;
  setCommitListLoading(true);
  try {
    const all = await onFetchAllPrCommits();
    if (prIdentity !== identity || commitsFlightRef.current !== flight) {
      return; // stale flight
    }
    if (!Array.isArray(all)) return;
    // Empty success is authoritative settled empty (count 0 when no rows).
    const coreTotal = Number(detail.commitsCount);
    if (
      all.length === 0 &&
      Number.isFinite(coreTotal) &&
      coreTotal > 0
    ) {
      // Inconsistency — keep prior, do not claim settled empty
      return;
    }
    commitsFullyLoadedRef.current = true;
    const count = all.length;
    applyDomainDetailToHost((prev: any) =>
      prev
        ? {
            ...prev,
            commits: all,
            commitsCount: count,
            _sideSettled: { ...(prev._sideSettled || {}), commits: true },
          }
        : prev
    );
    void patchHostDetail({ commits: all, commitsCount: count });
  } catch (err: any) {
    if (prIdentity === identity && commitsFlightRef.current === flight) {
      setDiffCommitError(err?.message || String(err));
    }
  } finally {
    if (commitsFlightRef.current === flight) {
      commitsFlightRef.current = 0;
    }
    setCommitListLoading(false);
  }
}, [detail, onFetchAllPrCommits, onPatchDetail, prIdentity]);

const ensureAllFiles = useCallback(async () => {
  if (!detail || typeof onFetchAllPrFiles !== 'function') return;
  if (filesFlightRef.current) return;
  // Don't clobber a commit-range override with full PR files mid-filter.
  if (diffFilesOverride) {
    filesFullyLoadedRef.current = true;
    return;
  }
  // Re-fetch only for empty / incomplete count / slim IDB (`_patchOmitted`).
  // Do NOT treat GitHub-omitted large-file patches as incomplete — re-fetch
  // never restores them and caused infinite "Loading all files…" on big PRs.
  const needsFetch = filesListNeedsFullFetch(
    detail.files,
    detail.changedFiles
  );
  if (!needsFetch) {
    filesFullyLoadedRef.current = true;
    return;
  }
  // Slim wipe or incomplete list — clear latch and fetch.
  filesFullyLoadedRef.current = false;
  const identity = prIdentity;
  const flight = ++filesFlightSeqRef.current;
  filesFlightRef.current = flight;
  setFileListLoading(true);
  // Header progress pill (detail-ui-store) — open host bar does not track
  // Diff-entry full file fetch; surface busy label + soft percent here.
  const ui = useDetailUiStore.getState();
  const expected = Number(detail.changedFiles);
  const startLabel =
    Number.isFinite(expected) && expected > 0
      ? formatMessage('progress_loading_files_n', appLocale, {
          loaded: 0,
          total: Math.min(Math.floor(expected), 999),
        })
      : formatMessage('progress_loading_all_files', appLocale);
  ui.setLoadStage({ busy: true, label: startLabel, percent: 18 });
  // Soft mid progress while REST pages walk (no per-page callbacks yet).
  const midTimer =
    typeof window !== 'undefined'
      ? window.setTimeout(() => {
          if (filesFlightRef.current !== flight) return;
          useDetailUiStore.getState().setLoadStage({
            busy: true,
            label:
              Number.isFinite(expected) && expected > 0
                ? formatMessage('progress_loading_files', appLocale)
                : formatMessage('progress_loading_all_files', appLocale),
            percent: 58,
          });
        }, 400)
      : null;
  try {
    const all = await onFetchAllPrFiles({
      gitattributesText: detail.gitattributesText || '',
    });
    if (prIdentity !== identity || filesFlightRef.current !== flight) {
      return; // stale flight
    }
    if (!Array.isArray(all)) return;
    const coreTotal = Number(detail.changedFiles);
    if (
      all.length === 0 &&
      Number.isFinite(coreTotal) &&
      coreTotal > 0
    ) {
      // Inconsistency — keep prior, do not claim settled empty
      return;
    }
    // Full REST page is authoritative even if some patches are omitted by GitHub.
    filesFullyLoadedRef.current = true;
    const count = all.length;
    applyDomainDetailToHost((prev: any) =>
      prev
        ? {
            ...prev,
            files: all,
            changedFiles: count,
            _sideSettled: { ...(prev._sideSettled || {}), files: true },
          }
        : prev
    );
    void patchHostDetail({
      files: all,
      changedFiles: count,
      ...(detail.gitattributesText
        ? { gitattributesText: detail.gitattributesText }
        : null),
    });
    useDetailUiStore.getState().setLoadStage({
      busy: true,
      label:
        count > 0
          ? formatMessage('progress_loading_files_n', appLocale, {
              loaded: Math.min(count, 999),
              total: Math.min(count, 999),
            })
          : formatMessage('progress_files_ready', appLocale),
      percent: 96,
    });
  } catch {
    /* soft-fail: keep partial file list; do not invent settled empty */
  } finally {
    if (midTimer != null) {
      try {
        window.clearTimeout(midTimer);
      } catch {
        /* ignore */
      }
    }
    const stillMine = filesFlightRef.current === flight;
    if (stillMine) {
      filesFlightRef.current = 0;
    }
    setFileListLoading(false);
    // Only settle the header bar when this flight still owns the slot
    // (a newer ensureAllFiles would have a higher flight id).
    if (stillMine) {
      useDetailUiStore.getState().setLoadStage({
        busy: false,
        label: null,
        percent: 100,
      });
      if (typeof window !== 'undefined') {
        const settledFlight = flight;
        window.setTimeout(() => {
          // Newer flight in progress — leave its stage alone.
          if (filesFlightRef.current !== 0) return;
          if (filesFlightSeqRef.current !== settledFlight) return;
          useDetailUiStore.getState().clearLoadStage();
        }, 280);
      } else {
        useDetailUiStore.getState().clearLoadStage();
      }
    }
  }
}, [
  detail,
  onFetchAllPrFiles,
  onPatchDetail,
  diffFilesOverride,
  prIdentity,
  appLocale,
]);

// Diff: re-fetch when empty, incomplete count, or slim IDB — not when GitHub
// already omitted some large-file patches after a full page.
useEffect(() => {
  if (layoutMode !== LAYOUT_DIFF) return;
  if (diffFilesOverride) return;
  if (!filesListNeedsFullFetch(detail?.files, detail?.changedFiles)) return;
  void ensureAllFiles();
}, [layoutMode, detail?.files, detail?.changedFiles, diffFilesOverride, ensureAllFiles]);

const applyDiffCommitFilter = useCallback(
  async (nextRaw: DiffCommitFilterState) => {
    const next = normalizeDiffCommitFilter(nextRaw);
    setDiffCommitFilter(next);
    setDiffCommitError(null);
    setScrollTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;

    if (isAllCommitsFilter(next) || !detail) {
      setDiffFilesOverride(null);
      setDiffCommitLabel(null);
      setDiffCommitLoading(false);
      return;
    }

    const baseRefOrSha = detail.baseSha || detail.baseRef || '';
    const range = resolveCompareRange(detail.commits || [], baseRefOrSha, next);
    if (!range) {
      setDiffFilesOverride(null);
      setDiffCommitLabel(null);
      setDiffCommitError('Could not resolve commit range');
      return;
    }
    setDiffCommitLabel(range.label);

    if (typeof onFetchCompareFiles !== 'function') {
      setDiffCommitError('Compare fetch is unavailable');
      return;
    }

    const cacheKey = compareCacheKey(detail.owner, detail.repo, range.base, range.head);
    const cached = compareFilesCacheRef.current.get(cacheKey);
    if (cached) {
      setDiffFilesOverride(cached);
      setDiffCommitLoading(false);
      return;
    }

    const gen = ++compareFetchGenRef.current;
    setDiffCommitLoading(true);
    try {
      const result = await onFetchCompareFiles(range.base, range.head, {
        gitattributesText: detail.gitattributesText || '',
      });
      if (gen !== compareFetchGenRef.current) return;
      const files = Array.isArray(result?.files) ? result.files : [];
      compareFilesCacheRef.current.set(cacheKey, files);
      setDiffFilesOverride(files);
      setDiffCommitError(null);
    } catch (err: any) {
      if (gen !== compareFetchGenRef.current) return;
      setDiffCommitError(err?.message || String(err));
      setDiffFilesOverride(null);
    } finally {
      if (gen === compareFetchGenRef.current) setDiffCommitLoading(false);
    }
  },
  [detail, onFetchCompareFiles, setScrollTop]
);


  return { applyDiffCommitFilter, ensureAllCommits, ensureAllFiles, ensurePrTags };
}
