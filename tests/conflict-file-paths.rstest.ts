import { describe, expect, test } from '@rstest/core';
import { fetchConflictFilePaths } from '../src/fetch/detail-sides-comments';

type FileEntry = {
  filename: string;
  status: string;
  patch?: string;
  additions: number;
  deletions: number;
};

function modified(filename: string, patch: string, additions = 1, deletions = 1): FileEntry {
  return { filename, status: 'modified', patch, additions, deletions };
}

async function conflictPaths(base: FileEntry[], head: FileEntry[]) {
  const responses: Record<string, object> = {
    '/git/ref/heads/main': { object: { sha: 'base' } },
    '/compare/base...head': { merge_base_commit: { sha: 'ancestor' } },
    '/compare/ancestor...base?per_page=100': { files: base },
    '/compare/ancestor...head?per_page=100': { files: head },
  };
  const requests: string[] = [];
  const fetchImpl = async (url: string) => {
    const path = url.replace('https://api.github.com/repos/test/repo', '');
    requests.push(path);
    return Response.json(responses[path] ?? {}, { status: responses[path] ? 200 : 404 });
  };
  const paths = await fetchConflictFilePaths('test', 'repo', 'main', 'head', fetchImpl, null);
  expect(requests).toEqual(Object.keys(responses));
  return paths;
}

describe('fetchConflictFilePaths', () => {
  test('excludes disjoint edits even when GitHub patch context overlaps', async () => {
    const base = [
      modified('production.json', '@@ -1,8 +1,8 @@\n {\n-a\n-b\n-c\n-d\n+A\n+B\n+C\n+D\n e\n f\n }', 4, 4),
      modified('dev.json', '@@ -7 +7 @@\n-f\n+F'),
      modified('sandbox.json', '@@ -7 +7 @@\n-f\n+F'),
    ];
    const head = [
      modified('production.json', '@@ -4,6 +4,5 @@\n c\n d\n e\n-f\n }\n end', 0, 1),
      modified('dev.json', '@@ -6,2 +6 @@\n-e\n-f\n+x', 1, 2),
      modified('sandbox.json', '@@ -6 +5,0 @@\n-e', 0, 1),
      modified('head-only.json', '@@ -7 +7 @@\n-f\n+F'),
    ];
    expect(await conflictPaths(base, head)).toEqual(['dev.json', 'sandbox.json']);
  });

  test('checks all hunks and handles a zero-length old range as an insertion', async () => {
    const atStart = '@@ -0,0 +1 @@\n+intro';
    const atLineFour = '@@ -4 +4 @@\n-d\n+D';
    const alsoAtLineFour = `${atStart}\n@@ -4 +5 @@\n-d\n+other`;
    const base = [
      modified('separate', '@@ -1,3 +1,4 @@\n+intro\n a\n b\n c', 1, 0),
      modified('same-insertion', atStart, 1, 0),
      modified('later-hunk', alsoAtLineFour, 2, 1),
    ];
    const head = [
      modified('separate', '@@ -2,3 +2,3 @@\n b\n c\n-d\n+D'),
      modified('same-insertion', '@@ -0,0 +1 @@\n+other', 1, 0),
      modified('later-hunk', atLineFour),
    ];
    expect(await conflictPaths(base, head)).toEqual(['same-insertion', 'later-hunk']);
  });

  test('keeps a candidate when only repeated lines separate its edits', async () => {
    // These ranges look disjoint in a Myers diff, but Git's default merge
    // conflicts: the separating "d" can align with an earlier "d".
    const base = [modified('repeat', '@@ -1,5 +1,5 @@\n c\n d\n-a\n+c\n d\n a')];
    const head = [modified('repeat', '@@ -1,5 +1,5 @@\n c\n d\n a\n d\n-a\n+b')];
    expect(await conflictPaths(base, head)).toEqual(['repeat']);
  });

  test('pairs exact paths rather than borrowing a patch from a whitespace variant', async () => {
    const base = [
      modified('file', '@@ -1,4 +1,4 @@\n a\n-b\n+B\n c\n d'),
      modified('file ', '@@ -1,4 +1,4 @@\n a\n b\n c\n-d\n+D'),
    ];
    const head = [modified('file', '@@ -1,4 +1,4 @@\n a\n-b\n+B2\n c\n d')];
    expect(await conflictPaths(base, head)).toEqual(['file']);
  });

  test('preserves candidates if either side cannot be checked safely', async () => {
    const patch = '@@ -2 +2 @@\n-b\n+B';
    const base: FileEntry[] = [
      { ...modified('missing-patch', patch), patch: undefined },
      modified('truncated-hunk', '@@ -1,3 +1,3 @@\n a\n-b\n+B'),
      modified('truncated-patch', patch, 2, 2),
      { ...modified('rename', patch), status: 'renamed' },
      { ...modified('type-change', patch), status: 'changed' },
      modified('no-newline', `${patch}\n\\ No newline at end of file`),
    ];
    const head = base.map(({ filename }) => modified(filename, '@@ -8 +8 @@\n-y\n+Y'));
    expect(await conflictPaths(base, head)).toEqual(base.map(({ filename }) => filename));
  });
});
