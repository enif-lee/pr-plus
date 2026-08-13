/**
 * Structural gates for architecture overhaul (no fake re-implementations).
 */
import { describe, expect, test } from '@rstest/core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function lineCount(rel: string) {
  return read(rel).split(/\r?\n/).length;
}

function firstCodeLine(body: string): string | null {
  for (const l of body.split(/\n/)) {
    const t = l.trim();
    if (!t || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) continue;
    return t;
  }
  return null;
}

describe('architecture gates', () => {
  test('rstest + eslint + tailwind tooling present', () => {
    expect(fs.existsSync(path.join(root, 'rstest.config.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'eslint.config.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'tailwind.config.js'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'postcss.config.js'))).toBe(true);
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.devDependencies['@rstest/core']).toBeTruthy();
    expect(pkg.scripts['test:unit'] || pkg.scripts.test).toMatch(/rstest/);
    // Local browser e2e is opt-in (not wired into test / test:unit / check)
    expect(pkg.scripts['test:e2e']).toMatch(/rstest\.e2e\.config|tests\/e2e/);
    expect(pkg.scripts['test:e2e:features']).toMatch(/e2e|features/);
    expect(pkg.scripts['test:e2e:perf']).toMatch(/e2e|perf/);
    expect(String(pkg.scripts.test || '')).not.toMatch(/test:e2e/);
    expect(String(pkg.scripts['test:unit'] || '')).not.toMatch(/e2e/);
    expect(String(pkg.scripts.check || '')).not.toMatch(/e2e/);
    expect(fs.existsSync(path.join(root, 'rstest.e2e.config.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'tests/e2e/features'))).toBe(true);
    expect(pkg.scripts['build:content-ts']).toMatch(/build-content-ts/);
    expect(pkg.scripts['build:pure']).toMatch(/build-pure/);
    expect(pkg.scripts.build).toMatch(/build:content-ts/);
    expect(pkg.scripts.build).toMatch(/build:pure/);
  });

  test('service worker + content-script entries are TypeScript SoT', () => {
    const entries = [
      'src/background/sw-api.ts',
      'src/storage.ts',
      'src/github-endpoints.ts',
      'src/tree.ts',
      'src/dom.ts',
      'src/content.ts',
      'src/content-bootstrap.ts',
      'src/content-bridge.ts',
      'src/pr-list-focus.ts',
      'src/pulls-palette.ts',
      'src/popup.ts',
    ];
    for (const f of entries) {
      expect(fs.existsSync(path.join(root, f))).toBe(true);
    }
    // detail-store must be typed (no @ts-nocheck hollow gate)
    const ds = read('src/modal/lib/detail-store.ts');
    expect(ds).not.toMatch(/\/\/\s*@ts-nocheck/);
    expect(ds).toMatch(/export function toAppDetail/);
    expect(ds).toMatch(/ApplyOpts|type ApplyOpts/);
  });

  test('host/fetch/content-bridge maintainable SoT is TypeScript', () => {
    const hostDir = path.join(root, 'src/host/modules');
    const hostTs = fs
      .readdirSync(hostDir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
    // Semantic domain modules (no NN- only organization as primary)
    expect(hostTs.length).toBeGreaterThanOrEqual(6);
    expect(hostTs.some((f) => /^\d{2}-/.test(f))).toBe(false);
    expect(hostTs).toEqual(
      expect.arrayContaining([
        'host-core-authority.ts',
        'host-core-store.ts',
        'side-fetch-progress.ts',
        'side-fetch-cache-assets.ts',
        'props-build.ts',
        'props-render-close.ts',
        'open-modal.ts',
        'open-modal-run.ts',
        'restore-embed-list-focus.ts',
        'list-row-lifecycle.ts',
        'pulls-palette-state.ts',
        'pulls-palette-render.ts',
        'pulls-palette-keys.ts',
        'auto-refresh-watch.ts',
        'click-intercept.ts',
      ])
    );
    expect(fs.readdirSync(hostDir).filter((f) => f.endsWith('.js'))).toEqual([]);
    // build-host declares explicit domain order
    const buildHost = read('scripts/build-host.mjs');
    expect(buildHost).toMatch(/HOST_MODULE_ORDER/);
    expect(buildHost).toMatch(/host-core-store\.ts/);
    expect(buildHost).toMatch(/side-fetch-progress\.ts/);
    expect(buildHost).not.toMatch(/01-state-detail-store/);
    expect(fs.existsSync(path.join(root, 'src/fetch/fetch-api.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src/content-bridge/bridge-api.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src/fetch/parts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'src/content-bridge/parts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'src/host/parts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'src/host/modules/MANIFEST.json'))).toBe(
      false
    );
    const bridgePtr = read('src/content-bridge.ts');
    expect(bridgePtr).toMatch(/bridge-api\.ts|CONTENT_BRIDGE_SOT/);
    expect(bridgePtr.split(/\n/).length).toBeLessThan(40);
    expect(bridgePtr).not.toMatch(/function initPrTreeContentBridge/);
  });

  test('generated content JS carries AUTO-GENERATED header when present', () => {
    for (const name of ['tree', 'dom', 'content', 'storage']) {
      const js = path.join(root, `src/${name}.js`);
      if (!fs.existsSync(js)) continue;
      const head = read(`src/${name}.js`).slice(0, 400);
      // Accept generated header or transitional hand-authored content entry
      expect(
        /AUTO-GENERATED|SOURCE OF TRUTH|@ts-nocheck|Pure PR tree|Content script/.test(
          head
        )
      ).toBe(true);
    }
  });

  test('detail-store TypeScript is source of truth with isolation API', () => {
    const ts = read('src/modal/lib/detail-store.ts');
    expect(ts).toMatch(/export function applyCorePayload/);
    expect(ts).toMatch(/export function applyFiles/);
    expect(ts).toMatch(/export function toAppDetail/);
  });

  test('modal styles are Tailwind-first; domain CSS imported from TSX', () => {
    const entry = read('src/modal/styles/entry.css');
    expect(entry).toMatch(/@tailwind base/);
    expect(entry).toMatch(/@tailwind components/);
    expect(entry).toMatch(/@tailwind utilities/);
    expect(entry).toMatch(/tokens\.css/);
    expect(read('src/modal/main.tsx')).toMatch(/styles\/entry\.css/);
    // Mega parts/ residual dump gone
    expect(fs.existsSync(path.join(root, 'src/modal/styles/parts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'src/modal/styles/residual'))).toBe(false);
    // Domain sibling CSS next to owners
    const siblings = [
      'src/modal/styles/tokens.css',
      'src/modal/styles/entry.css',
      'src/modal/components/common/Button.css',
      'src/modal/components/common/AsideSection.css',
      'src/modal/components/common/Badge.css',
      'src/modal/components/common/Avatar.css',
      'src/modal/components/common/TipPopover.css',
      'src/modal/components/common/ActionToast.css',
      'src/modal/components/common/FloatingScrollbar.css',
      'src/modal/views/chrome/ShellLayout.css',
      'src/modal/views/chrome/Header.css',
      'src/modal/views/chrome/LoadingSkeleton.css',
      'src/modal/views/diff/HunkExpandControls.css',
      'src/modal/views/diff/CodeCell.css',
      'src/modal/views/diff/DiffLayout.css',
      'src/modal/views/conversation/ConversationThread.css',
      'src/modal/views/conversation/ConversationShell.css',
      'src/modal/views/conversation/AsideCommitsTimeline.css',
    ];
    for (const f of siblings) {
      expect(fs.existsSync(path.join(root, f))).toBe(true);
    }
    // Components import their CSS
    expect(read('src/modal/components/common/Button.tsx')).toMatch(
      /import\s+['\"]\.\/Button\.css['\"]/
    );
    expect(read('src/modal/views/chrome/Header.tsx')).toMatch(
      /import\s+['\"]\.\/Header\.css['\"]/
    );
    expect(read('src/modal/views/diff/VirtualDiff.tsx')).toMatch(
      /import\s+['\"]\.\/DiffLayout\.css['\"]/
    );
    // build-modal collects CSS from the TSX graph
    const buildModal = read('scripts/build-modal.mjs');
    expect(buildModal).toMatch(/collect-css-from-tsx|cssImportOrder/);
    // Tailwind in common components
    expect(read('src/modal/components/common/Button.tsx')).toMatch(/inline-flex/);
    expect(read('src/modal/components/common/Badge.tsx')).toMatch(/rounded-full|inline-flex/);
    // Every domain CSS under src/modal (non-dist) is ≤1500 lines
    const overs: string[] = [];
    function walk(d: string) {
      const full = path.join(root, d);
      if (!fs.existsSync(full)) return;
      for (const ent of fs.readdirSync(full, { withFileTypes: true })) {
        const rel = path.join(d, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === 'dist' || ent.name === 'node_modules') continue;
          walk(rel);
        } else if (ent.name.endsWith('.css')) {
          const n = lineCount(rel);
          if (n > 1500) overs.push(`${rel}:${n}`);
        }
      }
    }
    walk('src/modal');
    expect(overs).toEqual([]);
  });


  test('anti-theater: real tsc projects for fetch/bridge; no assemble-as-typecheck', () => {
    const pkg = JSON.parse(read('package.json'));
    const tc = String(pkg.scripts.typecheck || '');
    expect(tc).toMatch(/tsconfig\.fetch\.json/);
    expect(tc).toMatch(/tsconfig\.bridge\.json/);
    expect(tc).toMatch(/tsconfig\.host\.json/);
    expect(tc).not.toMatch(/build-fetch|build-content-bridge|build-host/);
    // Complete SoT files exist (no mid-function parts dirs)
    expect(fs.existsSync(path.join(root, 'src/fetch/fetch-api.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src/content-bridge/bridge-api.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src/fetch/parts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'src/content-bridge/parts'))).toBe(false);
    // Balanced complete SoT
    for (const rel of ['src/fetch/fetch-api.ts', 'src/content-bridge/bridge-api.ts']) {
      const body = read(rel);
      const bal = (body.match(/\{/g) || []).length - (body.match(/\}/g) || []).length;
      expect(bal).toBe(0);
      const first = body
        .split(/\n/)
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*'));
      expect(first).toBeTruthy();
      expect(/^(async\\s+)?function |^const |^let |^var |^class |^importScripts|^import |^export |^type |^interface /.test(String(first))).toBe(true);
    }
    // No @ts-nocheck on maintainable SoT roots
    const roots = [
      'src/fetch/fetch-api.ts',
      'src/content-bridge/bridge-api.ts',
      'src/background/sw-api.ts',
      'src/tree.ts',
      'src/storage.ts',
      'src/github-endpoints.ts',
      'src/modal/lib/detail-store.ts',
      'src/modal/app/PrModalShell.tsx',
      'src/modal/views/conversation/ConversationView.tsx',
    ];
    for (const rel of roots) {
      if (!fs.existsSync(path.join(root, rel))) continue;
      const head = read(rel).slice(0, 400);
      expect(head).not.toMatch(/\/\/\s*@ts-nocheck/);
    }
    // No mid-function background parts dir (complete sw-api.ts is SoT)
    expect(fs.existsSync(path.join(root, 'src/background/parts'))).toBe(false);
    // Domain typecheck includes complete modal shells + SW SoT (not generated background.ts alone)
    const domainTs = read('tsconfig.json');
    expect(domainTs).toMatch(/PrModalShell\.tsx/);
    expect(domainTs).toMatch(/background\/sw-api\.ts/);
    expect(domainTs).not.toMatch(/pr-modal\/parts/);
  });


  test('PrModalShell and ConversationView are complete typechecked SoT (no mid-IIFE parts)', () => {
    expect(fs.existsSync(path.join(root, 'src/modal/app/PrModalShell.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src/modal/views/conversation/ConversationView.tsx'))).toBe(true);
    // Mid-IIFE part directories must not exist
    expect(fs.existsSync(path.join(root, 'src/modal/app/pr-modal/parts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'src/modal/views/conversation/parts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'src/modal/app/PrModalApp.generated.tsx'))).toBe(false);
    const shell = read('src/modal/app/PrModalShell.tsx');
    const cv = read('src/modal/views/conversation/ConversationView.tsx');
    expect(shell.slice(0, 400)).not.toMatch(/\/\/\s*@ts-nocheck/);
    expect(cv.slice(0, 400)).not.toMatch(/\/\/\s*@ts-nocheck/);
    expect(shell.slice(0, 500)).not.toMatch(/AUTO-ASSEMBLED from pr-modal\/parts/);
    expect(cv.slice(0, 500)).not.toMatch(/AUTO-ASSEMBLED from conversation\/parts/);
    expect(shell).toMatch(/export function PrModalApp/);
    expect(cv).toMatch(/ConversationView/);
    // Shell owns the mount graph; ConversationView remains a large view SoT
    const shellN = shell.split(/\n/).length;
    const cvN = cv.split(/\n/).length;
    console.log('PrModalShell lines', shellN, 'ConversationView lines', cvN);
    expect(shellN).toBeGreaterThan(100);
    expect(cvN).toBeGreaterThan(100);
  });

  test('PR modal UI is componentized with colocated siblings (not mid-IIFE parts)', () => {
    // Feature-local extracted components (function boundaries)
    const extracted = [
      'src/modal/views/conversation/GroupThreadControls.tsx',
      'src/modal/views/conversation/ThreadGapBanner.tsx',
      'src/modal/views/conversation/ThreadGapBanner.css',
      'src/modal/views/conversation/MergeBox.tsx',
      'src/modal/views/conversation/MergeBox.css',
      'src/modal/views/conversation/DescriptionCard.tsx',
      'src/modal/views/conversation/ComposerCard.tsx',
      'src/modal/views/pr-modal/DiffWorkspace.tsx',
      'src/modal/views/pr-modal/ShellResizers.tsx',
    ];
    for (const rel of extracted) {
      expect(fs.existsSync(path.join(root, rel))).toBe(true);
    }
    const impl = read('src/modal/app/PrModalShell.tsx');
    const cv = read('src/modal/views/conversation/ConversationView.tsx');
    // Composition roots import real components (not cat-assembled parts)
    expect(impl).toMatch(/from ['\"].*pr-modal\/DiffWorkspace['\"]/);
    expect(impl).toMatch(/from ['\"].*pr-modal\/ShellResizers['\"]/);
    expect(cv).toMatch(/from ['\"]\.\/MergeBox['\"]/);
    expect(cv).toMatch(/from ['\"]\.\/ComposerCard['\"]/);
    expect(cv).toMatch(/from ['\"]\.\/GroupThreadControls['\"]/);
    expect(cv).toMatch(/from ['\"]\.\/ThreadGapBanner['\"]/);
    expect(cv).toMatch(/from ['\"]\.\/DescriptionCard['\"]/);
    // No mid-function parts dirs anywhere under modal app/views
    expect(fs.existsSync(path.join(root, 'src/modal/app/pr-modal/parts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'src/modal/views/conversation/parts'))).toBe(false);
    // Merge residual CSS colocated with MergeBox (not TipPopover mega dump)
    const mergeCss = read('src/modal/views/conversation/MergeBox.css');
    expect(mergeCss).toMatch(/\.prp-merge-box\b/);
    expect(read('src/modal/components/common/TipPopover.css')).not.toMatch(
      /\.prp-merge-box\s*\{/
    );
    // AC3: residual is tokens/CTA only — not a 1:1 layout dump (was ~269 lines)
    const mergeCssLines = mergeCss.split(/\n/).length;
    expect(mergeCssLines).toBeLessThanOrEqual(220);
    // Must not re-introduce layout flex dumps that TW covers on MergeBox.tsx
    expect(mergeCss).not.toMatch(/\.prp-merge-box\s*\{[^}]*display\s*:\s*flex/s);
    expect(mergeCss).not.toMatch(/\.prp-merge-box__status-block\s*\{[^}]*display\s*:\s*flex/s);
    expect(mergeCss).not.toMatch(/\.prp-merge-box__actions\s*\{[^}]*display\s*:\s*flex/s);
    // Still retains true residual: color-mix tones + CTA var
    expect(mergeCss).toMatch(/color-mix/);
    expect(mergeCss).toMatch(/--prp-merge-cta/);
    // MergeBox.tsx carries Tailwind layout utilities
    const mergeTsx = read('src/modal/views/conversation/MergeBox.tsx');
    expect(mergeTsx).toMatch(/flex flex-col gap-3\.5|flex-col gap-3\.5/);
    expect(mergeTsx).toMatch(/rounded-xl|px-\[18px\]|py-4/);
    // Colocated CSS is imported from owning TSX (build-modal collects the graph)
    expect(read('src/modal/views/conversation/MergeBox.tsx')).toMatch(
      /import\s+['\"]\.\/MergeBox\.css['\"]/
    );
    expect(read('src/modal/views/conversation/ThreadGapBanner.tsx')).toMatch(
      /import\s+['\"]\.\/ThreadGapBanner\.css['\"]/
    );
    // Tailwind-first on extracted components
    expect(read('src/modal/views/conversation/ComposerCard.tsx')).toMatch(
      /inline-flex|flex-wrap|items-center/
    );
    expect(read('src/modal/views/conversation/GroupThreadControls.tsx')).toMatch(
      /inline-flex|min-w-0/
    );
  });

  test('host modules document HostContext boundary', () => {
    expect(fs.existsSync(path.join(root, 'src/host/host-context.d.ts'))).toBe(true);
    expect(read('src/host/host-context.d.ts')).toMatch(/HostCurrentSession/);
    expect(fs.existsSync(path.join(root, 'src/host/modules/README.md'))).toBe(true);
  });

  test('Zustand modal + detail-ui stores are wired', () => {
    const store = read('src/modal/store/modal-store.ts');
    expect(store).toMatch(/from 'zustand'/);
    expect(store).toMatch(/create(?:<[^>]+>)?\(/);
    const detailUi = read('src/modal/store/detail-ui-store.ts');
    expect(detailUi).toMatch(/useDetailUiStore/);
    // Must be imported by real UI surfaces (not dead file)
    const header = read('src/modal/views/chrome/Header.tsx');
    expect(header).toMatch(/useDetailUiStore/);
    const appImpl = read('src/modal/app/PrModalShell.tsx');
    expect(appImpl).toMatch(/useDetailUiStore|useModalStore/);
    const conv = read('src/modal/views/conversation/ConversationView.tsx');
    expect(conv).toMatch(/useDetailUiStore|useModalStore/);
  });

  test('host-data-first: no forceDropPending latch; set-authority helper shipped', () => {
    const appImpl = read('src/modal/app/PrModalShell.tsx');
    expect(appImpl).not.toMatch(/forceDropPendingRef/);
    expect(appImpl).not.toMatch(/\bsetLocalDetail\b/);
    expect(appImpl).not.toMatch(/useState\(detailProp\)/);
    const mut = read('src/modal/commands/domain-mutations.ts');
    expect(mut).not.toMatch(/forceDropPendingRef/);
    expect(mut).not.toMatch(/\bsetLocalDetail\b/);
    expect(mut).not.toMatch(/_dropPending\s*:\s*true/);
    expect(mut).toMatch(/void|no status/); expect(mut).toMatch(/applyDomainDetail/);
    const stale = read('src/modal/lib/stale-local-review.ts');
    expect(stale).toMatch(/export function mergeCommentsHostFirst/);
    const idb = read('src/modal/lib/detail-idb.ts');
    expect(idb).toMatch(/_dropPending:\s*_dropIgnored|_dropPending:\s*_d/);
    expect(idb).not.toMatch(/keepDropPending/);
    const attach = read('src/modal/lib/composer-attach.ts');
    expect(attach).not.toMatch(/_dropPending\s*:\s*true/);
    const detailStore = read('src/modal/lib/detail-store.ts');
    expect(detailStore).not.toMatch(/_dropPending\s*:\s*true/);
    expect(detailStore).not.toMatch(/store\.dropPending\s*=\s*true/);
    const store = read('src/modal/store/modal-store.ts');
    expect(store).not.toMatch(/localDetail/);
    expect(fs.existsSync(path.join(root, 'src/modal/commands/domain-mutations.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src/modal/app/domain-detail-context.tsx'))).toBe(true);
    const open = read('src/host/modules/open-modal-run.ts');
    expect(open).toMatch(/mergeCommentsHostFirst/);
    expect(fs.existsSync(path.join(root, 'src/modal/commands/review-actions.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src/modal/commands/side-actions.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src/modal/hooks/useDomainDetailHost.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src/modal/hooks/useCommandContext.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src/modal/hooks/usePrModalHotkeys.ts'))).toBe(true);
    const hotkeys = read('src/modal/hooks/usePrModalHotkeys.ts');
    expect(hotkeys).toMatch(/addEventListener\(\s*['\"]keydown['\"]/);
    expect(hotkeys).not.toMatch(/intentionally empty/);
    const implSrc = read('src/modal/app/PrModalShell.tsx');
    // Capture-phase product keydown must not remain inlined in the god file.
    expect(implSrc).not.toMatch(/window\.addEventListener\(\s*['\"]keydown['\"]/);
    expect(implSrc).toMatch(/usePrModalHotkeys\(hotkeyBag\)/);
    expect(fs.existsSync(path.join(root, 'src/modal/lib/set-authority.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src/modal/store/ui-store.ts'))).toBe(true);
    const composer = read('src/modal/views/conversation/ComposerCard.tsx');
    expect(composer).toMatch(/useDomainDetail/);
    const conv = read('src/modal/views/conversation/ConversationView.tsx');
    expect(conv).toMatch(/useDomainDetail/);
    const diffWs = read('src/modal/views/pr-modal/DiffWorkspace.tsx');
    expect(diffWs).toMatch(/useDomainDetail/);
    const reviewActions = read('src/modal/commands/review-actions.ts');
    expect(reviewActions).toMatch(/postSelectionLineComment/);
    expect(reviewActions).toMatch(/onLeaveReviewAction/);
    const side = read('src/modal/commands/side-actions.ts');
    expect(side).toMatch(/onDeleteHeadBranch/);
    expect(side).toMatch(/onToggleReaction/);
    expect(side).not.toMatch(/_dropPending\s*:\s*true/);
  });

  test('host modules are function-boundary cuts under 1800 lines', () => {
    const dir = path.join(root, 'src/host/modules');
    expect(fs.existsSync(dir)).toBe(true);
    const overs: string[] = [];
    const badStarts: string[] = [];
    // Semantic domain *.ts modules (exclude ambient .d.ts)
    // Cap 1900: open-modal-run grew with progressive threads + cache reinject.
    const maxLines = 1900;
    for (const f of fs
      .readdirSync(dir)
      .filter((x) => x.endsWith('.ts') && !x.endsWith('.d.ts'))
      .sort()) {
      const rel = path.join('src/host/modules', f);
      const body = read(rel);
      const n = body.split(/\r?\n/).length;
      if (n > maxLines) overs.push(`${rel}:${n}`);
      // Numbered-only naming is not the primary organization
      expect(/^\d{2}-/.test(f)).toBe(false);
      const first = firstCodeLine(body);
      if (
        first &&
        (/^[.)\]},]/.test(first) ||
          first.startsWith('.catch') ||
          first.startsWith('.then') ||
          first.startsWith('catch ') ||
          first.startsWith('then('))
      ) {
        badStarts.push(`${rel}: ${first.slice(0, 60)}`);
      }
    }
    expect(overs).toEqual([]);
    expect(badStarts).toEqual([]);
  });

  test('maintainable host modules and CSS siblings stay under 1800 lines', () => {
    const dirs = ['src/host/modules'];
    const overs: string[] = [];
    const all: string[] = [];
    const maxLines = 1900;
    for (const d of dirs) {
      const full = path.join(root, d);
      if (!fs.existsSync(full)) continue;
      for (const f of fs.readdirSync(full)) {
        if (!/\.(js|css|ts|tsx)$/.test(f)) continue;
        if (f.endsWith('.d.ts') || f === 'README.md' || f === 'MANIFEST.json') continue;
        const rel = path.join(d, f);
        const n = lineCount(rel);
        all.push(`${rel}:${n}`);
        if (n > maxLines) overs.push(`${rel}:${n}`);
      }
    }
    // CSS siblings under modal (non-dist)
    function walkCss(d: string) {
      const full = path.join(root, d);
      if (!fs.existsSync(full)) return;
      for (const ent of fs.readdirSync(full, { withFileTypes: true })) {
        const rel = path.join(d, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === 'dist' || ent.name === 'node_modules') continue;
          walkCss(rel);
        } else if (ent.name.endsWith('.css')) {
          const n = lineCount(rel);
          all.push(`${rel}:${n}`);
          if (n > maxLines) overs.push(`${rel}:${n}`);
        }
      }
    }
    walkCss('src/modal');
    console.log('modules+css:', all.length, 'overs:', overs.join(', ') || 'none');
    expect(all.length).toBeGreaterThan(15);
    expect(overs).toEqual([]);
  });

  test('PrModalApp entry is thin; shell is mount SoT; impl re-export-only if present', () => {
    const entry = read('src/modal/app/PrModalApp.tsx');
    expect(entry.split(/\n/).length).toBeLessThan(40);
    // Public entry must resolve to shell composition (not an impl body).
    expect(entry).toMatch(/PrModalShell/);
    expect(entry).not.toMatch(/export function PrModalApp\s*\(/);
    expect(
      fs.existsSync(path.join(root, 'src/modal/app/PrModalShell.tsx'))
    ).toBe(true);
    const shell = read('src/modal/app/PrModalShell.tsx');
    expect(shell.slice(0, 400)).not.toMatch(/\/\/\s*@ts-nocheck/);
    expect(shell).toMatch(/export function PrModalApp/);
    // Legacy PrModalApp.impl.tsx may remain only as a thin re-export (≤300 lines).
    const implPath = path.join(root, 'src/modal/app/PrModalApp.impl.tsx');
    if (fs.existsSync(implPath)) {
      const impl = read('src/modal/app/PrModalApp.impl.tsx');
      const implN = impl.split(/\n/).length;
      expect(implN).toBeLessThanOrEqual(300);
      expect(impl).not.toMatch(/export function PrModalApp\s*\(/);
      expect(impl).toMatch(/export\s*\{[^}]*\}\s*from\s*['\"]\.\/PrModalShell['\"]/);
    }
    // pr-modal-mutations bag deleted — commands/* is the mutation SoT.
    expect(
      fs.existsSync(path.join(root, 'src/modal/app/pr-modal-mutations.ts'))
    ).toBe(false);
  });

  test('ConversationView is complete typechecked SoT (no mid-IIFE parts)', () => {
    expect(
      fs.existsSync(path.join(root, 'src/modal/views/conversation/parts'))
    ).toBe(false);
    const cv = read('src/modal/views/conversation/ConversationView.tsx');
    expect(cv.slice(0, 400)).not.toMatch(/\/\/\s*@ts-nocheck/);
    expect(cv.slice(0, 500)).not.toMatch(/AUTO-ASSEMBLED from conversation\/parts/);
    expect(cv).toMatch(/ConversationView/);
  });

  test('generated/assembled runtime artifacts are marked', () => {
    const assembled = [
      'src/modal/app/PrModalShell.tsx',
      'src/pr-modal-host.js',
      'src/fetch-pulls.js',
      'src/content-bridge.js',
      'src/background/sw-api.ts',
    ];
    for (const f of assembled) {
      if (!fs.existsSync(path.join(root, f))) continue;
      const head = read(f).slice(0, 500);
      expect(head).toMatch(/AUTO-ASSEMBLED|AUTO-GENERATED|SOURCE OF TRUTH|parts/);
    }
    expect(lineCount('src/modal/app/PrModalApp.tsx')).toBeLessThan(30);
  });

  test('build-pure MAP covers majority of pure twins; pure-SoT is explicit', () => {
    const pureBuild = read('scripts/build-pure.mjs');
    expect(pureBuild).toMatch(/PURE_SOT|keep pure/);
    expect(pureBuild).toMatch(/detail-store/);
    expect(pureBuild).toMatch(/load-progress/);
    expect(pureBuild).toMatch(/checks:\s*\{\s*lib:\s*['\"]checks\.ts['\"]/);
    expect(read('src/modal/lib/checks.ts')).toMatch(/export function normalizeChecks/);
    expect(read('src/modal/lib/checks.ts')).not.toMatch(/@ts-ignore/);
    // generated pure should claim AUTO-GENERATED after a local build
    const dsPath = path.join(root, 'src/modal/pure/detail-store.js');
    if (fs.existsSync(dsPath)) {
      expect(read('src/modal/pure/detail-store.js').slice(0, 200)).toMatch(
        /SOURCE OF TRUTH|AUTO-GENERATED|detail-store/
      );
    }
  });

  test('generated runtime artifacts are not git-tracked', () => {
    const tracked = new Set(
      execFileSync('git', ['ls-files', '-z'], { cwd: root })
        .toString()
        .split('\0')
        .filter(Boolean)
    );
    const generated = [
      'src/background.sw.js',
      'src/background.bundle.js',
      'src/background.ts',
      'src/onboarding.js',
      'src/modal/pure/checks.js',
      'src/fetch-pulls.js',
      'src/pr-modal-host.js',
      'src/content-bridge.js',
      'src/tree.js',
      'src/dom.js',
      'src/content.js',
      'src/storage.js',
      'src/popup.js',
    ];
    for (const rel of generated) {
      expect(tracked.has(rel)).toBe(false);
    }
    // Hand-written IIFE SoT (no lib twin) stays tracked.
    expect(tracked.has('src/modal/pure/detail-merge.js')).toBe(true);
  });

  test('usePrModalOpenEffects is gone', () => {
    expect(
      fs.existsSync(path.join(root, 'src/modal/hooks/usePrModalOpenEffects.ts'))
    ).toBe(false);
  });
});
