/**
 * Pure + structural checks for in-page PR embed (replace GH main under header).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  PRESENTATION_MODAL,
  PRESENTATION_EMBED,
  PAGE_EMBED_HOST_ID,
  parsePrPagePath,
  isPrEmbedTarget,
  normalizePresentation,
  isEmbedPresentation,
  embedShellChromeFlags,
  presentationClassName,
  shouldShowEmbedChrome,
} = require('../src/modal/lib/page-embed.ts');

// --- URL recognition ---
{
  const conv = parsePrPagePath('/octo/hello-world/pull/42');
  assert.ok(conv);
  assert.equal(conv.owner, 'octo');
  assert.equal(conv.repo, 'hello-world');
  assert.equal(conv.number, 42);
  assert.equal(conv.page, 'conversation');
}

{
  const files = parsePrPagePath('/octo/hello-world/pull/42/files');
  assert.ok(files);
  assert.equal(files.page, 'diff');
  assert.equal(files.tab, 'files');
}

{
  const changes = parsePrPagePath('/octo/hello-world/pull/42/changes');
  assert.ok(changes);
  assert.equal(changes.page, 'diff');
  assert.equal(changes.tab, 'changes');
  assert.equal(changes.commitSha, null);
}

{
  const sha = 'f334fbf918447bb285d5639b7e58f8974f21f926';
  const single = parsePrPagePath(`/octo/repo/pull/9/changes/${sha}`);
  assert.ok(single);
  assert.equal(single.page, 'diff');
  assert.equal(single.commitSha, sha);
  assert.equal(single.commitEndSha, null);
}

{
  const a = '1c80998c68f94d575ce97bf03f98e463b86aec6f';
  const b = 'ae9d7dd052bf4347b2ee1f5d4823aaf84efc04ed';
  const range = parsePrPagePath(`/octo/repo/pull/9/changes/${a}..${b}`);
  assert.ok(range);
  assert.equal(range.commitSha, a);
  assert.equal(range.commitEndSha, b);
}

{
  const trailing = parsePrPagePath('/octo/repo/pull/7/');
  assert.ok(trailing);
  assert.equal(trailing.page, 'conversation');
}

assert.equal(parsePrPagePath('/octo/repo/pull/1/commits'), null);
assert.equal(parsePrPagePath('/octo/repo/pull/1/checks'), null);
assert.equal(parsePrPagePath('/octo/repo/pulls'), null);
assert.equal(parsePrPagePath('/octo/repo'), null);
assert.equal(isPrEmbedTarget('/a/b/pull/9/files'), true);
assert.equal(isPrEmbedTarget('/a/b/pull/9/changes'), true);
assert.equal(
  isPrEmbedTarget(
    '/a/b/pull/9/changes/f334fbf918447bb285d5639b7e58f8974f21f926'
  ),
  true
);
assert.equal(isPrEmbedTarget('/a/b/pulls'), false);

// --- presentation / chrome flags ---
assert.equal(normalizePresentation('embed'), PRESENTATION_EMBED);
assert.equal(normalizePresentation(null), PRESENTATION_MODAL);
assert.equal(isEmbedPresentation('embed'), true);
assert.equal(isEmbedPresentation('modal'), false);

const flags = embedShellChromeFlags();
assert.equal(flags.presentation, PRESENTATION_EMBED);
assert.equal(flags.showClose, false);
assert.equal(flags.showShellToggle, false);
assert.equal(flags.showFullscreen, false);
assert.equal(flags.showExit, false);
assert.equal(flags.showRestoreNative, true);

assert.equal(presentationClassName('embed'), 'prp-shell--embed');
assert.equal(presentationClassName('modal'), '');
assert.equal(shouldShowEmbedChrome('embed', 'close'), false);
assert.equal(shouldShowEmbedChrome('embed', 'shellToggle'), false);
assert.equal(shouldShowEmbedChrome('embed', 'fullscreen'), false);
assert.equal(shouldShowEmbedChrome('modal', 'close'), true);

assert.equal(PAGE_EMBED_HOST_ID, 'prp-page-embed');

// pure JS module mirrors API
const pure = require('../src/modal/pure/page-embed.js');
assert.equal(pure.isPrEmbedTarget('/x/y/pull/3'), true);
assert.deepEqual(pure.embedShellChromeFlags().showClose, false);

// --- structural: host + app wire embed ---
const root = path.join(__dirname, '..');
const host = fs.readFileSync(path.join(root, 'src/pr-modal-host.js'), 'utf8');
const app = fs.readFileSync(
  path.join(root, 'src/modal/app/PrModalApp.tsx'),
  'utf8'
);
const header = fs.readFileSync(
  path.join(root, 'src/modal/views/chrome/Header.tsx'),
  'utf8'
);
const css = fs.readFileSync(path.join(root, 'src/modal/styles.css'), 'utf8');
const manifest = fs.readFileSync(path.join(root, 'manifest.json'), 'utf8');

assert.ok(host.includes('tryEmbedFromLocation'), 'host exports embed entry');
assert.ok(host.includes('ensureEmbedHost'), 'host creates embed root');
assert.ok(host.includes('presentation'), 'host passes presentation');
// PR-page embed has no pulls-list cache — must fetch open PRs so Stack matches fullscreen
assert.ok(
  host.includes('ensureOpenPullsForStack') && host.includes('fetchOpenPulls'),
  'embed open fetches open PR list for Stack strip parity'
);
assert.ok(
  host.includes('void ensureOpenPullsForStack') ||
    host.includes('ensureOpenPullsForStack(owner'),
  'openModal kicks stack list fetch without blocking first paint'
);
assert.ok(
  host.includes('ensureGithubPrToggle') && host.includes('prp-gh-open-toggle'),
  'native GH PR header has pr+ toggle when embed off'
);
assert.ok(
  !host.includes('Open pr+') || host.includes("aria-label', 'Open with pr+"),
  'toggle is blue pr+ chip only (no Open pr+ label text in markup)'
);
// Markup should be the chip itself, not nested mark + label spans
assert.ok(
  host.includes("btn.textContent = 'pr+'") || host.includes('textContent = "pr+"'),
  'toggle textContent is pr+ only'
);
assert.ok(
  host.includes('removeGithubPrToggle'),
  'toggle removed while embed is open'
);
{
  const contentCss = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
  assert.ok(
    contentCss.includes('prp-gh-open-toggle'),
    'content CSS styles native Open pr+ toggle'
  );
}
assert.ok(
  host.includes('prp-page-embed') || host.includes('PAGE_EMBED_HOST_ID'),
  'embed host id'
);
// Close cancels in-flight fetches
assert.ok(
  host.includes('abortOpenFetches') && host.includes('beginOpenFetchSession'),
  'host aborts open-session fetches on close / re-open'
);
assert.ok(
  host.includes('sheet-closed') || host.includes("abort('sheet-closed')") || host.includes('abortOpenFetches'),
  'close path aborts fetch session'
);
{
  const bridge = fs.readFileSync(path.join(root, 'src/content-bridge.js'), 'utf8');
  const bg = fs.readFileSync(path.join(root, 'src/background.js'), 'utf8');
  // Chrome loads background.bundle.js — source + bundle must both carry cancel.
  const bundlePath = path.join(root, 'src/background.bundle.js');
  const bgSrcMtime = fs.statSync(path.join(root, 'src/background.js')).mtimeMs;
  const bundleMtime = fs.existsSync(bundlePath)
    ? fs.statSync(bundlePath).mtimeMs
    : 0;
  if (!fs.existsSync(bundlePath) || bundleMtime < bgSrcMtime) {
    const { spawnSync } = require('node:child_process');
    const build = spawnSync(process.execPath, [path.join(root, 'scripts/build-sw.mjs')], {
      encoding: 'utf8',
    });
    assert.equal(build.status, 0, `build:sw failed: ${build.stderr || build.stdout}`);
  }
  const bundle = fs.readFileSync(bundlePath, 'utf8');
  assert.ok(bridge.includes('cancelFetches'), 'bridge can cancel SW fetches');
  assert.ok(bridge.includes('cancelAll'), 'bridge can cancelAll active SW fetches');
  assert.ok(bridge.includes('signal'), 'bridge pass AbortSignal');
  assert.ok(host.includes('cancelAll: true') || host.includes('cancelAll:true'),
    'host abortOpenFetches uses cancelAll on sheet close');
  for (const [label, src] of [
    ['background.js', bg],
    ['background.bundle.js', bundle],
  ]) {
    assert.ok(
      src.includes('CANCEL_FETCH') && src.includes('activeFetchControllers'),
      `${label}: tracks and aborts in-flight GitHub fetches`
    );
    assert.ok(src.includes('beginTrackedFetch'), `${label}: wraps fetch with AbortSignal`);
    assert.ok(
      src.includes('preCancelledFetchIds') || src.includes('preCancelled'),
      `${label}: honors cancel that arrives before FETCH starts`
    );
    assert.ok(
      src.includes('cancelAllTrackedFetches') || src.includes('cancelAll'),
      `${label}: supports cancelAll of active fetches`
    );
    // CANCEL must not sit behind exclusive API queue
    const cancelIdx = src.indexOf('message.type === MSG.CANCEL_FETCH');
    const exclusiveIdx = src.indexOf(
      'runWithGithubApiExclusive(() => handleMessage(message))'
    );
    assert.ok(
      cancelIdx >= 0 && exclusiveIdx >= 0 && cancelIdx < exclusiveIdx,
      `${label}: CANCEL_FETCH branch checked before exclusive queue enqueue`
    );
  }
  assert.ok(
    bridge.includes('Promise.race') && bridge.includes('whenAborted'),
    'bridge unblocks on abort without waiting for full SW response'
  );
}

// First paint must be sync (list sketch) — no await before render()
assert.ok(
  /First paint is synchronous|First paint is done/.test(host),
  'openModal documents sync first paint'
);
assert.ok(
  host.includes('void refreshPrefs()') ||
    /void refreshPrefs\(\)/.test(host),
  'openModal does not await prefs before first paint'
);
// List-paint warm-up + CSS ready stamp
assert.ok(host.includes('function warmUp') || host.includes('warmUp()'), 'host warmUp API');
assert.ok(
  host.includes('stampHostCssReady') && host.includes('data-prp-css-ready'),
  'host stamps CSS ready so FOUC gate does not delay list sketch'
);
{
  const contentJs = fs.readFileSync(path.join(root, 'src/content.js'), 'utf8');
  assert.ok(
    contentJs.includes('warmModalAfterListPaint') ||
      contentJs.includes('warmUp'),
    'content warms modal after list paint'
  );
  const manifest = fs.readFileSync(path.join(root, 'manifest.json'), 'utf8');
  assert.ok(
    manifest.includes('pr-modal.css'),
    'manifest injects pr-modal.css with content_scripts (pre-click)'
  );
}
{
  const contentCss = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
  assert.ok(
    contentCss.includes('data-prp-css-ready') &&
      contentCss.includes('#prp-page-embed:not([data-prp-css-ready') &&
      contentCss.includes('#prp-modal-host:not([data-prp-css-ready'),
    'content CSS hides hosts until data-prp-css-ready'
  );
}
assert.ok(
  host.includes('data-prp-native-hidden') || host.includes('native-hidden'),
  'hides native main'
);

assert.ok(app.includes('isEmbed') || app.includes('presentation'), 'app embed');
assert.ok(app.includes('prp-shell--embed'), 'app embed shell class');
assert.ok(
  app.includes('showCloseChrome') || app.includes('isEmbed'),
  'app gates close chrome'
);

assert.ok(header.includes("presentation = 'modal'") || header.includes('isEmbed'));
assert.ok(header.includes('showClose'), 'header gates close');
assert.ok(header.includes('showShellToggle'), 'header gates shell toggle');
assert.ok(header.includes('showFullscreenToggle'), 'header gates fullscreen');

assert.ok(css.includes('prp-shell--embed'), 'embed CSS');
assert.ok(css.includes('prp-page-embed') || css.includes('#prp-page-embed'));

assert.ok(
  manifest.includes('page-embed.js'),
  'manifest loads pure page-embed before host'
);

console.log('page-embed.test.js: ok');
