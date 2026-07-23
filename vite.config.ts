import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, 'src/modal/dist');

/**
 * MV3 content-script modal: single IIFE + CSS, same paths as pre-Vite esbuild.
 * Prefer Vite for TSX/TS tree-shaking and React plugin-less esbuild transform.
 */
export default defineConfig({
  root,
  publicDir: false,
  resolve: {
    alias: {
      '@modal': path.join(root, 'src/modal'),
      '@lib': path.join(root, 'src/modal/lib'),
      '@common': path.join(root, 'src/modal/components/common'),
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    lib: {
      entry: path.join(root, 'src/modal/main.tsx'),
      name: 'PRPlusModal',
      formats: ['iife'],
      fileName: () => 'pr-modal.bundle.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'pr-modal.css';
          }
          return assetInfo.name || 'asset-[hash][extname]';
        },
      },
    },
    target: 'es2020',
    minify: 'esbuild',
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
});
