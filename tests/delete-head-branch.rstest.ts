/**
 * Post-merge delete head branch — pure gate + request shape.
 */
import { describe, expect, test } from '@rstest/core';
import {
  buildDeleteHeadBranchFromDetail,
  buildDeleteHeadBranchRequest,
  deleteHeadBranchButtonLabel,
  resolveDeleteHeadBranchTarget,
  shouldAutoCloseOnTerminalTransition,
  shouldShowDeleteHeadBranch,
} from '../src/modal/lib/delete-head-branch';

const base = {
  merged: true,
  headRef: 'feature/x',
  headOwner: 'enif-lee',
  headRepo: 'pr-plus',
  owner: 'enif-lee',
  repo: 'pr-plus',
  baseRef: 'main',
};

describe('shouldShowDeleteHeadBranch', () => {
  test('true for merged PR with head ref', () => {
    expect(shouldShowDeleteHeadBranch(base)).toBe(true);
  });
  test('false when not merged', () => {
    expect(shouldShowDeleteHeadBranch({ ...base, merged: false })).toBe(false);
  });
  test('false when already deleted', () => {
    expect(
      shouldShowDeleteHeadBranch({ ...base, headBranchDeleted: true })
    ).toBe(false);
  });
  test('false when head is default/base branch', () => {
    expect(
      shouldShowDeleteHeadBranch({ ...base, headRef: 'main', baseRef: 'main' })
    ).toBe(false);
  });
});

describe('buildDeleteHeadBranchRequest', () => {
  test('DELETE git refs/heads path', () => {
    const req = buildDeleteHeadBranchRequest('o', 'r', 'feature/x');
    expect(req.method).toBe('DELETE');
    expect(req.url).toBe(
      'https://api.github.com/repos/o/r/git/refs/heads/feature/x'
    );
  });
  test('encodes branch segments', () => {
    const req = buildDeleteHeadBranchRequest('o', 'r', 'feat/a b');
    expect(req.url).toContain('/git/refs/heads/feat/a%20b');
  });
  test('from detail uses head owner/repo', () => {
    const built = buildDeleteHeadBranchFromDetail({
      ...base,
      headOwner: 'fork-user',
      headRepo: 'pr-plus',
    });
    expect(built).not.toBeNull();
    expect(built!.url).toContain('/repos/fork-user/pr-plus/git/refs/heads/feature/x');
    expect(built!.target.branch).toBe('feature/x');
  });
  test('null when gate fails', () => {
    expect(buildDeleteHeadBranchFromDetail({ merged: false })).toBeNull();
    expect(resolveDeleteHeadBranchTarget({ merged: false })).toBeNull();
  });
  test('button label includes branch', () => {
    expect(deleteHeadBranchButtonLabel(base)).toMatch(/feature\/x/);
  });
});

describe('shouldAutoCloseOnTerminalTransition', () => {
  test('does not auto-close after merge (delete-branch CTA)', () => {
    expect(
      shouldAutoCloseOnTerminalTransition({
        wasTerminal: false,
        isTerminal: true,
        merged: true,
      })
    ).toBe(false);
  });

  test('auto-closes closed-without-merge transition', () => {
    expect(
      shouldAutoCloseOnTerminalTransition({
        wasTerminal: false,
        isTerminal: true,
        merged: false,
      })
    ).toBe(true);
  });

  test('no close when already terminal on open', () => {
    expect(
      shouldAutoCloseOnTerminalTransition({
        wasTerminal: true,
        isTerminal: true,
        merged: true,
      })
    ).toBe(false);
    expect(
      shouldAutoCloseOnTerminalTransition({
        wasTerminal: null,
        isTerminal: true,
        merged: false,
      })
    ).toBe(false);
  });
});
