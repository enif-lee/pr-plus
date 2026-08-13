/**
 * Assemble pr-modal-host.js from TypeScript host modules (SoT).
 * Modules cut only at top-level function / stable constant boundaries.
 * Edit src/host/modules/*.ts — then: npm run build:host
 *
 * Order is semantic domain, not numeric prefixes (see MODULE_ORDER).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleTsParts } from './assemble-ts-parts.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const modulesDir = path.join(root, 'src/host/modules');
const out = path.join(root, 'src/pr-modal-host.js');

/**
 * Classic IIFE assembly order — by domain responsibility.
 * Keep ≤~1500 lines per file; refine domains rather than mid-expression cuts.
 */
export const HOST_MODULE_ORDER = [
  'host-core-authority.ts',
  'host-core-store.ts',
  'host-core-timeline-a.ts',
  'host-core-timeline-b.ts',
  'side-fetch-kick.ts',
  'side-fetch-progress.ts',
  'side-fetch-cache-assets.ts',
  'detail-on-patch.ts',
  'props-build.ts',
  'props-render-close.ts',
  'open-modal-run.ts',
  'open-modal.ts',
  'restore-embed-list-focus.ts',
  'list-row-lifecycle.ts',
  'pulls-palette-state.ts',
  'pulls-palette-render.ts',
  'pulls-palette-keys.ts',
  'auto-refresh-watch.ts',
  'click-intercept.ts',
];

// Validate starts + line budget
for (const f of HOST_MODULE_ORDER) {
  const full = path.join(modulesDir, f);
  if (!fs.existsSync(full)) {
    console.error('Missing host module in MODULE_ORDER:', f);
    process.exit(1);
  }
  const body = fs.readFileSync(full, 'utf8');
  const first = body
    .split(/\n/)
    .map((l) => l.trim())
    .find(
      (l) =>
        l &&
        !l.startsWith('//') &&
        !l.startsWith('/*') &&
        !l.startsWith('*')
    );
  if (
    first &&
    (/^[.)\]},]/.test(first) ||
      first.startsWith('.catch') ||
      first.startsWith('.then') ||
      first.startsWith('catch') ||
      first.startsWith('then('))
  ) {
    console.error('Invalid module start in', f, ':', first.slice(0, 60));
    process.exit(1);
  }
  const n = body.split(/\n/).length;
  if (n > 1500) console.warn('WARN', f, 'has', n, 'lines (>1500)');
}

const listed = new Set(HOST_MODULE_ORDER);
const onDisk = fs
  .readdirSync(modulesDir)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
const missingFromOrder = onDisk.filter((f) => !listed.has(f));
if (missingFromOrder.length) {
  console.error(
    'HOST_MODULE_ORDER incomplete; unlisted modules:',
    missingFromOrder.join(', ')
  );
  process.exit(1);
}

const result = await assembleTsParts({
  partsDir: modulesDir,
  outFile: out,
  partsOrder: HOST_MODULE_ORDER,
  banner: `/**
 * Content-script host: intercept PR list clicks, mount React modal overlay.
 * AUTO-GENERATED from src/host/modules/*.ts (semantic domain modules).
 * SOURCE OF TRUTH: TypeScript modules — npm run build:host
 * Order: ${HOST_MODULE_ORDER.map((f) => f.replace(/\\.ts$/, '')).join(' → ')}
 */`,
  wrap: (body) => `(function initPrModalHost() {\n${body}\n})();`,
});

console.log(
  'Built',
  path.relative(root, out),
  `(${result.parts.length} modules, ${result.lines} lines)`
);
for (const f of result.parts) console.log(`  ${f}`);
