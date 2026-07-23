/**
 * One-shot splitter: pull named function components from App.jsx into TSX modules.
 * Leaves a thin shell for manual wiring.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const appPath = path.join(root, 'src/modal/App.jsx');
const src = fs.readFileSync(appPath, 'utf8');

// Strip globals header through first non-import const after pure destructures — keep body from first function
const bodyStart = src.indexOf('const ROW_HEIGHT');
const body = bodyStart >= 0 ? src.slice(bodyStart) : src;

const targets = [
  { name: 'Button', dir: 'components/common', file: 'Button.tsx' },
  { name: 'Badge', dir: 'components/common', file: 'Badge.tsx' },
  { name: 'Card', dir: 'components/common', file: 'Card.tsx' },
  { name: 'SearchableSelect', dir: 'components/common', file: 'SearchableSelect.tsx' },
  { name: 'WysiwygComposer', dir: 'components/common', file: 'WysiwygComposer.tsx' },
  { name: 'MarkdownView', dir: 'components/common', file: 'MarkdownView.tsx' },
  { name: 'MermaidBlock', dir: 'components/common', file: 'MermaidBlock.tsx' },
  { name: 'SuggestionBlock', dir: 'components/common', file: 'SuggestionBlock.tsx' },
  { name: 'BodyEditor', dir: 'views/composers', file: 'BodyEditor.tsx' },
  { name: 'RichComposer', dir: 'views/composers', file: 'RichComposer.tsx' },
  { name: 'CommandPalette', dir: 'views/chrome', file: 'CommandPalette.tsx' },
  { name: 'Header', dir: 'views/chrome', file: 'Header.tsx' },
  { name: 'SearchBar', dir: 'views/chrome', file: 'SearchBar.tsx' },
  { name: 'StackStrip', dir: 'views/chrome', file: 'StackStrip.tsx' },
  { name: 'LoadingSkeleton', dir: 'views/chrome', file: 'LoadingSkeleton.tsx' },
  { name: 'CommentNavBar', dir: 'views/chrome', file: 'CommentNavBar.tsx' },
  { name: 'PendingReviewBar', dir: 'views/chrome', file: 'PendingReviewBar.tsx' },
  { name: 'DiffChrome', dir: 'views/chrome', file: 'DiffChrome.tsx' },
  { name: 'MetaList', dir: 'views/conversation', file: 'MetaList.tsx' },
  { name: 'ConversationView', dir: 'views/conversation', file: 'ConversationView.tsx' },
  { name: 'AsideCommitsTimeline', dir: 'views/conversation', file: 'AsideCommitsTimeline.tsx' },
  { name: 'AsideFilesTree', dir: 'views/conversation', file: 'AsideFilesTree.tsx' },
  { name: 'ChecksPanel', dir: 'views/conversation', file: 'ChecksPanel.tsx' },
  { name: 'DiffSnippetView', dir: 'views/conversation', file: 'DiffSnippetView.tsx' },
  { name: 'UserLink', dir: 'components/common', file: 'UserLink.tsx' },
  { name: 'LabelLink', dir: 'components/common', file: 'LabelLink.tsx' },
  { name: 'VirtualDiff', dir: 'views/diff', file: 'VirtualDiff.tsx' },
  { name: 'InlineThread', dir: 'views/diff', file: 'InlineThread.tsx' },
  { name: 'SelectionCommentBar', dir: 'views/diff', file: 'SelectionCommentBar.tsx' },
  { name: 'FolderFileTree', dir: 'views/diff', file: 'FolderFileTree.tsx' },
];

function extractFunction(source, name) {
  const re = new RegExp(`function ${name}\\s*\\(`);
  const m = re.exec(source);
  if (!m) return null;
  let i = m.index;
  // find matching brace for function body
  const brace = source.indexOf('{', i);
  let depth = 0;
  for (let j = brace; j < source.length; j++) {
    const c = source[j];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(i, j + 1);
      }
    }
  }
  return null;
}

const extracted = [];
for (const t of targets) {
  const code = extractFunction(body, t.name);
  if (!code) {
    console.warn('missing', t.name);
    continue;
  }
  const dir = path.join(root, 'src/modal', t.dir);
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, t.file);
  const content = `// @ts-nocheck\nimport React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';\n\n${code}\n\nexport { ${t.name} };\nexport default ${t.name};\n`;
  fs.writeFileSync(outPath, content);
  extracted.push(t.name);
  console.log('extracted', t.name, '→', path.relative(root, outPath), code.length);
}

console.log('total', extracted.length);
