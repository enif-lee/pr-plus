/**
 * Typecheck classic content-script SoT entries.
 * Isolated per file to avoid false redeclare across separate runtime scopes.
 * Uses the entries tsconfig (strict / noImplicitAny) plus the real SoT
 * modules — not one-line pointer files.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const r = spawnSync(
  'npx',
  ['tsc', '--noEmit', '-p', 'tsconfig.entries.json', '--pretty', 'false'],
  { cwd: root, encoding: 'utf8' }
);
const out = (r.stdout || '') + (r.stderr || '');
process.stdout.write(out);
if (r.status !== 0) {
  console.error('typecheck-entries: failed');
  process.exit(r.status || 1);
}
console.log('typecheck-entries: all ok');
