/**
 * Structural gate: parity inventory matches shipped present rows for
 * file-level comments, check details, hide-whitespace, viewed, delete branch.
 */
import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const parity = readFileSync(join(root, 'docs/github-pr-parity.md'), 'utf8');

function rowStatus(label: string): string | null {
  const re = new RegExp(
    `\\|\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|\\s*(\\w+)\\s*\\|`,
    'i'
  );
  const m = parity.match(re);
  return m ? m[1].toLowerCase() : null;
}

describe('github-pr-parity inventory', () => {
  test('file-level review comment is present', () => {
    expect(rowStatus('File-level review comment')).toBe('present');
    expect(parity).toMatch(/subject_type:\s*file|onFileHeaderComment/i);
  });
  test('open check details URL is present', () => {
    expect(rowStatus('Open check details URL')).toBe('present');
    expect(parity).toMatch(/DetailsLink/i);
  });
  test('hide whitespace is present', () => {
    expect(rowStatus('Hide whitespace')).toBe('present');
  });
  test('viewed server rows are present', () => {
    expect(rowStatus('Mark file Viewed')).toBe('present');
    expect(rowStatus('Viewed progress bar (server)')).toBe('present');
  });
  test('delete branch after merge is present', () => {
    expect(rowStatus('Delete branch after merge')).toBe('present');
  });
});

describe('shipped code paths exist', () => {
  test('hide-whitespace + file-viewed + delete-head-branch modules', () => {
    const hw = readFileSync(
      join(root, 'src/modal/lib/hide-whitespace.ts'),
      'utf8'
    );
    expect(hw).toMatch(/export function filterPatchHideWhitespace/);
    const fv = readFileSync(join(root, 'src/modal/lib/file-viewed.ts'), 'utf8');
    expect(fv).toMatch(/markFileAsViewed/);
    const del = readFileSync(
      join(root, 'src/modal/lib/delete-head-branch.ts'),
      'utf8'
    );
    expect(del).toMatch(/shouldShowDeleteHeadBranch/);
  });
  test('Diff toolbar exposes hide whitespace control', () => {
    const t = readFileSync(
      join(root, 'src/modal/views/chrome/DiffToolbar.tsx'),
      'utf8'
    );
    expect(t).toMatch(/hide_whitespace|data-prp-hide-whitespace/);
    expect(t).toMatch(/data-prp-hide-whitespace/);
  });
  test('MergeBox exposes delete head branch CTA', () => {
    const t = readFileSync(
      join(root, 'src/modal/views/conversation/MergeBox.tsx'),
      'utf8'
    );
    expect(t).toMatch(/data-prp-delete-head-branch/);
    expect(t).toMatch(/onDeleteHeadBranch/);
  });
  test('fetch-api exports delete + viewed APIs', () => {
    // fetch-api re-exports; implementations live in domain modules.
    const t = readFileSync(join(root, 'src/fetch/fetch-api.ts'), 'utf8');
    expect(t).toMatch(/\bdeleteHeadBranch\b/);
    expect(t).toMatch(/\bfetchViewerViewedPaths\b/);
    expect(t).toMatch(/\bmarkFileAsViewed\b/);
    const meta = readFileSync(join(root, 'src/fetch/mutations-meta.ts'), 'utf8');
    expect(meta).toMatch(/export async function deleteHeadBranch/);
    const viewer = readFileSync(join(root, 'src/fetch/viewer.ts'), 'utf8');
    expect(viewer).toMatch(/export async function fetchViewerViewedPaths/);
    expect(viewer).toMatch(/export async function markFileAsViewed/);
  });

  test('PrModalApp gates auto-close and viewed hydrate via shipped helpers', () => {
    const app = readFileSync(
      join(root, 'src/modal/app/PrModalShell.tsx'),
      'utf8'
    );
    expect(app).toMatch(/shouldAutoCloseOnTerminalTransition/);
    expect(app).toMatch(/shouldApplyServerViewedPaths/);
    // Must not blindly setViewedPaths from empty unauthorized stub
    expect(app).toMatch(/if \(!shouldApplyServerViewedPaths\(res\)\) return/);
  });
});
