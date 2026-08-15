/**
 * PR0B: files/commits merge authority (settled empty vs placeholder).
 */
import { describe, expect, test } from '@rstest/core';
import {
  mergeDetailPreserveOptimistic,
  mergeSliceListAuthority,
} from '../src/modal/lib/composer-attach';

describe('mergeSliceListAuthority', () => {
  test('non-empty next wins', () => {
    const prev = { files: [{ path: 'a' }] };
    const next = { files: [{ path: 'b' }, { path: 'c' }] };
    expect(mergeSliceListAuthority(prev, next, 'files')).toEqual(next.files);
  });

  test('settled empty is authoritative', () => {
    const prev = { files: [{ path: 'a' }], _sideSettled: { files: false } };
    const next = { files: [], _sideSettled: { files: true } };
    expect(mergeSliceListAuthority(prev, next, 'files')).toEqual([]);
  });

  test('unsettled empty keeps prev non-empty (placeholder)', () => {
    const prev = { files: [{ path: 'a' }], _sideSettled: { files: true } };
    const next = { files: [], _sideSettled: { files: false } };
    expect(mergeSliceListAuthority(prev, next, 'files')).toEqual([{ path: 'a' }]);
  });

  test('unsettled empty without prev stays empty', () => {
    const prev = { files: [] };
    const next = { files: [], _sideSettled: { files: false } };
    expect(mergeSliceListAuthority(prev, next, 'files')).toEqual([]);
  });

  test('commits same rules', () => {
    const prev = { commits: [{ sha: '1' }] };
    const next = { commits: [], _sideSettled: { commits: false } };
    expect(mergeSliceListAuthority(prev, next, 'commits')).toEqual([{ sha: '1' }]);
    const settled = { commits: [], _sideSettled: { commits: true } };
    expect(mergeSliceListAuthority(prev, settled, 'commits')).toEqual([]);
  });

  test('prefers prev files with patches over slim next (_patchOmitted)', () => {
    const prev = {
      files: [{ filename: 'a.ts', patch: '@@ -1 +1 @@\n-a\n+b', additions: 1, deletions: 1 }],
    };
    const next = {
      files: [
        {
          filename: 'a.ts',
          patch: '',
          _patchOmitted: true,
          additions: 1,
          deletions: 1,
        },
      ],
      _sideSettled: { files: true },
    };
    const out = mergeSliceListAuthority(prev, next, 'files');
    expect(out[0].patch).toContain('@@');
    expect(out[0]._patchOmitted).toBeFalsy();
  });

  test('accepts full REST next even when some patches are GitHub-omitted', () => {
    // Without _patchOmitted, empty patch = oversized file GitHub skipped —
    // must not reject the full fetchAllPrFiles result over a smaller prev.
    const prev = {
      files: [{ filename: 'a.ts', patch: '@@\n+x', additions: 1, deletions: 0 }],
    };
    const next = {
      files: [
        { filename: 'a.ts', patch: '@@\n+x', additions: 1, deletions: 0 },
        { filename: 'big.ts', patch: '', additions: 5000, deletions: 5000 },
      ],
    };
    const out = mergeSliceListAuthority(prev, next, 'files');
    expect(out).toHaveLength(2);
    expect(out[1].filename).toBe('big.ts');
  });
});

describe('mergeDetailPreserveOptimistic milestone lag', () => {
  const base = { owner: 'o', repo: 'r', number: 1, title: 't' };

  test('list sketch null does not wipe non-null prev milestone', () => {
    const prev = {
      ...base,
      milestone: { number: 1, title: 'pr-plus-e2e-meta' },
      _metaSeq: 0,
    };
    const next = {
      ...base,
      milestone: null,
      _sketch: true,
      _source: 'list',
    };
    const m = mergeDetailPreserveOptimistic(prev, next);
    expect(m.milestone?.title).toBe('pr-plus-e2e-meta');
  });

  test('network non-null milestone replaces prev', () => {
    const prev = { ...base, milestone: null };
    const next = {
      ...base,
      milestone: { number: 2, title: 'v2' },
      _source: 'network',
    };
    const m = mergeDetailPreserveOptimistic(prev, next);
    expect(m.milestone).toEqual({ number: 2, title: 'v2' });
  });
});

describe('mergeDetailPreserveOptimistic bodyReactions', () => {
  test('keeps local viewer reaction when host snapshot lags', () => {
    const prev = {
      owner: 'o',
      repo: 'r',
      number: 1,
      bodyReactions: [
        { content: 'heart', count: 1, viewerHasReacted: true, users: ['me'] },
      ],
    };
    const next = {
      owner: 'o',
      repo: 'r',
      number: 1,
      bodyReactions: [],
    };
    const m = mergeDetailPreserveOptimistic(prev, next);
    expect(m.bodyReactions).toEqual(prev.bodyReactions);
  });

  test('adopts host when viewer reaction is present', () => {
    const prev = {
      owner: 'o',
      repo: 'r',
      number: 1,
      bodyReactions: [
        { content: 'heart', count: 1, viewerHasReacted: true, users: ['me'] },
      ],
    };
    const next = {
      owner: 'o',
      repo: 'r',
      number: 1,
      bodyReactions: [
        {
          content: 'heart',
          count: 2,
          viewerHasReacted: true,
          users: ['me', 'other'],
        },
      ],
    };
    const m = mergeDetailPreserveOptimistic(prev, next);
    expect(m.bodyReactions).toEqual(next.bodyReactions);
  });
});

describe('mergeDetailPreserveOptimistic files/commits', () => {
  const base = {
    owner: 'o',
    repo: 'r',
    number: 1,
    title: 't',
  };

  test('preserves local files when host sends unsettled empty', () => {
    const prev = {
      ...base,
      files: [{ filename: 'a.ts' }, { filename: 'b.ts' }],
      _sideSettled: { files: true },
    };
    const next = {
      ...base,
      files: [],
      _sideSettled: { files: false },
    };
    const m = mergeDetailPreserveOptimistic(prev, next);
    expect(m.files).toHaveLength(2);
    expect(m.files[0].filename).toBe('a.ts');
  });

  test('accepts host settled empty files', () => {
    const prev = {
      ...base,
      files: [{ filename: 'a.ts' }],
      _sideSettled: { files: false },
    };
    const next = {
      ...base,
      files: [],
      _sideSettled: { files: true },
    };
    const m = mergeDetailPreserveOptimistic(prev, next);
    expect(m.files).toEqual([]);
  });

  test('host non-empty files replace local', () => {
    const prev = { ...base, files: [{ filename: 'old' }] };
    const next = {
      ...base,
      files: [{ filename: 'new1' }, { filename: 'new2' }],
      _sideSettled: { files: true },
    };
    const m = mergeDetailPreserveOptimistic(prev, next);
    expect(m.files).toHaveLength(2);
    expect(m.files[0].filename).toBe('new1');
  });
});
