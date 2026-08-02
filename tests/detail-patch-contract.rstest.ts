/**
 * PR0A contracts: supersede meta keys, narrow comment patch, strip for stale core.
 */
import { describe, expect, test } from '@rstest/core';
import {
  COMMENT_PATCH_KEYS,
  SUPERSEDES_META_REFRESH_KEYS,
  applyCorePayload,
  applyPeopleMetaAuthorityToCore,
  buildPeopleMetaAuthority,
  createEmptyStore,
  patchTouchesSupersedeMeta,
  pickCommentPatchKeys,
  pickMeta,
  stripSupersededMetaFields,
  toAppDetail,
} from '../src/modal/lib/detail-store';

describe('detail-patch contract (PR0A)', () => {
  test('patchTouchesSupersedeMeta only for chip/lifecycle keys', () => {
    expect(patchTouchesSupersedeMeta({ labels: [] })).toBe(true);
    expect(patchTouchesSupersedeMeta({ title: 'x' })).toBe(true);
    expect(patchTouchesSupersedeMeta({ subscribed: true })).toBe(true);
    expect(patchTouchesSupersedeMeta({ files: [] })).toBe(false);
    expect(patchTouchesSupersedeMeta({ commits: [] })).toBe(false);
    expect(patchTouchesSupersedeMeta({ comments: [] })).toBe(false);
    expect(patchTouchesSupersedeMeta({ viewerPendingReview: null })).toBe(false);
    expect(patchTouchesSupersedeMeta({ reviewComments: [] })).toBe(false);
  });

  test('SUPERSEDES_META_REFRESH_KEYS excludes viewerPendingReview', () => {
    expect(SUPERSEDES_META_REFRESH_KEYS).not.toContain('viewerPendingReview');
    expect(SUPERSEDES_META_REFRESH_KEYS).toContain('labels');
  });

  test('pickMeta only includes keys present on patch', () => {
    const m = pickMeta({ labels: ['a'], title: 'T', files: [{ path: 'x' }] });
    expect(m.labels).toEqual(['a']);
    expect(m.title).toBe('T');
    expect(m).not.toHaveProperty('files');
  });

  test('pickCommentPatchKeys never includes title/files/draft', () => {
    const p = pickCommentPatchKeys({
      title: 'nope',
      files: [{ path: 'x' }],
      draft: true,
      comments: [{ id: 1 }],
      reviewComments: [{ id: 2 }],
      viewerPendingReview: { id: 'r1' },
      bodyReactions: [],
    });
    expect(p.comments).toEqual([{ id: 1 }]);
    expect(p.reviewComments).toEqual([{ id: 2 }]);
    expect(p.viewerPendingReview).toEqual({ id: 'r1' });
    expect(p).not.toHaveProperty('title');
    expect(p).not.toHaveProperty('files');
    expect(p).not.toHaveProperty('draft');
    for (const k of Object.keys(p)) {
      expect(COMMENT_PATCH_KEYS as readonly string[]).toContain(k);
    }
  });

  test('stripSupersededMetaFields drops labels/title but keeps headSha', () => {
    const s = stripSupersededMetaFields({
      labels: ['old'],
      title: 'old',
      headSha: 'abc',
      number: 1,
    });
    expect(s).not.toHaveProperty('labels');
    expect(s).not.toHaveProperty('title');
    expect(s.headSha).toBe('abc');
    expect(s.number).toBe(1);
  });

  test('applyCorePayload skipSupersedeMeta preserves store labels', () => {
    const store = createEmptyStore();
    applyCorePayload(store, {
      owner: 'o',
      repo: 'r',
      number: 1,
      labels: ['keep-me'],
      title: 'Local title',
      headSha: 'old',
    });
    expect(store.meta.labels).toEqual(['keep-me']);
    applyCorePayload(
      store,
      {
        owner: 'o',
        repo: 'r',
        number: 1,
        labels: ['stale-refresh'],
        title: 'Stale title',
        headSha: 'newsha',
      },
      { skipSupersedeMeta: true }
    );
    expect(store.meta.labels).toEqual(['keep-me']);
    expect(store.meta.title).toBe('Local title');
    expect(store.meta.headSha).toBe('newsha');
  });

  test('people meta authority keeps post-write labels over stale core', () => {
    const auth = buildPeopleMetaAuthority(
      { owner: 'o', repo: 'r', number: 7 },
      { labels: [{ name: 'bug', color: 'd73a4a' }] },
      { gen: 2, at: 1_000 }
    );
    expect(auth?.fields.labels?.[0]?.name).toBe('bug');
    const { flat, fullyMatched } = applyPeopleMetaAuthorityToCore(
      {
        owner: 'o',
        repo: 'r',
        number: 7,
        labels: [], // stale core GET right after write
        title: 'PR',
      },
      auth,
      { owner: 'o', repo: 'r', number: 7 },
      { now: 1_000 + 5_000 }
    );
    expect(fullyMatched).toBe(false);
    expect(flat.labels).toEqual([{ name: 'bug', color: 'd73a4a' }]);
  });

  test('people meta authority clears when network matches write', () => {
    const auth = buildPeopleMetaAuthority(
      { owner: 'o', repo: 'r', number: 7 },
      { labels: [{ name: 'bug' }] },
      { gen: 1, at: 1_000 }
    );
    const { flat, fullyMatched } = applyPeopleMetaAuthorityToCore(
      {
        owner: 'o',
        repo: 'r',
        number: 7,
        labels: [{ name: 'bug', color: 'd73a4a' }],
      },
      auth,
      { owner: 'o', repo: 'r', number: 7 },
      { now: 1_000 + 1_000 }
    );
    expect(fullyMatched).toBe(true);
    expect(flat.labels[0].name).toBe('bug');
  });

  test('people meta authority ignores other PR / expired TTL', () => {
    const auth = buildPeopleMetaAuthority(
      { owner: 'o', repo: 'r', number: 7 },
      { labels: [{ name: 'bug' }] },
      { gen: 1, at: 1_000 }
    );
    const other = applyPeopleMetaAuthorityToCore(
      { number: 8, labels: [] },
      auth,
      { owner: 'o', repo: 'r', number: 8 },
      { now: 1_000 + 1_000 }
    );
    expect(other.flat.labels).toEqual([]);
    expect(other.fullyMatched).toBe(false);

    const expired = applyPeopleMetaAuthorityToCore(
      { number: 7, labels: [] },
      auth,
      { owner: 'o', repo: 'r', number: 7 },
      { now: 1_000 + 200_000, ttlMs: 120_000 }
    );
    expect(expired.flat.labels).toEqual([]);
  });

  test('clear authority only briefly forces empty over non-empty network', () => {
    const auth = buildPeopleMetaAuthority(
      { owner: 'o', repo: 'r', number: 7 },
      { labels: [] },
      { gen: 3, at: 1_000 }
    );
    // Within clear TTL: keep empty (stale core still has bug)
    const early = applyPeopleMetaAuthorityToCore(
      { number: 7, labels: [{ name: 'bug' }] },
      auth,
      { owner: 'o', repo: 'r', number: 7 },
      { now: 1_000 + 3_000, clearTtlMs: 12_000 }
    );
    expect(early.flat.labels).toEqual([]);
    expect(early.fullyMatched).toBe(false);

    // After clear TTL: network chips win (external re-add / session reuse)
    const late = applyPeopleMetaAuthorityToCore(
      { number: 7, labels: [{ name: 'bug', color: 'd73a4a' }] },
      auth,
      { owner: 'o', repo: 'r', number: 7 },
      { now: 1_000 + 20_000, clearTtlMs: 12_000 }
    );
    expect(late.flat.labels).toEqual([{ name: 'bug', color: 'd73a4a' }]);
    expect(late.fullyMatched).toBe(false);
  });

  test('files patch meta does not mark comments settled via toAppDetail', () => {
    const store = createEmptyStore();
    applyCorePayload(store, {
      owner: 'o',
      repo: 'r',
      number: 7,
      title: 'PR',
    });
    const flat = toAppDetail(store);
    expect(flat._sideSettled?.files).toBe(false);
    expect(flat._sideSettled?.comments).toBe(false);
  });
});

