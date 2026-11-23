/**
 * chrome.storage.local holds the PAT. The service worker restricts the area to
 * trusted contexts, so content scripts must go through SW messages for prefs
 * and onboarding state.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('storage access level', () => {
  test('service worker entry restricts chrome.storage.local on every cold wake', () => {
    const sw = read('src/background/sw-api.ts');
    expect(sw).toMatch(/chrome\.storage\.local\.setAccessLevel\?\.\(\{ accessLevel: 'TRUSTED_CONTEXTS' \}\)/);
    // Runs at top level (not inside an event handler) so it re-applies after restarts.
    expect(sw.indexOf('setAccessLevel')).toBeLessThan(sw.indexOf("export * from './sw-enterprise'"));
  });

  test('shipped SW bundle carries the restriction', () => {
    const bundle = read('src/background.sw.js');
    expect(bundle).toMatch(/setAccessLevel\?\.\(\{\s*accessLevel:\s*['"]TRUSTED_CONTEXTS['"]/);
  });
});

describe('content scripts do not touch chrome.storage.local directly', () => {
  const sources = [
    'src/content-bridge/bridge-prefs.ts',
    'src/content.ts',
    'src/host/modules/host-core-timeline-b.ts',
  ];
  for (const rel of sources) {
    test(`${rel} has no direct local storage access`, () => {
      expect(read(rel)).not.toMatch(/storage\?\.local|storage\.local/);
    });
  }

  test('bridge prefs get/set/watch use SW messages', () => {
    const bridge = read('src/content-bridge/bridge-prefs.ts');
    const get = bridge.slice(bridge.indexOf('async getExtensionPrefs()'), bridge.indexOf('async setExtensionPrefs('));
    expect(get).toMatch(/send\(\{ type: MSG\.PREFS_GET \}\)/);
    const set = bridge.slice(bridge.indexOf('async setExtensionPrefs('), bridge.indexOf('async getOnboardingCompleted('));
    expect(set).toMatch(/send\(\{\s*type: MSG\.PREFS_SET/);
    const watch = bridge.slice(bridge.indexOf('watchExtensionPrefs(onChange: any)'));
    expect(watch).toMatch(/MSG\.PREFS_CHANGED/);
    expect(watch).toMatch(/onChange\(normalizePrefsLocal\(message\.prefs\)\)/);
  });

  test('onboarding flag uses ONBOARDING_GET/SET messages only', () => {
    const content = read('src/content.ts');
    const start = content.indexOf('const maybeStartOnboarding');
    const onboarding = content.slice(start, content.indexOf('createOnboardingTour', start));
    expect(onboarding).not.toMatch(/ONBOARDING_KEY|readOnboardingLocal|writeOnboardingLocal/);
    const bridge = read('src/content-bridge/bridge-prefs.ts');
    expect(bridge).toMatch(/send\(\{ type: MSG\.ONBOARDING_GET \}\)/);
    expect(bridge).toMatch(/type: MSG\.ONBOARDING_SET/);
  });

  test('prefs broadcast also reaches Connected-site tabs (Linear overlay stays live)', () => {
    const broadcast = read('src/background/sw-broadcast.ts');
    expect(broadcast).toMatch(/export function broadcastPrefsChanged\(prefs: any\) \{\s*broadcastToGithubTabs\(\{ type: MSG\.PREFS_CHANGED, prefs \}, true\)/);
    expect(broadcast).toMatch(/includeConnected \? getConnectedSites\(\)/);
    // Token broadcasts must not widen to Connected sites.
    expect(broadcast).toMatch(/export function broadcastTokenChanged\(\) \{\s*broadcastToGithubTabs\(\{ type: MSG\.TOKEN_CHANGED \}\)/);
  });
});

describe('demo-reviews workflow', () => {
  const wf = read('.github/workflows/demo-reviews.yml');
  test('dry_run defaults to true and is typed as boolean', () => {
    expect(wf).toMatch(/dry_run:[\s\S]*?type: boolean[\s\S]*?default: true/);
  });
  test('input is passed to the script and gates the write call', () => {
    expect(wf).toMatch(/DRY_RUN: \$\{\{ inputs\.dry_run \}\}/);
    const gate = wf.indexOf("if (process.env.DRY_RUN !== 'false')");
    expect(gate).toBeGreaterThan(-1);
    // Every review write sits behind the gate.
    expect(wf.indexOf('pulls.createReview')).toBeGreaterThan(gate);
  });
});
