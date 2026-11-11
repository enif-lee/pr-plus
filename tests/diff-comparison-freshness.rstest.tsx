import React from 'react';
import { describe, expect, test } from '@rstest/core';
import TestRenderer, { act } from 'react-test-renderer';
import { useEnsureDiffLoads } from '../src/modal/hooks/useEnsureDiffLoads';

function bag() {
  const b: any = { detail: { owner: 'o', repo: 'r', number: 1, headSha: 'head', baseSha: 'base',
    baseRef: 'main', headRef: 'feature', files: [], commits: [], changedFiles: 1, commitsCount: 1 },
    prIdentity: 'o/r#1', prTags: [], annotatedFiles: [], layoutMode: 'conversation' };
  for (const key of ['tagsLoadedForKeyRef', 'tagsLoadGenRef', 'commitsFullyLoadedRef', 'commitsFlightRef',
    'commitsFlightSeqRef', 'filesFullyLoadedRef', 'filesFlightRef', 'filesFlightSeqRef', 'compareFetchGenRef']) {
    b[key] = { current: 0 };
  }
  b.compareFilesCacheRef = { current: new Map() };
  b.listRef = { current: null };
  const calls: any[] = [];
  for (const key of ['setPrTags', 'setPrTagsError', 'setPrTagsLoading', 'setCommitListLoading', 'setFileListLoading',
    'setDiffFilesOverride', 'setDiffCommitFilter', 'setDiffCommitError', 'setDiffCommitLabel', 'setDiffCommitLoading', 'setScrollTop']) {
    b[key] = (value: any) => calls.push({ key, value });
  }
  b.applyDomainDetailToHost = (updater: any) => {
    const next = updater(b.detail);
    calls.push({ key: 'apply', value: next });
    return { status: 'applied' };
  };
  b.patchHostDetail = () => ({ status: 'applied' });
  return { b, calls };
}

describe('Diff data follows the current comparison', () => {
  for (const kind of ['files', 'commits']) {
    test(`${kind}: same-PR base change rejects the prior response and permits another fetch`, async () => {
      const { b, calls } = bag();
      let release!: (value: any[]) => void;
      let requests = 0;
      b[kind === 'files' ? 'onFetchAllPrFiles' : 'onFetchAllPrCommits'] = () => ++requests === 1
        ? new Promise(resolve => { release = resolve; })
        : Promise.resolve(kind === 'files' ? [{ filename: 'current.ts' }] : [{ sha: 'current' }]);
      let api: any;
      function Harness() { api = useEnsureDiffLoads(b); return null; }
      let root!: TestRenderer.ReactTestRenderer;
      await act(async () => { root = TestRenderer.create(<Harness />); });
      try {
        let pending!: Promise<void>;
        await act(async () => { pending = api[kind === 'files' ? 'ensureAllFiles' : 'ensureAllCommits'](); });
        b.detail = { ...b.detail, baseSha: 'new-base', baseRef: 'release' };
        await act(async () => { root.update(<Harness />); });
        await act(async () => {
          release(kind === 'files' ? [{ filename: 'stale.ts' }] : [{ sha: 'stale' }]);
          await pending;
        });
        expect(calls.filter(call => call.key === 'apply')).toEqual([]);
        await act(async () => { await api[kind === 'files' ? 'ensureAllFiles' : 'ensureAllCommits'](); });
        expect(requests).toBe(2);
        expect(calls.find(call => call.key === 'apply')?.value[kind]).toEqual(
          kind === 'files' ? [{ filename: 'current.ts' }] : [{ sha: 'current' }]
        );
      } finally { await act(async () => root.unmount()); }
    });
  }

  test('comparison changes clear completed latches, compare overrides and loading states', async () => {
    const { b, calls } = bag();
    function Harness() { useEnsureDiffLoads(b); return null; }
    let root!: TestRenderer.ReactTestRenderer;
    await act(async () => { root = TestRenderer.create(<Harness />); });
    try {
      b.commitsFullyLoadedRef.current = true;
      b.filesFullyLoadedRef.current = true;
      const generation = b.compareFetchGenRef.current;
      calls.length = 0;
      b.detail = { ...b.detail, headRef: 'renamed-feature' };
      await act(async () => root.update(<Harness />));
      expect(b.commitsFullyLoadedRef.current).toBe(false);
      expect(b.filesFullyLoadedRef.current).toBe(false);
      expect(b.compareFetchGenRef.current).toBeGreaterThan(generation);
      expect(calls).toContainEqual({ key: 'setDiffFilesOverride', value: null });
      expect(calls).toContainEqual({ key: 'setCommitListLoading', value: false });
      expect(calls).toContainEqual({ key: 'setFileListLoading', value: false });
    } finally { await act(async () => root.unmount()); }
  });
});
