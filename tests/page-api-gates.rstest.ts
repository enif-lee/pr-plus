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
  EXTERNAL_MESSAGE_TYPES,
} from '../src/background/sw-open-pr';
import { MSG } from '../src/sw-messages';
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

  test('loopback external messages are limited to the PRPlus launcher ops', () => {
    expect([...EXTERNAL_MESSAGE_TYPES].sort()).toEqual(
      [MSG.PING, MSG.OPEN_PR, MSG.CLOSE_PR, MSG.PR_STATUS].sort()
    );
    for (const type of [
      MSG.FETCH_PR_DETAIL,
      MSG.TOKEN_STATUS,
      MSG.TOKEN_SET,
      MSG.TOKEN_CLEAR,
      MSG.CONNECTED_SITES_ADD,
      MSG.DETAIL_CACHE_GET,
    ]) {
      expect(EXTERNAL_MESSAGE_TYPES.has(type)).toBe(false);
    }
    const src = fs.readFileSync(
      path.join(root, 'src/background/sw-handle-message.ts'),
      'utf8'
    );
    const external = src.slice(src.indexOf('onMessageExternal'));
    expect(external.indexOf('EXTERNAL_MESSAGE_TYPES.has')).toBeGreaterThan(-1);
    expect(external.indexOf('EXTERNAL_MESSAGE_TYPES.has')).toBeLessThan(
      external.indexOf('handleMessage(')
    );
  });

  test('PRPlus version is injected from manifest, not hard-coded', () => {
    for (const rel of ['src/page-api/prplus-main.ts', 'src/page-api/prplus-isolated.ts']) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      expect(src).toContain('const VERSION = __PRP_VERSION__;');
      expect(src).not.toMatch(/const VERSION = ['"]\d/);
    }
    const build = fs.readFileSync(path.join(root, 'scripts/build-page-api.mjs'), 'utf8');
    expect(build).toContain('__PRP_VERSION__');
  });

  test('launcher registry survives SW eviction and re-checks the tab', () => {
    const src = fs.readFileSync(path.join(root, 'src/background/sw-open-pr.ts'), 'utf8');
    expect(src).toContain('chrome?.storage?.session');
    expect(src).toContain('liveSessionForOrigin(origin)');
    expect(src).toContain('tabs.onRemoved');
    const host = fs.readFileSync(
      path.join(root, 'src/host/modules/click-intercept.ts'),
      'utf8'
    );
    expect(host).toContain("message?.type === 'PR_TREE_PR_STATUS'");
  });

  test('partner sheet renders in an extension iframe, not the host page', () => {
    const src = fs.readFileSync(path.join(root, 'src/partner/partner.ts'), 'utf8');
    // Page scripts must not reach pr+ DOM: no in-page modal host / React mount.
    expect(src).not.toMatch(/PRModalHost/);
    expect(src).toContain("getURL('src/shell/shell.html')");
    expect(src).toContain("const FRAME_ID = 'prp-partner-frame'");
    // Close only from the frame's own window on the extension origin.
    expect(src).toMatch(/event\.source !== f\.contentWindow \|\| event\.origin !== extOrigin/);
    // Synthetic page clicks cannot open pr+.
    expect(src).toContain('event.isTrusted');
    // Keys stay off Linear while the frame is open; focus kept in the frame.
    expect(src).toMatch(/addEventListener\(\s*'focusin'/);
    for (const name of ['src/pr-modal-host.js', 'src/modal/dist/pr-modal.bundle.js']) {
      expect([...PARTNER_HOST_JS]).not.toContain(name);
    }
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
    // Suffix must be a label boundary, not a string tail.
    expect(urlMatchesConnectedOrigins('https://evillinear.app/x', origins)).toBe(false);
  });

  test('loopback patterns match any port; explicit ports must equal', () => {
    const loop = ['http://localhost/*', 'http://127.0.0.1/*'];
    expect(urlMatchesConnectedOrigins('http://localhost:3000/app', loop)).toBe(true);
    expect(urlMatchesConnectedOrigins('http://127.0.0.1:5173/', loop)).toBe(true);
    expect(urlMatchesConnectedOrigins('https://localhost:3000/', loop)).toBe(false);
    const ported = ['https://*.corp.example:8443/*'];
    expect(urlMatchesConnectedOrigins('https://a.corp.example:8443/', ported)).toBe(true);
    expect(urlMatchesConnectedOrigins('https://a.corp.example/', ported)).toBe(false);
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
    expect(parseCustomConnectedOrigins('*.com').ok).toBe(false);
    expect(parseCustomConnectedOrigins('*.10.0.0.1').ok).toBe(false);
    expect(parseCustomConnectedOrigins('*.example.com').ok).toBe(true);
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
    expect(partner).toMatch(/findLinearReviewHrefFromClickPath/);
    expect(partner).toMatch(/isLinearIssuePath/);
    expect(partner).toMatch(/altKey/);
    // Linear review toggle lives in the partner runtime now.
    expect(partner).toMatch(/findReviewTabMount/);
    expect(partner).toMatch(/prp-linear-open-toggle/);
    expect(partner).toContain("addEventListener('pointerdown', onLinkedPrPointer, true)");
    expect(partner).toContain("addEventListener('click', onLinkedPrPointer, true)");
    expect(partner).toMatch(/prp-partner-frame/);
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

