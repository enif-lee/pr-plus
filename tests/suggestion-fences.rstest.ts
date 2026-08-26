/**
 * GitHub ```suggestion fences: line-start only (not table/docs examples).
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseSuggestionFences,
  splitSuggestionSegments,
} from '../src/modal/lib/pr-edit-api';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('parseSuggestionFences / splitSuggestionSegments', () => {
  test('real line-start fence is a suggestion; surrounding markdown stays md', () => {
    const body = [
      'Please apply this:',
      '',
      '```suggestion',
      'hello world',
      '```',
      '',
      'thanks',
    ].join('\n');
    const fences = parseSuggestionFences(body);
    expect(fences).toHaveLength(1);
    expect(fences[0].content).toBe('hello world');
    const segs = splitSuggestionSegments(body);
    expect(segs.filter((s) => s.type === 'suggestion')).toHaveLength(1);
    expect(segs.some((s) => s.type === 'md' && s.content.includes('thanks'))).toBe(
      true
    );
  });

  test('mid-line table/docs ````suggestion` is not a suggestion fence', () => {
    const row =
      '| **Suggestions** | Render ````suggestion` blocks; **Apply suggestion** (commit to head) |';
    expect(parseSuggestionFences(row)).toEqual([]);
    expect(
      splitSuggestionSegments(row).every((s) => s.type === 'md')
    ).toBe(true);

    const table = [
      '| Feature | Description |',
      '|---------|-------------|',
      row,
      '| **View-scoped Find (`⌘F` / `Ctrl+F`)** | Search **only the active surface** |',
      '',
      '```bash',
      'npm test',
      '```',
    ].join('\n');
    expect(parseSuggestionFences(table)).toEqual([]);
    const segs = splitSuggestionSegments(table);
    expect(segs.filter((s) => s.type === 'suggestion')).toEqual([]);
    expect(segs.map((s) => s.content).join('')).toBe(table);
  });
});

describe('MarkdownView uses line-start suggestion split', () => {
  test('peels via splitSuggestionSegments, not a mid-line ```suggestion regex', () => {
    const src = fs.readFileSync(
      path.join(root, 'src/modal/components/common/MarkdownView.tsx'),
      'utf8'
    );
    expect(src).toMatch(/splitSuggestionSegments/);
    expect(src).not.toMatch(/```suggestion\[\^\\n\]\*/);
  });
});
