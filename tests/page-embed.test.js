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
  const trailing = parsePrPagePath('/octo/repo/pull/7/');
  assert.ok(trailing);
  assert.equal(trailing.page, 'conversation');
}

assert.equal(parsePrPagePath('/octo/repo/pull/1/commits'), null);
assert.equal(parsePrPagePath('/octo/repo/pull/1/checks'), null);
assert.equal(parsePrPagePath('/octo/repo/pulls'), null);
assert.equal(parsePrPagePath('/octo/repo'), null);
assert.equal(isPrEmbedTarget('/a/b/pull/9/files'), true);
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
assert.ok(
  host.includes('prp-page-embed') || host.includes('PAGE_EMBED_HOST_ID'),
  'embed host id'
);
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
