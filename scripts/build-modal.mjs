/**
 * Modal production build (TypeScript → Chromium content-script IIFE).
 *
 * - Entry: src/modal/main.tsx (views + zustand store + pure lib)
 * - Tooling: esbuild (charset:utf8, classic IIFE). Vite config remains for
 *   aliases/typecheck/dev; Edge mis-handles some multi-MB non-ASCII bundles.
 * - Mermaid is a separate ESM chunk (dist/mermaid.esm.js), lazy-imported on
 *   first ```mermaid fence via chrome.runtime.getURL (keeps main IIFE small).
 * - highlight.js language grammars are separate ESM chunks under
 *   dist/hljs-langs/<id>.js (lazy import via chrome.runtime.getURL).
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import postcssImport from 'postcss-import';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'src', 'modal', 'dist');
const langsDir = path.join(outDir, 'hljs-langs');
fs.mkdirSync(outDir, { recursive: true });

const entry = path.join(root, 'src/modal/main.tsx');
const outfile = path.join(outDir, 'pr-modal.bundle.js');
const cssOut = path.join(outDir, 'pr-modal.css');
const mermaidOut = path.join(outDir, 'mermaid.esm.js');
const mermaidEntry = path.join(root, 'scripts/mermaid-entry.mjs');
const langCatalog = path.join(root, 'src/modal/hljs-languages.json');
const cssEntry = path.join(root, 'src/modal/styles/index.css');

// Clean dist (recreate)
for (const f of fs.readdirSync(outDir)) {
  const p = path.join(outDir, f);
  fs.rmSync(p, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(langsDir, { recursive: true });

// CSS is processed separately (Tailwind + residual imports). Strip CSS from JS bundle.
const externalCssPlugin = {
  name: 'external-css',
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, () => ({
      contents: '/* styles emitted via postcss → pr-modal.css */',
      loader: 'js',
    }));
  },
};

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [entry],
  bundle: true,
  outfile,
  format: 'iife',
  globalName: 'PRPlusModal',
  platform: 'browser',
  target: ['chrome110', 'edge110'],
  jsx: 'automatic',
  jsxImportSource: 'react',
  loader: { '.tsx': 'tsx', '.ts': 'ts', '.css': 'css', '.jsx': 'jsx', '.json': 'json' },
  plugins: [externalCssPlugin],
  alias: {
    '@modal': path.join(root, 'src/modal'),
    '@lib': path.join(root, 'src/modal/lib'),
    '@common': path.join(root, 'src/modal/components/common'),
  },
  // Mermaid must not enter the main IIFE — loaded as dist/mermaid.esm.js
  external: ['mermaid'],
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  charset: 'utf8',
  legalComments: 'none',
  logLevel: 'info',
});

// Tailwind base + residual design system CSS
{
  const cssIn = fs.readFileSync(cssEntry, 'utf8');
  const result = await postcss([
    postcssImport(),
    tailwindcss({ config: path.join(root, 'tailwind.config.js') }),
    autoprefixer(),
  ]).process(cssIn, { from: cssEntry, to: cssOut });
  fs.writeFileSync(cssOut, result.css);
  console.log(
    'Built',
    path.relative(root, cssOut),
    `(${Buffer.byteLength(result.css)} bytes, tailwind+residual)`
  );
}

// Pure-ASCII JS for Chromium content-script encoding checks
let text = fs.readFileSync(outfile, 'utf8');
if (/[^\x00-\x7F]/.test(text)) {
  text = text.replace(/[^\x00-\x7F]/g, (ch) => {
    const cp = ch.codePointAt(0);
    if (cp > 0xffff) {
      const sub = cp - 0x10000;
      const hi = 0xd800 + (sub >> 10);
      const lo = 0xdc00 + (sub & 0x3ff);
      return `\\u${hi.toString(16)}\\u${lo.toString(16)}`;
    }
    return `\\u${cp.toString(16).padStart(4, '0')}`;
  });
  fs.writeFileSync(outfile, text, 'utf8');
}

// --- Lazy hljs language ESM chunks ---
const langIds = JSON.parse(fs.readFileSync(langCatalog, 'utf8'));
if (!Array.isArray(langIds) || !langIds.length) {
  throw new Error('src/modal/hljs-languages.json must be a non-empty array');
}
fs.mkdirSync(langsDir, { recursive: true });

const langEntryPoints = {};
for (const id of langIds) {
  const name = String(id);
  // Virtual entry: re-export the grammar as default for dynamic import()
  const entryFile = path.join(langsDir, `_${name}.entry.js`);
  fs.writeFileSync(
    entryFile,
    `export { default } from "highlight.js/lib/languages/${name}";\n`,
    'utf8'
  );
  langEntryPoints[name] = entryFile;
}

await esbuild.build({
  absWorkingDir: root,
  entryPoints: langEntryPoints,
  bundle: true,
  format: 'esm',
  outdir: langsDir,
  entryNames: '[name]',
  platform: 'browser',
  target: ['chrome110', 'edge110'],
  minify: true,
  charset: 'utf8',
  legalComments: 'none',
  logLevel: 'warning',
});

// Remove temporary entry stubs; keep only final <id>.js chunks
for (const id of langIds) {
  const entryFile = path.join(langsDir, `_${id}.entry.js`);
  try {
    fs.unlinkSync(entryFile);
  } catch {
    /* ignore */
  }
}

const builtLangs = fs
  .readdirSync(langsDir)
  .filter((f) => f.endsWith('.js') && !f.startsWith('_'));
if (builtLangs.length !== langIds.length) {
  console.warn(
    `hljs-langs: expected ${langIds.length} chunks, found ${builtLangs.length}`
  );
}

// --- Lazy Mermaid ESM chunk (first ```mermaid fence triggers import) ---
await esbuild.build({
  absWorkingDir: root,
  entryPoints: [mermaidEntry],
  bundle: true,
  outfile: mermaidOut,
  format: 'esm',
  platform: 'browser',
  target: ['chrome110', 'edge110'],
  minify: true,
  charset: 'utf8',
  legalComments: 'none',
  // mermaid pulls some node-ish optional deps; mark common ones external/empty
  logLevel: 'warning',
  // Avoid "Dynamic require" blows; mermaid is ESM-friendly in modern builds
  mainFields: ['module', 'browser', 'main'],
  conditions: ['import', 'module', 'browser', 'default'],
});

// Pure-ASCII for mermaid chunk too (content-script / extension encoding)
if (fs.existsSync(mermaidOut)) {
  let mText = fs.readFileSync(mermaidOut, 'utf8');
  if (/[^\x00-\x7F]/.test(mText)) {
    mText = mText.replace(/[^\x00-\x7F]/g, (ch) => {
      const cp = ch.codePointAt(0);
      if (cp > 0xffff) {
        const sub = cp - 0x10000;
        const hi = 0xd800 + (sub >> 10);
        const lo = 0xdc00 + (sub & 0x3ff);
        return `\\u${hi.toString(16)}\\u${lo.toString(16)}`;
      }
      return `\\u${cp.toString(16).padStart(4, '0')}`;
    });
    fs.writeFileSync(mermaidOut, mText, 'utf8');
  }
}

console.log('Built', path.relative(root, outfile), `(${fs.statSync(outfile).size} bytes)`);
if (fs.existsSync(cssOut)) console.log('Built', path.relative(root, cssOut));
console.log(
  'Built',
  path.relative(root, langsDir),
  `(${builtLangs.length} language chunks)`
);
if (fs.existsSync(mermaidOut)) {
  console.log(
    'Built',
    path.relative(root, mermaidOut),
    `(${fs.statSync(mermaidOut).size} bytes)`
  );
}
