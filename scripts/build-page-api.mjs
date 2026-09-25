/**
 * Classic IIFE scripts for MAIN/isolated PRPlus, Linear partner boot, shell boot.
 */
import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// PRPlus.version / ping().version track the shipped manifest.
const { version } = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));

const entries = [
  {
    entry: path.join(root, 'src/page-api/prplus-main.ts'),
    outfile: path.join(root, 'src/page-api/prplus-main.js'),
  },
  {
    entry: path.join(root, 'src/page-api/prplus-isolated.ts'),
    outfile: path.join(root, 'src/page-api/prplus-isolated.js'),
  },
  {
    entry: path.join(root, 'src/partner/mark-runtime.ts'),
    outfile: path.join(root, 'src/partner/mark-runtime.js'),
  },
  {
    entry: path.join(root, 'src/partner/partner.ts'),
    outfile: path.join(root, 'src/partner/partner.js'),
  },
  {
    entry: path.join(root, 'src/shell/shell.ts'),
    outfile: path.join(root, 'src/shell/shell.js'),
  },
];

for (const { entry, outfile } of entries) {
  await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    logLevel: 'warning',
    define: { __PRP_VERSION__: JSON.stringify(version) },
  });
  console.log('wrote', path.relative(root, outfile));
}
