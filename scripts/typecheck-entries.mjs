/**
 * Typecheck each classic content-script entry in isolation
 * (they share no runtime scope; a combined project causes false redeclare).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const entries = [
  'src/tree.ts',
  'src/dom.ts',
  'src/content.ts',
  'src/content-bootstrap.ts',
  'src/content-bridge.ts',
  'src/popup.ts',
  'src/storage.ts',
  'src/github-endpoints.ts',
  'src/pr-list-focus.ts',
  'src/pulls-palette.ts',
];

let failed = 0;
for (const rel of entries) {
  const r = spawnSync(
    'npx',
    [
      'tsc',
      '--noEmit',
      '--ignoreConfig',
      '--strict',
      'false',
      '--noImplicitAny',
      'false',
      '--skipLibCheck',
      '--module',
      'ESNext',
      '--moduleResolution',
      'bundler',
      '--target',
      'ES2020',
      '--lib',
      'ES2020,DOM,DOM.Iterable',
      '--types',
      'chrome',
      '--moduleDetection',
      'legacy',
      path.join(root, 'src/extension-globals.d.ts'),
      path.join(root, 'src/entries-shim.d.ts'),
      path.join(root, rel),
    ],
    { cwd: root, encoding: 'utf8' }
  );
  const out = (r.stdout || '') + (r.stderr || '');
  const errors = out.split('\n').filter((l) => /error TS\d+/.test(l));
  const entryErrs = errors.filter(
    (l) => l.includes(rel) || l.includes(path.basename(rel))
  );
  if (entryErrs.length) {
    console.error(`FAIL ${rel}`);
    console.error(entryErrs.slice(0, 20).join('\n'));
    failed++;
  } else if (r.status !== 0 && errors.length) {
    console.error(`FAIL ${rel} (status ${r.status})`);
    console.error(errors.slice(0, 15).join('\n'));
    failed++;
  } else {
    console.log(`ok ${rel}`);
  }
}
if (failed) {
  console.error(`typecheck-entries: ${failed} failed`);
  process.exit(1);
}
console.log('typecheck-entries: all ok');
