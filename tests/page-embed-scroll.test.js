/**
 * Pure + structural tests for embed scroll chaining, footer hide, restore chrome.
 * Drives shipped page-embed helpers (not a re-implementation).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const {
  isEmbedPresentation,
  embedShellChromeFlags,
  shouldShowEmbedChrome,
  routeEmbedWheelScroll,
  applyEmbedWheelScroll,
  applyFooterHide,
  restoreFooters,
  matchGithubFooterNodes,
  resolveEmbedShortcutAction,
  embedGlobalScrollMax,
  EMBED_RESTORE_SHORTCUT,
  PAGE_EMBED_FOOTER_HIDDEN_ATTR,
  PAGE_EMBED_ACTIVE_CLASS,
  PAGE_EMBED_HEADER_OFFSET_PX,
  PAGE_EMBED_HOST_HEIGHT_CSS,
} = require('../src/modal/lib/page-embed.ts');

const {
  resolveModalShortcutAction,
} = require('../src/modal/lib/shortcut-policy.ts');

// --- (a) embed-only chrome / restore flag ---
const flags = embedShellChromeFlags();
assert.equal(flags.showRestoreNative, true);
assert.equal(flags.showClose, false);
assert.equal(shouldShowEmbedChrome('embed', 'restoreNative'), true);
assert.equal(shouldShowEmbedChrome('modal', 'restoreNative'), false);
assert.equal(shouldShowEmbedChrome('embed', 'close'), false);
assert.equal(isEmbedPresentation('embed'), true);

// --- (b) scroll routing: global first, then panel ---
{
  // Down: global has room → all global
  const r = routeEmbedWheelScroll({
    deltaY: 100,
    globalScrollTop: 0,
    globalScrollMax: 200,
    panelScrollTop: 0,
    panelScrollMax: 500,
  });
  assert.equal(r.globalDelta, 100);
  assert.equal(r.panelDelta, 0);
  assert.equal(r.preventDefault, true);
}

{
  // Down: global exhausted mid-delta → remainder to panel
  const r = routeEmbedWheelScroll({
    deltaY: 100,
    globalScrollTop: 180,
    globalScrollMax: 200,
    panelScrollTop: 0,
    panelScrollMax: 500,
  });
  assert.equal(r.globalDelta, 20);
  assert.equal(r.panelDelta, 80);
}

{
  // Down: global at max → all panel
  const r = routeEmbedWheelScroll({
    deltaY: 50,
    globalScrollTop: 200,
    globalScrollMax: 200,
    panelScrollTop: 10,
    panelScrollMax: 100,
  });
  assert.equal(r.globalDelta, 0);
  assert.equal(r.panelDelta, 50);
}

{
  // Up: global first (reduce global scrollTop)
  const r = routeEmbedWheelScroll({
    deltaY: -80,
    globalScrollTop: 50,
    globalScrollMax: 200,
    panelScrollTop: 40,
    panelScrollMax: 100,
  });
  assert.equal(r.globalDelta, -50); // only 50 room on global
  assert.equal(r.panelDelta, -30);
}

{
  // apply to mock elements — global has 40 room (scrollTop 10, max 50)
  const globalEl = { scrollTop: 10, scrollHeight: 150, clientHeight: 100 }; // max 50
  const panelEl = { scrollTop: 0, scrollHeight: 300, clientHeight: 100 }; // max 200
  const r = applyEmbedWheelScroll({
    deltaY: 50,
    globalEl,
    panelEl,
  });
  assert.equal(r.globalDelta, 40);
  assert.equal(r.panelDelta, 10);
  assert.equal(globalEl.scrollTop, 50);
  assert.equal(panelEl.scrollTop, 10);
}

// Modal must not use embed scroll policy implicitly
assert.equal(isEmbedPresentation('modal'), false);

// --- layout: full-window cover (height = viewport; GH header covered) ---
assert.equal(PAGE_EMBED_HOST_HEIGHT_CSS, '100vh');
assert.equal(PAGE_EMBED_HEADER_OFFSET_PX, 64);
{
  // Shipped policy: fixed full-window cover → no document scroll room
  const covered = embedGlobalScrollMax({
    viewportHeight: 800,
    headerOffset: 64,
    embedHeight: 800,
    footerHeight: 0,
  });
  assert.equal(covered, 0, 'cover-header layout has global scrollMax 0');

  // Legacy flow (coverHeader:false) still computable for tests
  const legacy = embedGlobalScrollMax({
    viewportHeight: 800,
    headerOffset: PAGE_EMBED_HEADER_OFFSET_PX,
    footerHeight: 0,
    coverHeader: false,
  });
  assert.equal(legacy, PAGE_EMBED_HEADER_OFFSET_PX);

  // calc(100vh - header) still zeros when coverHeader false
  const broken = embedGlobalScrollMax({
    viewportHeight: 800,
    headerOffset: 64,
    embedHeight: 800 - 64,
    footerHeight: 0,
    coverHeader: false,
  });
  assert.equal(broken, 0, 'legacy calc(100vh-header) zeros global max');
}

// Fixture: fixed cover → panel owns first wheel (global max 0)
{
  const VH = 900;
  const HEADER = PAGE_EMBED_HEADER_OFFSET_PX;
  const dom = new JSDOM(
    `<!doctype html>
    <html class="${PAGE_EMBED_ACTIVE_CLASS}">
      <body>
        <header class="AppHeader" style="height:${HEADER}px">GH</header>
        <div class="application-main prp-embed-main">
          <div id="prp-page-embed" class="prp-page-embed" style="height:${VH}px;min-height:${VH}px"></div>
        </div>
        <footer class="footer" id="footer" style="height:120px">Footer</footer>
      </body>
    </html>`,
    { pretendToBeVisual: true }
  );
  const doc = dom.window.document;
  const gMax = embedGlobalScrollMax({
    viewportHeight: VH,
    headerOffset: HEADER,
    embedHeight: VH,
    footerHeight: 0,
  });
  assert.equal(gMax, 0, 'full-window cover: no global scroll room');

  const hidden = applyFooterHide(doc);
  assert.ok(hidden >= 1);
  const footer = doc.getElementById('footer');
  assert.equal(footer.getAttribute(PAGE_EMBED_FOOTER_HIDDEN_ATTR), '1');

  // First wheel from top — panel receives all delta (header covered, not scrolled)
  const globalEl = {
    scrollTop: 0,
    scrollHeight: VH,
    clientHeight: VH,
  };
  const panelEl = {
    scrollTop: 0,
    scrollHeight: 2000,
    clientHeight: 600,
  };
  const r = applyEmbedWheelScroll({
    deltaY: 40,
    globalEl,
    panelEl,
  });
  assert.equal(r.globalDelta, 0, 'global unused under full-window cover');
  assert.equal(r.panelDelta, 40, 'panel takes first wheel');
  assert.equal(panelEl.scrollTop, 40);

  const contentCss = fs.readFileSync(
    path.join(__dirname, '../src/styles.css'),
    'utf8'
  );
  const modalCss = fs.readFileSync(
    path.join(__dirname, '../src/modal/styles.css'),
    'utf8'
  );
  assert.ok(
    /position:\s*fixed/.test(contentCss) && contentCss.includes('prp-page-embed'),
    'content CSS embed host is position:fixed'
  );
  // Host must not require mounting inside application-main (transform trap)
  const hostSrc = fs.readFileSync(
    path.join(__dirname, '../src/pr-modal-host.js'),
    'utf8'
  );
  assert.ok(
    hostSrc.includes('document.body') &&
      hostSrc.includes('ensureEmbedHost') &&
      /mountParent\s*=\s*document\.body/.test(hostSrc),
    'ensureEmbedHost mounts on document.body (avoids GH transform trap)'
  );
  assert.ok(
    /#prp-page-embed[\s\S]{0,400}height:\s*100vh/.test(contentCss) ||
      /\.prp-page-embed[\s\S]{0,400}height:\s*100vh/.test(contentCss),
    'content CSS embed height 100vh'
  );
  assert.ok(
    /height:\s*100dvh/.test(contentCss) && contentCss.includes('prp-page-embed'),
    'content CSS also sets 100dvh for mobile viewport'
  );
  assert.ok(
    !/#prp-page-embed[\s\S]{0,120}height:\s*calc\(\s*100vh\s*-\s*var\(--prp-embed-header-offset/.test(
      contentCss
    ),
    'content CSS must not use calc(100vh - header) for embed host'
  );
  assert.ok(
    /position:\s*fixed/.test(modalCss) && modalCss.includes('prp-page-embed'),
    'modal CSS embed host is position:fixed'
  );
  assert.ok(
    contentCss.includes('AppHeader') &&
      contentCss.includes('visibility: hidden'),
    'content CSS hides GH AppHeader under cover'
  );
  assert.ok(
    /overflow:\s*hidden\s*!important/.test(contentCss) &&
      contentCss.includes('prp-embed-active'),
    'document scroll locked while embed covers window'
  );
}

// --- (c) footer hide / restore on fixture DOM ---
{
  const dom = new JSDOM(`<!doctype html>
    <html><body>
      <div class="application-main"><main>content</main></div>
      <footer class="footer" id="footer">GitHub Footer</footer>
      <div class="prp-page-embed"><footer class="footer">inside embed skip</footer></div>
    </body></html>`);
  const doc = dom.window.document;
  const before = matchGithubFooterNodes(doc);
  assert.ok(before.length >= 1, 'matches GH footer');
  const hidden = applyFooterHide(doc);
  assert.ok(hidden >= 1);
  const ghFooter = doc.querySelector('body > footer.footer, #footer');
  assert.ok(ghFooter);
  assert.equal(ghFooter.getAttribute(PAGE_EMBED_FOOTER_HIDDEN_ATTR), '1');
  assert.ok(
    /none/i.test(ghFooter.style.display || ''),
    'footer display none'
  );
  // embed-internal footer not marked (or if matched, still ok if skipped by closest)
  const restored = restoreFooters(doc);
  assert.ok(restored >= 1);
  assert.equal(ghFooter.getAttribute(PAGE_EMBED_FOOTER_HIDDEN_ATTR), null);
}

// --- shortcut ---
assert.equal(
  resolveEmbedShortcutAction({
    mod: true,
    shift: true,
    key: 'e',
    presentation: 'embed',
  }),
  'restoreNativeView'
);
assert.equal(
  resolveEmbedShortcutAction({
    mod: true,
    shift: true,
    key: 'e',
    presentation: 'modal',
  }),
  null
);
assert.equal(
  resolveModalShortcutAction({
    mod: true,
    shift: true,
    key: 'e',
    presentation: 'embed',
    isEmbed: true,
  }),
  'restoreNativeView'
);
assert.equal(
  resolveModalShortcutAction({
    mod: true,
    shift: true,
    key: 'e',
    presentation: 'modal',
  }),
  null
);
assert.equal(EMBED_RESTORE_SHORTCUT.key, 'e');

// --- structural ---
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
const conv = fs.readFileSync(
  path.join(root, 'src/modal/views/conversation/ConversationView.tsx'),
  'utf8'
);
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');

assert.ok(host.includes('hideGithubFooter') || host.includes('applyFooterHide'));
assert.ok(host.includes('restoreGithubFooter') || host.includes('restoreFooters'));
assert.ok(host.includes('onRestoreNative') || host.includes('restoreNativeView'));
assert.ok(app.includes('restoreNativeView') || app.includes('onRestoreNative'));
assert.ok(app.includes('showRestoreNativeChrome') || app.includes('onRestoreNative'));
assert.ok(header.includes('onRestoreNative') || header.includes('showRestoreNative'));
assert.ok(header.includes('IconMarkGithub') || header.includes('restore-native'));
assert.ok(conv.includes('applyEmbedWheelScroll'));
assert.ok(conv.includes('embedScrollChain') || conv.includes('presentation'));
assert.ok(
  css.includes(PAGE_EMBED_FOOTER_HIDDEN_ATTR) ||
    css.includes('data-prp-footer-hidden') ||
    css.includes('prp-embed-active')
);
assert.ok(PAGE_EMBED_ACTIVE_CLASS === 'prp-embed-active');

console.log('page-embed-scroll.test.js: ok');
