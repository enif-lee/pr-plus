/**
 * Pure rename / move (+0 −0) is kept out of the Diff list, file tree and
 * file nav. Renames with content changes, binaries and images stay.
 * Fixtures mirror real GitHub REST `pulls/files` payloads.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildNestedFileTree,
  filterFilesExcludePureRenames,
  filesInTreeOrder,
  isPureRenameFile,
  listFileExtensions,
} from '../src/modal/lib/file-tree.ts';
import { flattenFilesToVirtualRows } from '../src/modal/lib/diff-rows-core';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const pureRename = {
  filename: 'src/utils/moved.ts',
  previous_filename: 'src/helpers/old.ts',
  status: 'renamed',
  additions: 0,
  deletions: 0,
  changes: 0,
};
// Real payload from enif-lee/pr-plus commit 898b09d (rename + small edit).
const renameWithEdit = {
  filename: 'src/modal/components/common/ShortcutHint.tsx',
  previous_filename: 'src/modal/components/common/OptBtnHint.tsx',
  status: 'renamed',
  additions: 2,
  deletions: 2,
  changes: 4,
  patch: '@@ -1 +1 @@\n-a\n+b',
};
const image = {
  filename: 'screenshots/01-conversation-detail.png',
  status: 'added',
  additions: 0,
  deletions: 0,
  changes: 0,
};
const binary = {
  filename: 'tests/assets/sample.bin',
  status: 'added',
  additions: 0,
  deletions: 0,
  changes: 0,
};
const modified = {
  filename: 'src/app.ts',
  status: 'modified',
  additions: 3,
  deletions: 1,
  changes: 4,
  patch: '@@ -1 +1,3 @@\n-a\n+b\n+c\n+d',
};

describe('isPureRenameFile', () => {
  test('renamed with +0 −0 is pure', () => {
    expect(isPureRenameFile(pureRename)).toBe(true);
  });

  test('renamed with content changes is not pure (GitHub shows its diff)', () => {
    expect(isPureRenameFile(renameWithEdit)).toBe(false);
  });

  test('non-rename +0 −0 files are not pure renames', () => {
    expect(isPureRenameFile(image)).toBe(false);
    expect(isPureRenameFile(binary)).toBe(false);
  });

  test('status is matched case-insensitively (GraphQL-style enum)', () => {
    expect(isPureRenameFile({ ...pureRename, status: 'RENAMED' })).toBe(true);
  });
});

describe('filterFilesExcludePureRenames', () => {
  test('drops only the pure rename; keeps edit-rename, image, binary, modified', () => {
    const out = filterFilesExcludePureRenames([
      pureRename,
      renameWithEdit,
      image,
      binary,
      modified,
    ]);
    expect(out.map((f: any) => f.filename)).toEqual([
      renameWithEdit.filename,
      image.filename,
      binary.filename,
      modified.filename,
    ]);
  });

  test('non-array input → []', () => {
    expect(filterFilesExcludePureRenames(null)).toEqual([]);
  });
});

describe('Diff list / tree after excluding pure renames', () => {
  const files = filterFilesExcludePureRenames([pureRename, renameWithEdit, modified]);

  test('file tree has no node for the pure rename', () => {
    const paths: string[] = [];
    const walk = (nodes: any[]) => {
      for (const n of nodes) {
        if (n.type === 'file') paths.push(n.path);
        else walk(n.children || []);
      }
    };
    walk(buildNestedFileTree(filesInTreeOrder(files)));
    expect(paths).not.toContain(pureRename.filename);
    expect(paths).toContain(renameWithEdit.filename);
  });

  test('virtual rows carry old → new path for a rename with edits', () => {
    const rows = flattenFilesToVirtualRows(files, 'unified', {});
    const header = rows.find((r: any) => r.kind === 'file-header');
    expect(header.filePath).toBe(renameWithEdit.filename);
    expect(header.previousFilePath).toBe(renameWithEdit.previous_filename);
  });

  test('non-rename header has no previous path', () => {
    const rows = flattenFilesToVirtualRows([modified], 'unified', {});
    expect(rows.find((r: any) => r.kind === 'file-header').previousFilePath).toBeNull();
  });
});

describe('wiring (source gates)', () => {
  test('PrModalShell derives one eligible Diff list from annotated files + thread counts', () => {
    const shell = fs.readFileSync(
      path.join(root, 'src/modal/app/PrModalShell.tsx'),
      'utf8'
    );
    expect(shell).toMatch(
      /const diffEligibleFiles = useMemo\(\s*\(\) => filterFilesExcludePureRenames\(annotatedFiles, threadCounts\)/
    );
    const body = shell.slice(
      shell.indexOf('const displayFiles = useMemo(() => {'),
      shell.indexOf('const displayFiles = useMemo(() => {') + 600
    );
    // Eligible list feeds name/ext/unread/commented filters, then tree order.
    expect(body).toMatch(/filterFilesByExtensions\(diffEligibleFiles, fileExtFilter\)/);
    expect(body).not.toMatch(/annotatedFiles/);
    // Badges + ext chips share the same list, so counts and chips agree with Diff.
    expect(shell).toMatch(/for \(const f of diffEligibleFiles\)/);
    expect(shell).toMatch(/const reviewScopedFiles = diffEligibleFiles/);
  });

  test('pure rename with a review thread stays visible in Diff rows and nav', () => {
    const commented = { ...pureRename, filename: 'src/utils/renamed-with-thread.ts' };
    const threadCounts = new Map([[commented.filename, 1]]);
    const eligible = filterFilesExcludePureRenames([pureRename, commented, modified], threadCounts);
    expect(eligible.map((f: any) => f.filename)).toEqual([commented.filename, modified.filename]);
    const comment = {
      id: 1, path: commented.filename, line: null, body: 'file-level note', author: 'me',
    };
    const rows = flattenFilesToVirtualRows(eligible, 'unified', { reviewComments: [comment] });
    const headerIndex = rows.findIndex((r: any) => r.kind === 'file-header' && r.filePath === commented.filename);
    expect(headerIndex).toBeGreaterThan(-1);
    // File-level thread renders directly under its header, even with no patch.
    expect(rows[headerIndex + 1]).toMatchObject({
      kind: 'inline-comment', filePath: commented.filename, commentId: 1, subjectType: 'file',
    });
    const paths: string[] = [];
    const walk = (nodes: any[]) => {
      for (const n of nodes) {
        if (n.type === 'file') paths.push(n.path);
        else walk(n.children || []);
      }
    };
    walk(buildNestedFileTree(filesInTreeOrder(eligible)));
    expect(paths).toContain(commented.filename);
    expect(paths).not.toContain(pureRename.filename);
  });

  test('rename-only extensions leave the chip list', () => {
    expect(listFileExtensions(filterFilesExcludePureRenames([pureRename, modified])))
      .toEqual(['ts']);
  });

  test('file header renders the previous path through escapeHtml (no raw HTML)', () => {
    const rows = fs.readFileSync(
      path.join(root, 'src/modal/views/diff/VirtualDiffRows.tsx'),
      'utf8'
    );
    expect(rows).toMatch(/escapeHtml\(prevPath\)/);
  });
});
