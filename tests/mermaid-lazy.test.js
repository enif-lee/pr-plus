/**
 * Mermaid lazy loader + markdown segment wiring.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  splitMarkdownSegments,
  hasMermaidFence,
} = require('../src/modal/pure/markdown-composer.js');
const {
  mermaidChunkUrl,
  ensureMermaid,
  resolveMermaidTheme,
  resolveMermaidColorMode,
  unwrapMermaidModule,
  initMermaid,
  readMermaidInitConfig,
  MERMAID_THEME,
  MERMAID_LOOK,
  __resetMermaidLazyForTests,
} = require('../src/modal/lib/mermaid-lazy.ts');

// Segments
const md = 'Hello\n\n```mermaid\ngraph TD; A-->B;\n```\n\nAfter';
const segs = splitMarkdownSegments(md);
assert.ok(segs.some((s) => s.type === 'mermaid'));
assert.ok(segs.find((s) => s.type === 'mermaid').content.includes('graph TD'));
assert.equal(hasMermaidFence(md), true);
assert.equal(hasMermaidFence('no charts'), false);

// Optional space / info string after language
{
  const s2 = splitMarkdownSegments('``` mermaid title\nflowchart LR\n  X-->Y\n```');
  assert.equal(s2.filter((s) => s.type === 'mermaid').length, 1);
}

// Outside extension: no chrome.runtime → null URL
__resetMermaidLazyForTests();
assert.equal(mermaidChunkUrl(), null);

// Theme helpers: light → neutral, dark → dark; look always handDrawn
assert.ok(['neutral', 'dark'].includes(resolveMermaidTheme()));
assert.ok(['light', 'dark'].includes(resolveMermaidColorMode()));

// init config must request handDrawn + theme from resolveMermaidTheme
{
  const src = fs.readFileSync(
    path.join(root, 'src/modal/lib/mermaid-lazy.ts'),
    'utf8'
  );
  assert.ok(
    src.includes("MERMAID_LOOK = 'handDrawn'") ||
      src.includes('look: MERMAID_LOOK') ||
      src.includes("look: 'handDrawn'")
  );
  assert.ok(src.includes("look: MERMAID_LOOK") || src.includes("look: 'handDrawn'"));
  // theme is variable (neutral | dark), not forced base
  assert.ok(!/theme:\s*['"]base['"]/.test(src));
}

async function main() {
  __resetMermaidLazyForTests();
  delete globalThis.mermaid;
  const api = await ensureMermaid();
  assert.equal(api, null);

  // Nested default export unwrapping (esbuild interop)
  {
    const fake = {
      default: {
        default: {
          default: {
            render: async () => ({ svg: '<svg/>' }),
            initialize: () => {},
          },
        },
      },
    };
    const u = unwrapMermaidModule(fake);
    assert.equal(typeof u.render, 'function');
    assert.equal(typeof u.initialize, 'function');
  }

  const mmd = fs.readFileSync(
    path.join(root, 'src/modal/components/common/MermaidBlock.tsx'),
    'utf8'
  );
  assert.ok(mmd.includes('ensureMermaid'));
  assert.ok(mmd.includes('MermaidBlock'));
  // Must not use innerHTML on React-managed nodes with children
  assert.ok(mmd.includes('dangerouslySetInnerHTML'));
  assert.ok(!mmd.includes('innerHTML ='));

  const mdView = fs.readFileSync(
    path.join(root, 'src/modal/components/common/MarkdownView.tsx'),
    'utf8'
  );
  assert.ok(mdView.includes('MermaidBlock'));
  assert.ok(mdView.includes("seg.type === 'mermaid'"));

  const build = fs.readFileSync(path.join(root, 'scripts/build-modal.mjs'), 'utf8');
  assert.ok(build.includes('mermaid.esm.js'));
  assert.ok(build.includes('mermaid-entry.mjs'));

  const manifest = fs.readFileSync(path.join(root, 'manifest.json'), 'utf8');
  assert.ok(manifest.includes('mermaid.esm.js'));

  // Built artifact after npm run build:modal
  const chunk = path.join(root, 'src/modal/dist/mermaid.esm.js');
  assert.ok(fs.existsSync(chunk), 'mermaid.esm.js must be built');
  const st = fs.statSync(chunk);
  assert.ok(st.size > 50_000, `mermaid chunk should be substantial, got ${st.size}`);
  const text = fs.readFileSync(chunk, 'utf8');
  assert.ok(/mermaid|flowchart|graph/i.test(text), 'chunk looks like mermaid');

  // Main bundle must not inline full mermaid (stays lean)
  const bundle = fs.readFileSync(path.join(root, 'src/modal/dist/pr-modal.bundle.js'), 'utf8');
  assert.ok(bundle.includes('mermaid.esm') || bundle.includes('PRPMermaidLazy') || bundle.includes('ensureMermaid'));
  assert.ok(bundle.length < 2_000_000, 'main IIFE stays under ~2MB without inlined mermaid');

  // Live mermaid engine: initialize then read config back
  assert.equal(MERMAID_LOOK, 'handDrawn');
  {
    const { pathToFileURL } = require('node:url');
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(
      '<!doctype html><html><body><div class="prp-overlay" data-color-mode="light"></div></body></html>',
      { url: 'https://github.com/', pretendToBeVisual: true }
    );
    for (const k of [
      'window',
      'document',
      'HTMLElement',
      'SVGElement',
      'Element',
      'Node',
      'navigator',
    ]) {
      globalThis[k] = dom.window[k];
    }
    globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
    if (typeof globalThis.CSSStyleSheet === 'undefined') {
      globalThis.CSSStyleSheet = class {
        constructor() {
          this.cssRules = [];
        }
        insertRule() {
          return 0;
        }
      };
    }
    __resetMermaidLazyForTests();
    const url = pathToFileURL(chunk).href;
    const mod = await import(url);
    const eng = unwrapMermaidModule(mod);
    assert.ok(eng, 'unwrap mermaid engine');
    initMermaid(eng, 'neutral');
    let cfg = readMermaidInitConfig(eng);
    assert.equal(cfg.theme, 'neutral', `light theme must be neutral, got ${cfg.theme}`);
    assert.equal(cfg.look, 'handDrawn', `look must be handDrawn, got ${cfg.look}`);
    __resetMermaidLazyForTests();
    initMermaid(eng, 'dark');
    cfg = readMermaidInitConfig(eng);
    assert.equal(cfg.theme, 'dark', `dark theme must be dark, got ${cfg.theme}`);
    assert.equal(cfg.look, 'handDrawn');
    console.log('mermaid-runtime-theme-neutral=true');
    console.log('mermaid-runtime-theme-dark=true');
    console.log('mermaid-runtime-look-handDrawn=true');
  }

  console.log('mermaid-lazy.test.js: all assertions passed');
  console.log('mermaid-fence-split=true');
  console.log('mermaid-lazy-wiring=true');
  console.log(`mermaid-chunk-bytes=${st.size}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
