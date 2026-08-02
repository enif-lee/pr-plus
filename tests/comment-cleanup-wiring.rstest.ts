/**
 * Unit gates for e2e comment track + cleanup (no agent-browser).
 * Proves pure registry of the shipped cleanup module.
 */
import { describe, expect, test } from '@rstest/core';
import {
  createCommentTracker,
  e2eCommentBody,
  findCommentsByMark,
  makeE2eCommentMark,
  planDeletes,
} from './e2e/lib/comment-cleanup.mjs';

describe('e2e comment cleanup pure tracker', () => {
  test('register then takeAll drains list (no hard-coded live ids)', () => {
    const t = createCommentTracker();
    expect(t.size()).toBe(0);
    const mark = makeE2eCommentMark('e2e-comment');
    expect(mark).toMatch(/^e2e-comment-/);
    const body = e2eCommentBody(mark, 'unit-draft');
    expect(body).toContain(mark);
    t.track({ kind: 'issue', id: null, mark, body });
    t.track({
      kind: 'review',
      id: 99,
      mark: makeE2eCommentMark('e2e-comment'),
      body: 'x',
    });
    expect(t.size()).toBe(2);
    const plan = planDeletes(t.list());
    expect(plan).toHaveLength(2);
    expect(plan[0].kind).toBe('issue');
    expect(plan[0].id).toBeNull();
    expect(plan[1].kind).toBe('review');
    expect(plan[1].id).toBe(99);
    const drained = t.takeAll();
    expect(drained).toHaveLength(2);
    expect(t.size()).toBe(0);
    expect(t.list()).toEqual([]);
  });

  test('findCommentsByMark matches real body shape', () => {
    const mark = makeE2eCommentMark('e2e-comment');
    const comments = [
      { id: 1, body: 'noise' },
      { id: 2, body: e2eCommentBody(mark, 'composer cmd-enter') },
      { id: 3, body: `prefix ${mark} suffix` },
    ];
    const hits = findCommentsByMark(comments, mark);
    expect(hits.map((c) => c.id).sort()).toEqual([2, 3]);
    expect(findCommentsByMark(comments, 'e2e-comment-never')).toEqual([]);
  });

  test('track rejects empty mark', () => {
    const t = createCommentTracker();
    expect(() => t.track({ kind: 'issue', id: 1, mark: '' })).toThrow(/mark/);
  });
});
