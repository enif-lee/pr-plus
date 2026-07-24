/**
 * Diff view: image render, non-openable binary, ≥5000 default collapse.
 * Drives shipped collapse + flattenFilesToVirtualRows (same path as the modal).
 */
const assert = require('node:assert/strict');
const collapse = require('../src/modal/lib/collapse.ts');
const diffRows = require('../src/modal/lib/diff-rows.ts');
const fetchPulls = require('../src/fetch-pulls.js');

const {
  DEFAULT_LARGE_CHANGES,
  isImagePath,
  classifyDiffFile,
  shouldCollapseFile,
  annotateFilesForCollapse,
} = collapse;
const { flattenFilesToVirtualRows, buildGithubRawUrl } = diffRows;

assert.equal(DEFAULT_LARGE_CHANGES, 5000, 'large-change default must be 5000');

// --- Path / classification ---
assert.equal(isImagePath('assets/logo.png'), true);
assert.equal(isImagePath('photo.JPEG'), true);
assert.equal(isImagePath('a/b/icon.svg'), true);
assert.equal(isImagePath('data.bin'), false);
assert.equal(isImagePath('src/app.js'), false);

{
  const img = classifyDiffFile({
    filename: 'shot.png',
    patch: '',
    status: 'added',
  });
  assert.equal(img.kind, 'image');
  assert.equal(img.renderImage, true);
  assert.equal(img.openableAsText, false);

  const bin = classifyDiffFile({
    filename: 'vendor/lib.so',
    patch: '',
    status: 'added',
  });
  assert.equal(bin.kind, 'binary');
  assert.equal(bin.openableAsText, false);
  assert.equal(bin.renderImage, false);

  const text = classifyDiffFile({
    filename: 'src/a.ts',
    patch: '@@ -1 +1 @@\n+hi\n',
    additions: 1,
    deletions: 0,
  });
  assert.equal(text.kind, 'text');
  assert.equal(text.openableAsText, true);
}

// --- Large-change boundary (4999 open by size rule, 5000 forced) ---
{
  const under = {
    filename: 'big.js',
    patch: '@@\n+' + 'x\n'.repeat(10),
    additions: 4999,
    deletions: 0,
    changes: 4999,
  };
  const at = {
    filename: 'huge.js',
    patch: '@@\n+' + 'y\n'.repeat(10),
    additions: 5000,
    deletions: 0,
    changes: 5000,
  };
  assert.equal(
    shouldCollapseFile(under),
    false,
    '4999 changes must not force-collapse by ≥5000 rule'
  );
  assert.equal(
    shouldCollapseFile(at),
    true,
    '5000 changes must default-collapse'
  );
  assert.equal(
    shouldCollapseFile(under, { largeChanges: 5000 }),
    false
  );
  assert.equal(shouldCollapseFile(at, { largeChanges: 5000 }), true);
}

// --- Image: not collapsed solely for missing patch; binary is ---
{
  assert.equal(
    shouldCollapseFile({ filename: 'new.png', patch: '', status: 'added' }),
    false,
    'image without patch should stay open for preview'
  );
  assert.equal(
    shouldCollapseFile({ filename: 'blob.bin', patch: '', status: 'added' }),
    true,
    'non-image binary without patch starts collapsed'
  );
}

// --- annotateFilesForCollapse feeds fileKind / openable / renderImage ---
{
  const annotated = annotateFilesForCollapse(
    [
      {
        filename: 'img/a.png',
        patch: '',
        status: 'added',
        raw_url: 'https://github.com/o/r/raw/abc/img/a.png',
        additions: 0,
        deletions: 0,
        changes: 0,
      },
      {
        filename: 'lib.o',
        patch: '',
        status: 'added',
        additions: 0,
        deletions: 0,
        changes: 0,
      },
      {
        filename: 'src/ok.js',
        patch: '@@ -1 +1 @@\n+z\n',
        additions: 1,
        deletions: 0,
        changes: 1,
      },
      {
        filename: 'wall.js',
        patch: '@@\n+a\n',
        additions: 5000,
        deletions: 0,
        changes: 5000,
      },
    ],
    ''
  );
  const by = Object.fromEntries(annotated.map((f) => [f.filename, f]));
  assert.equal(by['img/a.png'].fileKind, 'image');
  assert.equal(by['img/a.png'].renderImage, true);
  assert.equal(by['img/a.png'].defaultCollapsed, false);
  assert.equal(by['lib.o'].fileKind, 'binary');
  assert.equal(by['lib.o'].openableAsText, false);
  assert.equal(by['lib.o'].defaultCollapsed, true);
  assert.equal(by['src/ok.js'].fileKind, 'text');
  assert.equal(by['src/ok.js'].defaultCollapsed, false);
  assert.equal(by['wall.js'].defaultCollapsed, true);
}

// --- flattenFilesToVirtualRows: image row vs non-openable binary ---
{
  const files = annotateFilesForCollapse(
    [
      {
        filename: 'hero.png',
        patch: '',
        status: 'added',
        raw_url: 'https://github.com/acme/app/raw/deadbeef/hero.png',
        additions: 0,
        deletions: 0,
        changes: 0,
      },
      {
        filename: 'secret.bin',
        patch: '',
        status: 'modified',
        additions: 0,
        deletions: 0,
        changes: 0,
      },
      {
        filename: 'tiny.js',
        patch: '@@ -1 +1 @@\n+ok\n',
        additions: 1,
        deletions: 0,
        changes: 1,
      },
    ],
    ''
  );

  const rows = flattenFilesToVirtualRows(files, 'unified', {
    expandAll: true,
    owner: 'acme',
    repo: 'app',
    headSha: 'deadbeef',
    baseSha: 'cafebabe',
    webOrigin: 'https://github.com',
  });

  const imgHeader = rows.find(
    (r) => r.kind === 'file-header' && r.filePath === 'hero.png'
  );
  assert.ok(imgHeader);
  assert.equal(imgHeader.openable, true);
  assert.equal(imgHeader.fileKind, 'image');

  const imgRow = rows.find(
    (r) => r.kind === 'diff-image' && r.filePath === 'hero.png'
  );
  assert.ok(imgRow, 'image files must emit diff-image rows');
  assert.equal(imgRow.headUrl, 'https://github.com/acme/app/raw/deadbeef/hero.png');
  assert.ok(
    !rows.some(
      (r) =>
        r.filePath === 'hero.png' &&
        r.kind === 'diff-meta' &&
        /no textual patch/i.test(r.text || '')
    ),
    'image must not use generic binary meta placeholder alone'
  );

  const binHeader = rows.find(
    (r) => r.kind === 'file-header' && r.filePath === 'secret.bin'
  );
  assert.ok(binHeader);
  assert.equal(binHeader.openable, false);
  assert.equal(binHeader.collapsed, true);
  assert.ok(
    !rows.some(
      (r) =>
        r.filePath === 'secret.bin' &&
        (r.kind === 'diff-line' || r.kind === 'diff-image')
    ),
    'binary must not open a text or image body'
  );
  assert.ok(
    !rows.some(
      (r) =>
        r.filePath === 'secret.bin' &&
        r.kind === 'diff-meta' &&
        /no textual patch/i.test(r.text || '')
    ),
    'binary must not show openable "(no textual patch)" body'
  );

  const textLines = rows.filter(
    (r) => r.filePath === 'tiny.js' && r.kind === 'diff-line'
  );
  assert.ok(textLines.length > 0, 'normal text patch still opens');
}

// Modified image: base + head URLs
{
  const files = annotateFilesForCollapse(
    [
      {
        filename: 'icon.png',
        patch: '',
        status: 'modified',
        raw_url: 'https://github.com/o/r/raw/newsha/icon.png',
        additions: 0,
        deletions: 0,
        changes: 0,
      },
    ],
    ''
  );
  const rows = flattenFilesToVirtualRows(files, 'unified', {
    expandAll: true,
    owner: 'o',
    repo: 'r',
    headSha: 'newsha',
    baseSha: 'oldsha',
    webOrigin: 'https://github.com',
  });
  const img = rows.find((r) => r.kind === 'diff-image');
  assert.ok(img);
  assert.equal(img.headUrl, 'https://github.com/o/r/raw/newsha/icon.png');
  assert.equal(
    img.baseUrl,
    buildGithubRawUrl({
      owner: 'o',
      repo: 'r',
      ref: 'oldsha',
      path: 'icon.png',
      webOrigin: 'https://github.com',
    })
  );
}

// mapAndAnnotateFiles preserves raw_url and applies classifiers
{
  assert.equal(typeof fetchPulls.mapAndAnnotateFiles, 'function');
  const out = fetchPulls.mapAndAnnotateFiles([
    {
      filename: 'x.webp',
      status: 'added',
      additions: 0,
      deletions: 0,
      changes: 0,
      raw_url: 'https://example/raw/x.webp',
      sha: 'abc',
    },
    {
      filename: 'y.wasm',
      status: 'added',
      additions: 0,
      deletions: 0,
      changes: 0,
    },
  ]);
  const img = out.find((f) => f.filename === 'x.webp');
  const bin = out.find((f) => f.filename === 'y.wasm');
  assert.equal(img.raw_url, 'https://example/raw/x.webp');
  assert.equal(img.fileKind, 'image');
  assert.equal(img.renderImage, true);
  assert.equal(bin.fileKind, 'binary');
  assert.equal(bin.openableAsText, false);
}

console.log('diff-blob-image.test.js: all assertions passed');
console.log('diff-blob-image=true');

// --- Sticky file header + file-level comments ---
{
  const {
    stickyFileHeaderForScroll,
    shouldShowStickyFileHeader,
    resolveStickyFileHeaderLayout,
    isFileLevelComment,
    flattenFilesToVirtualRows: flatten,
  } = require('../src/modal/lib/diff-rows.ts');
  const { rowOffsets } = require('../src/modal/components/common/utils.tsx');

  assert.equal(
    isFileLevelComment({ path: 'a.ts', subjectType: 'file' }),
    true
  );
  assert.equal(
    isFileLevelComment({ path: 'a.ts', line: 3, subjectType: 'line' }),
    false
  );
  assert.equal(
    isFileLevelComment({ path: 'a.ts', body: 'x' }),
    true,
    'path-only comment is file-level'
  );

  const files = [
    {
      filename: 'one.ts',
      status: 'modified',
      additions: 1,
      deletions: 0,
      patch: '@@ -1 +1 @@\n+a\n',
    },
    {
      filename: 'two.ts',
      status: 'added',
      additions: 1,
      deletions: 0,
      patch: '@@ -0,0 +1 @@\n+b\n',
    },
  ];
  const rows = flatten(files, 'unified', {
    expandAll: true,
    reviewComments: [
      {
        id: 99,
        path: 'one.ts',
        body: 'whole file',
        author: 'ed',
        subjectType: 'file',
      },
    ],
  });
  const headerOne = rows.find((r) => r.kind === 'file-header' && r.filePath === 'one.ts');
  const fileComment = rows.find((r) => r.kind === 'inline-comment' && r.commentId === 99);
  assert.ok(headerOne);
  assert.ok(fileComment, 'file comment row present');
  assert.equal(fileComment.subjectType, 'file');
  assert.equal(
    rows.indexOf(fileComment),
    rows.indexOf(headerOne) + 1,
    'file comment sits under header'
  );

  const offs = rowOffsets(rows);
  const headerTwo = rows.find((r) => r.kind === 'file-header' && r.filePath === 'two.ts');
  assert.equal(
    stickyFileHeaderForScroll(rows, offs, 0)?.filePath,
    'one.ts'
  );
  assert.equal(
    shouldShowStickyFileHeader(
      stickyFileHeaderForScroll(rows, offs, 0),
      offs,
      0,
      22,
      rows
    ),
    false,
    'at rest, natural header is in view — no sticky clone'
  );
  {
    const atEdge = resolveStickyFileHeaderLayout(rows, offs, 0, 22);
    assert.equal(atEdge?.show, false);
    const past = resolveStickyFileHeaderLayout(rows, offs, 8, 22);
    assert.equal(past?.show, true);
    assert.equal(past?.header?.filePath, 'one.ts');
    assert.equal(past?.translateY, 0, 'far from next file — pinned at 0');
  }
  // Near next file header: sticky is pushed up (use array index for Y, not rowIndex)
  {
    const twoArrIdx = rows.findIndex(
      (r) => r.kind === 'file-header' && r.filePath === 'two.ts'
    );
    const nextY = offs[twoArrIdx];
    const nearTop = nextY - 10;
    const near = resolveStickyFileHeaderLayout(rows, offs, nearTop, 22);
    assert.equal(near?.show, true);
    assert.equal(near?.header?.filePath, 'one.ts');
    assert.ok(
      near.translateY < 0,
      `next header pushes sticky up (got translateY=${near?.translateY})`
    );
  }
  {
    const twoArrIdx = rows.findIndex(
      (r) => r.kind === 'file-header' && r.filePath === 'two.ts'
    );
    assert.equal(
      stickyFileHeaderForScroll(rows, offs, offs[twoArrIdx] + 2)?.filePath,
      'two.ts'
    );
  }
  console.log('ok - sticky header + file-level comments');
}
