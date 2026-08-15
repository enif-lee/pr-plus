/**
 * buildGithubPrPageUrl — shared chrome + palette PR link target.
 */
import { describe, expect, test } from '@rstest/core';
import {
  buildGithubPrPageUrl,
  githubPullUrl,
} from '../src/modal/lib/ui-polish';

describe('buildGithubPrPageUrl', () => {
  test('builds github.com pull URL from owner/repo/number', () => {
    const url = buildGithubPrPageUrl({
      owner: 'enif-lee',
      repo: 'pr-plus',
      number: 7,
    });
    expect(url).toBe('https://github.com/enif-lee/pr-plus/pull/7');
    expect(url).toMatch(/\/pull\/7$/);
    expect(url).toContain('enif-lee');
    expect(url).toContain('pr-plus');
  });

  test('prefers htmlUrl when it is a pull page', () => {
    const url = buildGithubPrPageUrl({
      owner: 'x',
      repo: 'y',
      number: 1,
      htmlUrl: 'https://github.com/enif-lee/pr-plus/pull/7#discussion_r1',
    });
    expect(url).toBe('https://github.com/enif-lee/pr-plus/pull/7');
  });

  test('supports enterprise webOrigin', () => {
    const url = buildGithubPrPageUrl({
      owner: 'acme',
      repo: 'app',
      number: 42,
      webOrigin: 'https://github.example.com',
    });
    expect(url).toBe('https://github.example.com/acme/app/pull/42');
  });

  test('empty when missing identity', () => {
    expect(buildGithubPrPageUrl({})).toBe('');
    expect(buildGithubPrPageUrl({ owner: 'a', repo: 'b' })).toBe('');
  });

  test('matches githubPullUrl for public cloud', () => {
    expect(
      buildGithubPrPageUrl({ owner: 'o', repo: 'r', number: 9 })
    ).toBe(githubPullUrl('o', 'r', 9));
  });
});

describe('copy-pr-link wiring (static)', () => {
  test('palette and header expose copy PR link action', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    const palette = fs.readFileSync(
      path.join(root, 'src/modal/lib/command-palette-build.ts'),
      'utf8'
    );
    const runner = fs.readFileSync(
      path.join(root, 'src/modal/app/pr-modal-run-palette.ts'),
      'utf8'
    );
    const header = fs.readFileSync(
      path.join(root, 'src/modal/views/chrome/Header.tsx'),
      'utf8'
    );
    expect(palette).toMatch(/copy-pr-link/);
    expect(palette).toMatch(/copyPrGithubLink/);
    expect(runner).toMatch(/case 'copyPrGithubLink'/);
    expect(runner).toMatch(/buildGithubPrPageUrl/);
    expect(header).toMatch(/data-prp-copy-pr-link/);
    expect(header).toMatch(/buildGithubPrPageUrl/);
    expect(header).toMatch(/IconLink/);
  });
});
