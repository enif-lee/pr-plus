/**
 * Verify pure content-script twins stay aligned with TypeScript SoT names.
 * Full codegen is optional; tests import lib/*.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pairs = [
  ['detail-store', ['fromAppDetail', 'toAppDetail', 'applyCorePayload', 'applyFiles']],
  ['load-progress', ['createWeightProgress', 'OPEN_PROGRESS_KEYS', 'FETCH_UNIT_WEIGHTS']],
];
for (const [name, keys] of pairs) {
  const ts = fs.readFileSync(path.join(root, 'src/modal/lib', `${name}.ts`), 'utf8');
  const pure = fs.readFileSync(path.join(root, 'src/modal/pure', `${name}.js`), 'utf8');
  if (!pure.includes('SOURCE OF TRUTH')) {
    console.warn(name, 'pure missing SoT header');
  }
  for (const k of keys) {
    if (!ts.includes(k)) throw new Error(`${name}.ts missing ${k}`);
    if (!pure.includes(k)) throw new Error(`${name}.js missing ${k}`);
  }
  console.log('pure/ts aligned:', name);
}
