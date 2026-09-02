/**
 * Open-modal refresh must pick up external GitHub edits (chips, comments,
 * checks) instead of keeping the in-session snapshot.
 */
import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeIssueIdentityIntoPull } from '../src/fetch/pr-detail';

const root = resolve(__dirname, '..');

describe('mergeIssueIdentityIntoPull', () => {
  test('issue assignees/labels win even when pull is non-empty stale', () => {
    const merged = mergeIssueIdentityIntoPull(
      {
        assignees: [{ login: 'alice' }, { login: 'bob' }],
        labels: [{ name: 'bug' }],
        milestone: null,
      },
      {
        assignees: [{ login: 'carol' }],
        labels: [],
        milestone: { number: 3, title: 'M3' },
      }
    );
    expect(merged.assignees).toEqual([{ login: 'carol' }]);
    expect(merged.labels).toEqual([]);
    expect(merged.milestone?.number).toBe(3);
  });

  test('missing issue arrays leave pull untouched', () => {
    const pull = { assignees: [{ login: 'alice' }], labels: [{ name: 'bug' }] };
    const merged = mergeIssueIdentityIntoPull(pull, { milestone: null });
    expect(merged.assignees).toEqual(pull.assignees);
    expect(merged.labels).toEqual(pull.labels);
  });
});

describe('refresh wiring (static SoT)', () => {
  test('paintRefreshCore trusts network meta and replaces newest timeline', () => {
    const host = readFileSync(
      resolve(root, 'src/host/modules/props-build.ts'),
      'utf8'
    );
    expect(host).toMatch(/trustNetworkMeta:\s*true/);
    expect(host).toMatch(/replaceNewestTimeline:\s*true/);
  });

  test('fetchPrChecks busts same-SHA cache', () => {
    const src = readFileSync(
      resolve(root, 'src/fetch/detail-sides-files.ts'),
      'utf8'
    );
    expect(src).toMatch(/cache: 'no-store'/);
    expect(src).toMatch(/check-runs\?per_page=100&filter=latest&\$\{bust\(\)\}/);
  });

  test('auto-refresh compares updatedAt and re-fetches checks on same SHA', () => {
    const watch = readFileSync(
      resolve(root, 'src/host/modules/auto-refresh-watch.ts'),
      'utf8'
    );
    expect(watch).toMatch(/updatedAt:\s*detail\?\.updatedAt/);
    expect(watch).toMatch(/refreshOpenChecksOnly/);
    expect(watch).toMatch(/fetchPrChecks/);
  });
});
