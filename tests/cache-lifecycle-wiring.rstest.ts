/**
 * Structural / wiring contracts: merge·close·refresh·list APIs call
 * invalidation / write-through on the shipped sources (not stubs).
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (rel: string) =>
  fs.readFileSync(path.join(root, rel), 'utf8');

describe('mutation write-through wiring', () => {
  test('merge path patches host via onPatchDetail with merged/state', () => {
    const impl = read('src/modal/app/PrModalApp.impl.tsx');
    const mergeFn = impl.slice(
      impl.indexOf('async function onMergePr'),
      impl.indexOf('async function onDeleteHeadBranch')
    );
    expect(mergeFn).toMatch(/onPatchDetail/);
    expect(mergeFn).toMatch(/merged:\s*true/);
    expect(mergeFn).toMatch(/state:\s*['"]closed['"]/);
    // Re-assert after refresh like draft
    expect(mergeFn).toMatch(/await onRefresh/);
    expect(mergeFn.split('applyMerged').length).toBeGreaterThan(2);
  });

  test('close path patches host before requestClose', () => {
    const impl = read('src/modal/app/PrModalApp.impl.tsx');
    const closeFn = impl.slice(
      impl.indexOf('async function onClosePr'),
      impl.indexOf('async function onReopenPr')
    );
    expect(closeFn).toMatch(/onPatchDetail/);
    expect(closeFn).toMatch(/state:\s*['"]closed['"]/);
    const patchIdx = closeFn.indexOf('onPatchDetail');
    const closeIdx = closeFn.indexOf('requestClose');
    expect(patchIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeGreaterThan(patchIdx);
  });

  test('draft path still write-throughs draft', () => {
    const impl = read('src/modal/app/PrModalApp.impl.tsx');
    const draftFn = impl.slice(
      impl.indexOf('async function onSetDraftStage'),
      impl.indexOf('async function onMergePr')
    );
    expect(draftFn).toMatch(/onPatchDetail\?\.\(\{\s*draft/);
  });
});

describe('host open-list + refresh wiring', () => {
  test('ensureOpenPullsForStack supports force and age gate', () => {
    const host = read('src/host/modules/side-fetch-progress-assets.ts');
    expect(host).toMatch(/function ensureOpenPullsForStack/);
    expect(host).toMatch(/force/);
    expect(host).toMatch(/openPullsFetchedAt/);
    expect(host).toMatch(/function invalidateOpenPulls/);
    expect(host).toMatch(/function applyOpenPullLifecycle/);
    // Early return only when !force && ageOk (not permanent warm forever)
    expect(host).toMatch(/if\s*\(!force\s*&&\s*ageOk\)/);
    expect(host).toMatch(/OPEN_PULLS_MAX_AGE_MS/);
  });

  test('onRefresh forces open-list revalidate', () => {
    const props = read('src/host/modules/props-render-session.ts');
    expect(props).toMatch(/ensureOpenPullsForStack/);
    expect(props).toMatch(/force:\s*true/);
  });

  test('onPatchDetail lifecycle updates open list', () => {
    const props = read('src/host/modules/props-render-session.ts');
    expect(props).toMatch(/applyOpenPullLifecycle/);
    expect(props).toMatch(/hasOwnProperty\.call\(patch,\s*['"]draft['"]\)/);
    expect(props).toMatch(/hasOwnProperty\.call\(patch,\s*['"]merged['"]\)/);
  });
});

describe('list bootstrap APIs', () => {
  test('exposes patchCachedPr / removeCachedPr / replaceCachedPrs', () => {
    const boot = read('src/content-bootstrap.ts');
    expect(boot).toMatch(/function patchCachedPr/);
    expect(boot).toMatch(/function removeCachedPr/);
    expect(boot).toMatch(/function replaceCachedPrs/);
    expect(boot).toMatch(/patchCachedPr,/);
    expect(boot).toMatch(/removeCachedPr,/);
    expect(boot).toMatch(/replaceCachedPrs,/);
  });
});

describe('auto-refresh probe lifecycle', () => {
  test('host tick uses prProbeIndicatesStale when available', () => {
    const watch = read('src/host/modules/auto-refresh-watch.ts');
    expect(watch).toMatch(/prProbeIndicatesStale/);
    expect(watch).toMatch(/draft/);
    expect(watch).toMatch(/state/);
  });

  test('pure auto-refresh exports prProbeIndicatesStale', () => {
    const pure = read('src/modal/lib/auto-refresh.ts');
    expect(pure).toMatch(/export function prProbeIndicatesStale/);
  });
});

describe('shipped runtime artifacts', () => {
  test('manifest loads open-pulls-lifecycle pure before host', () => {
    const man = JSON.parse(read('manifest.json'));
    const js = man.content_scripts?.[0]?.js || [];
    const life = js.indexOf('src/modal/pure/open-pulls-lifecycle.js');
    const host = js.indexOf('src/pr-modal-host.js');
    expect(life).toBeGreaterThanOrEqual(0);
    expect(host).toBeGreaterThan(life);
  });

  test('modal bundle ships merge/close onPatchDetail write-through', () => {
    const bundle = read('src/modal/dist/pr-modal.bundle.js');
    // Draft gold path already had onPatchDetail({draft}); merge must too
    expect(bundle).toMatch(/onPatchDetail/);
    // Merged patch object in minified form still carries these keys
    expect(bundle).toMatch(/merged:\s*!0|merged:\s*true/);
    expect(bundle).toMatch(/applyMerged|mergedPatch|state:\s*["']closed["']/);
    // Close before requestClose pattern — patch then close
    expect(bundle).toMatch(/closedPatch|state:\s*["']closed["']/);
  });

  test('host uses acceptOpenPullsNetworkResult / tombstones', () => {
    const host = read('src/host/modules/side-fetch-progress-assets.ts');
    expect(host).toMatch(/acceptOpenPullsNetworkResult/);
    expect(host).toMatch(/openPullsTombstones/);
    expect(host).toMatch(/openPullsFetchGen/);
    expect(host).toMatch(/PRModalOpenPullsLifecycle/);
  });

  test('onRefresh awaits force open-list (not fire-and-forget void)', () => {
    const props = read('src/host/modules/props-render-session.ts');
    expect(props).toMatch(
      /await ensureOpenPullsForStack\(owner,\s*repo,\s*\{\s*force:\s*true/
    );
  });
});
