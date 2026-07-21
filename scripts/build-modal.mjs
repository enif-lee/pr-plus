import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'src', 'modal', 'dist');
fs.mkdirSync(outDir, { recursive: true });

const pureFiles = [
  'src/modal/pure/layout-mode.js',
  'src/modal/pure/virtual-range.js',
  'src/modal/pure/search-index.js',
  'src/modal/pure/diff-rows.js',
  'src/modal/pure/modal-state.js',
  'src/modal/pure/file-tree.js',
  'src/modal/pure/collapse.js',
  'src/modal/pure/comment-nav.js',
  'src/modal/pure/theme.js',
];

// Each pure module already assigns globalThis.* — wrap to avoid const collisions.
const pureBanner = pureFiles
  .map((f) => {
    const body = fs.readFileSync(path.join(root, f), 'utf8');
    return `;(function(){\n${body}\n})();`;
  })
  .join('\n');

const entry = path.join(root, 'src/modal/App.jsx');
const outfile = path.join(outDir, 'pr-modal.bundle.js');
const tmpEntry = path.join(outDir, '_entry.jsx');

const appSource = fs.readFileSync(entry, 'utf8');
// Source uses ReactDOM.createRoot for readability / non-bundled eval; the
// production IIFE gets esbuild-injected createRoot from react-dom/client.
const appFixed = appSource
  .replace(
    '/* global React, PRModalLayout, PRModalVirtual, PRModalSearch, PRModalDiffRows, PRModalFileTree, PRModalCollapse, PRModalCommentNav, PRModalTheme */\n/* global hljs, marked, DOMPurify */',
    `import React from 'react';
import { createRoot } from 'react-dom/client';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import markdown from 'highlight.js/lib/languages/markdown';
import bash from 'highlight.js/lib/languages/bash';
import python from 'highlight.js/lib/languages/python';
import yaml from 'highlight.js/lib/languages/yaml';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('python', python);
hljs.registerLanguage('yaml', yaml);
marked.setOptions({ gfm: true, breaks: true });
const PRModalLayout = globalThis.PRModalLayout;
const PRModalVirtual = globalThis.PRModalVirtual;
const PRModalSearch = globalThis.PRModalSearch;
const PRModalDiffRows = globalThis.PRModalDiffRows;
const PRModalFileTree = globalThis.PRModalFileTree;
const PRModalCollapse = globalThis.PRModalCollapse;
const PRModalCommentNav = globalThis.PRModalCommentNav;
const PRModalTheme = globalThis.PRModalTheme;`
  )
  .replace(/ReactDOM\.createRoot/g, 'createRoot');

fs.writeFileSync(
  tmpEntry,
  `${appFixed}\nglobalThis.PRModalApp = PrModalApp;\nglobalThis.mountPrModal = mountPrModal;\n`
);

await esbuild.build({
  entryPoints: [tmpEntry],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome109'],
  outfile,
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  banner: { js: pureBanner + '\n' },
});

fs.copyFileSync(
  path.join(root, 'src/modal/styles.css'),
  path.join(outDir, 'pr-modal.css')
);

try {
  fs.unlinkSync(tmpEntry);
} catch {
  /* ignore */
}

const size = fs.statSync(outfile).size;
console.log('Built', path.relative(root, outfile), `(${size} bytes)`);
console.log('Built', path.relative(root, path.join(outDir, 'pr-modal.css')));
