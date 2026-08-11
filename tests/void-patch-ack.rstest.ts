/**
 * AC3: void onPatchDetail is NOT treated as applied.
 * Drives shipped createApplyDomainDetailToHost + domain-mutations patchHostDetail.
 */
import { describe, expect, test } from '@rstest/core';
import { createApplyDomainDetailToHost } from '../src/modal/hooks/useDomainDetailHost';
import { installPrModalMutations } from '../src/modal/commands/domain-mutations';

describe('void ≠ applied (shipped patch helpers)', () => {
  test('createApplyDomainDetailToHost fails when onPatchDetail returns void', () => {
    const detailRef = {
      current: {
        owner: 'o',
        repo: 'r',
        number: 1,
        title: 't',
        comments: [],
      },
    };
    const apply = createApplyDomainDetailToHost({
      detailRef,
      getDetailProp: () => detailRef.current,
      onPatchDetail: () => {
        /* void — legacy host */
      },
    });
    const res = apply({
      ...detailRef.current,
      title: 'next',
    });
    expect(res.status).toBe('failed');
    expect(String(res.error || '')).toMatch(/void|no status/i);
  });

  test('createApplyDomainDetailToHost accepts explicit applied', () => {
    const detailRef = {
      current: { owner: 'o', repo: 'r', number: 1, title: 't', comments: [] },
    };
    const apply = createApplyDomainDetailToHost({
      detailRef,
      getDetailProp: () => detailRef.current,
      onPatchDetail: () => ({ status: 'applied' }),
    });
    const res = apply({ ...detailRef.current, title: 'ok' });
    expect(res.status).toBe('applied');
  });

  test('installPrModalMutations patchHostDetail fails on void onPatchDetail', () => {
    const detail = {
      owner: 'o',
      repo: 'r',
      number: 1,
      title: 't',
      assignees: [],
    };
    const bag: Record<string, any> = {
      detail,
      detailRef: { current: detail },
      setActionBusy: () => {},
      setActionMsg: () => {},
      onPatchDetail: () => undefined,
      requestConfirm: async () => true,
      stripPendingReviewFromDetail: (d: any) => d,
      discardPendingReview: () => ({ comments: [], body: '' }),
      pendingReviewNodeIdRef: { current: null },
    };
    const mut = installPrModalMutations(bag);
    const res = mut.patchHostDetail({ title: 'x' });
    expect(res.status).toBe('failed');
    expect(String(res.error || '')).toMatch(/void|no status/i);
  });

  test('installPrModalMutations patchHostDetail succeeds on {status:applied}', () => {
    const detail = { owner: 'o', repo: 'r', number: 1, title: 't' };
    const bag: Record<string, any> = {
      detail,
      detailRef: { current: detail },
      setActionBusy: () => {},
      setActionMsg: () => {},
      onPatchDetail: () => ({ status: 'applied' }),
      requestConfirm: async () => true,
      stripPendingReviewFromDetail: (d: any) => d,
      discardPendingReview: () => ({ comments: [], body: '' }),
      pendingReviewNodeIdRef: { current: null },
    };
    const mut = installPrModalMutations(bag);
    expect(mut.patchHostDetail({ title: 'y' }).status).toBe('applied');
  });
});
