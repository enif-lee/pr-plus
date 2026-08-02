/**
 * Thin detail-page GNB — pure helpers.
 */
import { describe, expect, test } from '@rstest/core';
import {
  buildDetailGnbLeftItems,
  buildDetailGnbModel,
  buildDetailGnbRightSlots,
  githubAbsPath,
  normalizeRepoSlug,
  shouldShowDetailGnb,
} from '../src/modal/lib/detail-gnb';

describe('normalizeRepoSlug / githubAbsPath', () => {
  test('normalizes owner/repo; rejects empty or slashy', () => {
    expect(normalizeRepoSlug('rtzr', 'callabo-server')).toEqual({
      owner: 'rtzr',
      repo: 'callabo-server',
    });
    expect(normalizeRepoSlug('  a  ', '  b  ')).toEqual({
      owner: 'a',
      repo: 'b',
    });
    expect(normalizeRepoSlug('', 'b')).toBe(null);
    expect(normalizeRepoSlug('a/b', 'c')).toBe(null);
  });

  test('githubAbsPath prefixes origin', () => {
    expect(githubAbsPath('/rtzr/x')).toBe('https://github.com/rtzr/x');
    expect(githubAbsPath('https://github.com/notifications')).toBe(
      'https://github.com/notifications'
    );
  });
});

describe('buildDetailGnbLeftItems', () => {
  test('Code / Issues / Pull requests / Actions / Agent / Security / Insights / Settings', () => {
    const left = buildDetailGnbLeftItems('enif-lee', 'pr-plus');
    const byId = Object.fromEntries(left.map((i) => [i.id, i]));
    expect(byId.code.label).toBe('Code');
    expect(byId.code.href).toBe('https://github.com/enif-lee/pr-plus');
    expect(byId.issues.label).toBe('Issues');
    expect(byId.issues.href).toBe('https://github.com/enif-lee/pr-plus/issues');
    expect(byId.pulls.label).toBe('Pull requests');
    expect(byId.pulls.href).toBe('https://github.com/enif-lee/pr-plus/pulls');
    expect(byId.actions.label).toBe('Actions');
    expect(byId.actions.href).toBe(
      'https://github.com/enif-lee/pr-plus/actions'
    );
    expect(byId.agent.label).toBe('Agent');
    expect(byId.agent.href).toBe('https://github.com/copilot');
    expect(byId.security.label).toBe('Security');
    expect(byId.security.href).toBe(
      'https://github.com/enif-lee/pr-plus/security'
    );
    expect(byId.insights.label).toBe('Insights');
    expect(byId.insights.href).toBe(
      'https://github.com/enif-lee/pr-plus/pulse'
    );
    expect(byId.settings.label).toBe('Settings');
    expect(byId.settings.href).toBe(
      'https://github.com/enif-lee/pr-plus/settings'
    );
    expect(left.map((i) => i.label)).toEqual([
      'Code',
      'Issues',
      'Pull requests',
      'Actions',
      'Agent',
      'Security',
      'Insights',
      'Settings',
    ]);
  });

  test('empty owner/repo → no items', () => {
    expect(buildDetailGnbLeftItems(null, 'x')).toEqual([]);
  });
});

describe('buildDetailGnbRightSlots', () => {
  test('notifications + account profile when logged in', () => {
    const right = buildDetailGnbRightSlots({ viewerLogin: 'enif-lee' });
    expect(right.map((s) => s.id)).toEqual(['notifications', 'account']);
    expect(right[0].href).toBe('https://github.com/notifications');
    expect(right[1].href).toBe('https://github.com/enif-lee');
    expect(right[1].login).toBe('enif-lee');
    expect(right[1].label).toBe('enif-lee');
  });

  test('account falls back to Sign in /login when no viewer', () => {
    const right = buildDetailGnbRightSlots({});
    const account = right.find((s) => s.id === 'account');
    expect(account?.href).toBe('https://github.com/login');
    expect(account?.label).toBe('Sign in');
    expect(account?.login).toBe(null);
  });
});

describe('buildDetailGnbModel + shouldShowDetailGnb', () => {
  test('model bundles left+right from detail', () => {
    const m = buildDetailGnbModel({
      detail: {
        owner: 'rtzr',
        repo: 'callabo-server',
        viewerLogin: 'enif-lee',
      },
    });
    expect(m).not.toBe(null);
    expect(m!.repoLabel).toBe('rtzr/callabo-server');
    expect(m!.left.some((i) => i.id === 'pulls')).toBe(true);
    expect(m!.right.some((s) => s.id === 'notifications')).toBe(true);
    expect(m!.right.find((s) => s.id === 'account')?.login).toBe('enif-lee');
  });

  test('null when owner/repo missing', () => {
    expect(buildDetailGnbModel({ detail: { viewerLogin: 'x' } })).toBe(null);
  });

  test('GNB only for embed presentation', () => {
    expect(shouldShowDetailGnb('embed')).toBe(true);
    expect(shouldShowDetailGnb('modal')).toBe(false);
    expect(shouldShowDetailGnb(null)).toBe(false);
    expect(shouldShowDetailGnb('page')).toBe(true);
  });
});
