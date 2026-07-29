/**
 * URI-first modal restore on /pulls (no session-only reopen).
 */
import { describe, expect, test } from '@rstest/core';
import { resolveRestore } from '../src/modal/lib/uri-route';

describe('resolveRestore (URI-first)', () => {
  test('plain /pulls with session snap only → none (do not reopen)', () => {
    const r = resolveRestore({
      sessionOpen: {
        owner: 'enif-lee',
        repo: 'pr-plus',
        number: 7,
        page: 'diff',
      },
      sessionView: { layoutMode: 'diff' },
      uri: { page: null, number: null, position: null },
      pathOwner: 'enif-lee',
      pathRepo: 'pr-plus',
    });
    expect(r.source).toBe('none');
    expect(r.open).toBe(null);
  });

  test('URI prp_number opens that PR (source uri)', () => {
    const r = resolveRestore({
      sessionOpen: {
        owner: 'enif-lee',
        repo: 'pr-plus',
        number: 99,
        page: 'diff',
      },
      uri: { page: 'conversation', number: 7, position: 'c:1' },
      pathOwner: 'enif-lee',
      pathRepo: 'pr-plus',
    });
    expect(r.source).toBe('uri');
    expect(r.open).toEqual({
      owner: 'enif-lee',
      repo: 'pr-plus',
      number: 7,
    });
    expect(r.page).toBe('conversation');
    expect(r.position).toBe('c:1');
  });

  test('URI number without page uses same-PR session page', () => {
    const r = resolveRestore({
      sessionOpen: {
        owner: 'enif-lee',
        repo: 'pr-plus',
        number: 7,
        page: 'diff',
        position: 'c:9',
      },
      sessionView: { layoutMode: 'diff' },
      uri: { page: null, number: 7, position: null },
      pathOwner: 'enif-lee',
      pathRepo: 'pr-plus',
    });
    expect(r.source).toBe('uri');
    expect(r.open?.number).toBe(7);
    expect(r.page).toBe('diff');
    expect(r.position).toBe('c:9');
  });

  test('URI number does not inherit different session PR', () => {
    const r = resolveRestore({
      sessionOpen: {
        owner: 'enif-lee',
        repo: 'pr-plus',
        number: 3,
        page: 'diff',
      },
      uri: { page: null, number: 7, position: null },
      pathOwner: 'enif-lee',
      pathRepo: 'pr-plus',
    });
    expect(r.open?.number).toBe(7);
    expect(r.page).toBe(null);
  });
});
