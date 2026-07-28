/**
 * Modal production build (TypeScript → Chromium content-script IIFE).
 *
 * - Entry: src/modal/main.tsx
 * - CSS: collected from TSX/TS `import './x.css'` in the esbuild graph,
 *   then PostCSS (import + Tailwind + autoprefixer) → dist/pr-modal.css
 * - Mermaid / hljs language packs: separate ESM chunks
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
const stylesDir = path.join(root, 'src', 'modal', 'styles');
fs.mkdirSync(outDir, { recursive: true });

const entry = path.join(root, 'src/modal/main.tsx');
const outfile = path.join(outDir, 'pr-modal.bundle.js');
const cssOut = path.join(outDir, 'pr-modal.css');
const mermaidOut = path.join(outDir, 'mermaid.esm.js');
const mermaidEntry = path.join(root, 'scripts/mermaid-entry.mjs');
const langCatalog = path.join(root, 'src/modal/hljs-languages.json');

// Clean dist (recreate)
for (const f of fs.readdirSync(outDir)) {
  const p = path.join(outDir, f);
  fs.rmSync(p, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(langsDir, { recursive: true });

/** Ordered CSS paths discovered via `import '…css'` from the JS graph. */
const cssImportOrder = [];
const cssImportSeen = new Set();

const collectCssPlugin = {
  name: 'collect-css-from-tsx',
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, (args) => {
      const abs = path.resolve(args.path);
      if (!cssImportSeen.has(abs)) {
        cssImportSeen.add(abs);
        cssImportOrder.push(abs);
      }
      // Keep CSS out of the IIFE; styles ship as content_scripts CSS file.
      return {
        contents: '/* css collected → pr-modal.css */',
        loader: 'js',
      };
    });
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
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
    '.css': 'css',
    '.jsx': 'jsx',
    '.json': 'json',
  },
  plugins: [collectCssPlugin],
  alias: {
    '@modal': path.join(root, 'src/modal'),
    '@lib': path.join(root, 'src/modal/lib'),
    '@common': path.join(root, 'src/modal/components/common'),
  },
  external: ['mermaid'],
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  charset: 'utf8',
  legalComments: 'none',
  logLevel: 'info',
});

// --- Build pr-modal.css from TSX-discovered CSS graph ---
{
  if (!cssImportOrder.length) {
    throw new Error(
      'No CSS imports found from main.tsx graph — expected at least styles/entry.css'
    );
  }

  // entry.css (tokens + @tailwind) first; other domain files follow discovery order
  const entryCss = path.join(stylesDir, 'entry.css');
  const ordered = [];
  const seen = new Set();
  const push = (abs) => {
    const n = path.normalize(abs);
    if (seen.has(n) || !fs.existsSync(n)) return;
    seen.add(n);
    ordered.push(n);
  };
  push(entryCss);
  for (const abs of cssImportOrder) {
    if (path.normalize(abs) === path.normalize(entryCss)) continue;
    push(abs);
  }

  // Synthetic entry lives under styles/ so postcss-import resolves relatives
  const synthetic = ordered
    .map((abs) => {
      let rel = path.relative(stylesDir, abs);
      if (!rel.startsWith('.')) rel = `./${rel}`;
      rel = rel.split(path.sep).join('/');
      return `@import "${rel}";`;
    })
    .join('\n');

  const syntheticPath = path.join(stylesDir, '.bundle-entry.css');
  fs.writeFileSync(syntheticPath, `${synthetic}\n`, 'utf8');

  let cssBytes = 0;
  try {
    const result = await postcss([
      postcssImport(),
      tailwindcss({ config: path.join(root, 'tailwind.config.js') }),
      autoprefixer(),
    ]).process(fs.readFileSync(syntheticPath, 'utf8'), {
      from: syntheticPath,
      to: cssOut,
    });
    fs.writeFileSync(cssOut, result.css);
    cssBytes = Buffer.byteLength(result.css);
  } finally {
    try {
      fs.unlinkSync(syntheticPath);
    } catch {
      /* ignore */
    }
  }

  console.log(
    'Built',
    path.relative(root, cssOut),
    `(${cssBytes} bytes, ${ordered.length} css modules from TSX graph)`
  );
  for (const abs of ordered) {
    console.log('  css:', path.relative(root, abs));
  }
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

// --- Lazy Mermaid ESM chunk ---
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
  logLevel: 'warning',
  mainFields: ['module', 'browser', 'main'],
  conditions: ['import', 'module', 'browser', 'default'],
});

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
