/**
 * Manifest + page-API + partner script gates (shipped lists, not copies).
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import {
  CONTENT_SCRIPT_JS,
  PARTNER_CS_ISOLATED_JS,
  PARTNER_CS_MAIN_JS,
  PARTNER_HOST_JS,
  SHELL_SCRIPT_JS,
} from '../src/content-scripts-list';
import {
  callerOriginFromSender,
  allowExternalSender,
} from '../src/background/sw-open-pr';
import {
  partnerScriptListsExcludeGithubStack,
  urlMatchesConnectedOrigins,
  parseCustomConnectedOrigins,
  partnerHostScriptEntry,
} from '../src/background/sw-connected-sites';

const root = path.join(__dirname, '..');

describe('page-api gates', () => {
  test('manifest has loopback externally_connectable without ids / [::1] / unlimitedStorage', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')
    );
    expect(manifest.permissions || []).not.toContain('unlimitedStorage');
    expect(manifest.optional_host_permissions || []).toContain('http://localhost/*');
    expect(manifest.optional_host_permissions || []).toContain('http://127.0.0.1/*');
    expect(manifest.optional_host_permissions || []).not.toContain('http://*/*');
    expect(manifest.optional_host_permissions || []).not.toContain('http://[::1]/*');
    const ext = manifest.externally_connectable;
    expect(ext).toBeTruthy();
    expect(ext.ids).toBeUndefined();
    expect(ext.matches).toEqual(['http://localhost/*', 'http://127.0.0.1/*']);
    expect(JSON.stringify(ext)).not.toMatch(/::1/);
    const cs0 = manifest.content_scripts[0];
    expect(cs0.js).toEqual([...CONTENT_SCRIPT_JS]);
    expect(manifest.content_scripts[1].js).toEqual([...PARTNER_CS_ISOLATED_JS]);
    expect(manifest.content_scripts[2].js).toEqual([...PARTNER_CS_MAIN_JS]);
    expect(manifest.content_scripts[2].world).toBe('MAIN');
  });

  test('Linear partner + shell lists exclude GitHub list/onboarding stack', () => {
    const banned = [
      'src/content.js',
      'src/tree.js',
      'src/dom.js',
      'src/onboarding.js',
      'src/pr-list-focus.js',
      'src/pulls-palette.js',
    ];
    for (const name of banned) {
      expect([...PARTNER_HOST_JS]).not.toContain(name);
      expect([...SHELL_SCRIPT_JS]).not.toContain(name);
      expect([...PARTNER_CS_ISOLATED_JS]).not.toContain(name);
      expect([...PARTNER_CS_MAIN_JS]).not.toContain(name);
    }
    expect(partnerScriptListsExcludeGithubStack()).toBe(true);
    expect([...PARTNER_HOST_JS][0]).toBe('src/partner/mark-runtime.js');
    expect([...PARTNER_HOST_JS]).toContain('src/partner/partner.js');
    expect([...SHELL_SCRIPT_JS]).toContain('src/shell/shell.js');
    expect([...PARTNER_HOST_JS]).not.toEqual([...CONTENT_SCRIPT_JS]);
  });

  test('callerOrigin comes from sender.origin, never payload', () => {
    const spoofed = callerOriginFromSender({
      origin: 'http://localhost:4173',
    } as chrome.runtime.MessageSender);
    expect(spoofed).toBe('http://localhost:4173');
    const empty = callerOriginFromSender({
      origin: '',
    } as chrome.runtime.MessageSender);
    expect(empty).toBe('');
    const nul = callerOriginFromSender({
      origin: 'null',
    } as chrome.runtime.MessageSender);
    expect(nul).toBe('');
  });

  test('loopback senders are allowed; other extension ids are not', () => {
    expect(
      allowExternalSender({
        origin: 'http://localhost:3000',
      } as chrome.runtime.MessageSender)
    ).toBe(true);
    expect(
      allowExternalSender({
        origin: 'https://linear.app',
      } as chrome.runtime.MessageSender)
    ).toBe(false);
    expect(
      allowExternalSender({
        origin: 'http://localhost:3000',
        id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      } as chrome.runtime.MessageSender)
    ).toBe(false);
  });

  test('Linear issue URL matches connected-site patterns', () => {
    const origins = ['https://linear.app/*', 'https://*.linear.app/*'];
    expect(
      urlMatchesConnectedOrigins(
        'https://linear.app/mornica/issue/PRP-2',
        origins
      )
    ).toBe(true);
    expect(
      urlMatchesConnectedOrigins('https://app.linear.app/mornica', origins)
    ).toBe(true);
    expect(
      urlMatchesConnectedOrigins('https://github.com/rtzr/iac/pull/1911', origins)
    ).toBe(false);
  });

  test('custom domain parses to HTTPS match patterns and gets overlay host', () => {
    expect(parseCustomConnectedOrigins('app.example.com')).toEqual({
      ok: true,
      origins: ['https://app.example.com/*'],
    });
    expect(parseCustomConnectedOrigins('*.internal.example.com')).toEqual({
      ok: true,
      origins: ['https://*.internal.example.com/*'],
    });
    expect(parseCustomConnectedOrigins('https://jira.corp.example/browse/X')).toEqual({
      ok: true,
      origins: ['https://jira.corp.example/*'],
    });
    expect(parseCustomConnectedOrigins('github.com').ok).toBe(false);
    expect(parseCustomConnectedOrigins('http://intranet.local').ok).toBe(false);
    const entry = partnerHostScriptEntry(['https://app.example.com/*']);
    expect(entry?.id).toBe('prp-partner-overlay-host');
    expect(entry?.matches).toEqual(['https://app.example.com/*']);
    expect(entry?.js).toContain('src/partner/partner.js');
    expect(entry?.js[0]).toBe('src/partner/mark-runtime.js');
    expect(
      urlMatchesConnectedOrigins(
        'https://app.example.com/board/1',
        ['https://app.example.com/*']
      )
    ).toBe(true);
  });

  test('popup requests host permission in the click turn', () => {
    const popup = fs.readFileSync(path.join(root, 'src/popup.ts'), 'utf8');
    expect(popup).toMatch(/permissions\.request/);
    expect(popup).toMatch(/PR_TREE_CONNECTED_SITES_ADD/);
    const partner = fs.readFileSync(path.join(root, 'src/partner/partner.ts'), 'utf8');
    expect(partner).toMatch(/findGithubPullFromClickPath/);
    expect(partner).toMatch(/pointerdown/);
    expect(partner).toMatch(/prp-modal-host/);
    expect(partner).toMatch(/isPrPlusUiEvent/);
    const assets = fs.readFileSync(
      path.join(root, 'src/host/modules/side-fetch-cache-assets.ts'),
      'utf8'
    );
    expect(assets).not.toMatch(
      /isPartnerOrShellRuntime\(\)\) \{\s*return emptyPeek/
    );
  });

  test('open args type lists owner/repo/number in page-api SoT', () => {
    const types = fs.readFileSync(
      path.join(root, 'src/page-api/types.ts'),
      'utf8'
    );
    expect(types).toMatch(/owner: string/);
    expect(types).toMatch(/repo: string/);
    expect(types).toMatch(/number: number/);
    expect(types).toMatch(/githubHost\?/);
    expect(types).toMatch(/opener-embed/);
    const isolated = fs.readFileSync(
      path.join(root, 'src/page-api/prplus-isolated.ts'),
      'utf8'
    );
    expect(isolated).toMatch(/PR_TREE_OPEN_PR/);
    expect(isolated).not.toMatch(/callerOrigin:/);
    const openPr = fs.readFileSync(
      path.join(root, 'src/background/sw-open-pr.ts'),
      'utf8'
    );
    expect(openPr).toMatch(/urlMatchesConnectedOrigins/);
    expect(openPr).toMatch(/senderIsPartnerHostPage/);
    expect(openPr).not.toMatch(/host === 'linear\.app'/);
  });

  test('third-party integration guide documents PRPlus overlay control', () => {
    const guide = fs.readFileSync(
      path.join(root, 'docs/prplus-integration.md'),
      'utf8'
    );
    expect(guide).toMatch(/window\.PRPlus/);
    expect(guide).toMatch(/opener-embed/);
    expect(guide).toMatch(/Connected sites/);
    expect(guide).toMatch(/waitForPRPlus/);
    expect(guide).toMatch(/githubHost/);
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    expect(readme).toMatch(/docs\/prplus-integration\.md/);
  });
});

