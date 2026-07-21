/**
 * Modal production build (TypeScript → Chromium content-script IIFE).
 *
 * - Entry: src/modal/main.tsx (views + zustand store + pure lib)
 * - Tooling: esbuild (charset:utf8, classic IIFE). Vite config remains for
 *   aliases/typecheck/dev; Edge mis-handles some multi-MB non-ASCII bundles.
 * - Mermaid is NOT inlined (keeps content script ~0.4MB). MermaidBlock uses
 *   globalThis.mermaid when present; otherwise shows a graceful placeholder.
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'src', 'modal', 'dist');
fs.mkdirSync(outDir, { recursive: true });

const entry = path.join(root, 'src/modal/main.tsx');
const outfile = path.join(outDir, 'pr-modal.bundle.js');
const cssOut = path.join(outDir, 'pr-modal.css');
const stub = path.join(outDir, '_mermaid-stub.js');

fs.writeFileSync(
  stub,
  `const api = (typeof globalThis !== 'undefined' && globalThis.mermaid) || {
  initialize() {},
  async render(id, code) {
    return { svg: '<pre class="prp-mermaid prp-mermaid--stub">' + String(code || '').replace(/</g,'&lt;') + '</pre>' };
  },
};
export default api;
`
);

// Remove prior artifacts except stub we just wrote
for (const f of fs.readdirSync(outDir)) {
  if (f === '_mermaid-stub.js') continue;
  fs.unlinkSync(path.join(outDir, f));
}

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
  loader: { '.tsx': 'tsx', '.ts': 'ts', '.css': 'css', '.jsx': 'jsx' },
  alias: {
    '@modal': path.join(root, 'src/modal'),
    '@lib': path.join(root, 'src/modal/lib'),
    '@common': path.join(root, 'src/modal/components/common'),
    mermaid: stub,
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  charset: 'utf8',
  legalComments: 'none',
  logLevel: 'info',
});

const sideCss = path.join(outDir, 'pr-modal.bundle.css');
const stylesSrc = path.join(root, 'src/modal/styles.css');
if (fs.existsSync(sideCss)) fs.renameSync(sideCss, cssOut);
else if (fs.existsSync(stylesSrc)) fs.copyFileSync(stylesSrc, cssOut);

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

// Drop stub from dist (not a content script)
try {
  fs.unlinkSync(stub);
} catch {
  /* ignore */
}

console.log('Built', path.relative(root, outfile), `(${fs.statSync(outfile).size} bytes)`);
if (fs.existsSync(cssOut)) console.log('Built', path.relative(root, cssOut));
