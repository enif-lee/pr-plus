/**
 * Phase 5 gate: production paths must not write durable drop latches.
 * Allowed: comments that mention the symbol, sanitize stripping, tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';

const root = path.resolve(__dirname, '..');

const PROD_GLOBS = [
  'src/modal/lib',
  'src/modal/commands',
  'src/modal/app',
  'src/modal/hooks',
  'src/modal/store',
  'src/modal/views',
  'src/host/modules',
];

function walkTsFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTsFiles(p, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

describe('no-drop-pending-gate', () => {
  test('production src does not write _dropPending: true or forceDropPending', () => {
    const offenders: string[] = [];
    for (const rel of PROD_GLOBS) {
      for (const file of walkTsFiles(path.join(root, rel))) {
        const text = fs.readFileSync(file, 'utf8');
        // Strip line comments for a light false-positive filter
        const code = text
          .split('\n')
          .filter((ln) => !/^\s*\/\//.test(ln) && !/^\s*\*/.test(ln))
          .join('\n');
        if (/_dropPending\s*:\s*true/.test(code)) {
          offenders.push(`${path.relative(root, file)}:_dropPending:true`);
        }
        if (/forceDropPending/.test(code)) {
          offenders.push(`${path.relative(root, file)}:forceDropPending`);
        }
        if (/keepDropPending\s*[=:]/.test(code)) {
          offenders.push(`${path.relative(root, file)}:keepDropPending`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test('stripPendingReviewFromDetail does not set latch; null VPR is enough', () => {
    const {
      stripPendingReviewFromDetail,
    } = require('../src/modal/lib/composer-attach') as typeof import('../src/modal/lib/composer-attach');
    const stripped = stripPendingReviewFromDetail({
      owner: 'o',
      repo: 'r',
      number: 1,
      viewerPendingReview: { id: 9 },
      reviewComments: [
        { id: 1, pending: true, body: 'x', author: 'me' },
        { id: 2, pending: false, body: 'y', author: 'a' },
      ],
    });
    expect(stripped.viewerPendingReview).toBeNull();
    expect(stripped._dropPending).toBeUndefined();
    expect((stripped.reviewComments || []).map((c: any) => c.id)).toEqual([2]);
  });
});
