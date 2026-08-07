/**
 * Structural + pure analysis of Diff syntax-highlight pipeline.
 * Documents failure modes for intermittent plain (no-token) code paint.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { languageFromPath } from '../src/modal/lib/diff-rows';
import {
  resolveHljsLanguageId,
  HLJS_LANGUAGE_IDS,
  isHljsLanguageId,
} from '../src/modal/lib/hljs-lazy';
import {
  highlightCode,
  clearHighlightCodeCache,
  escapeHtml,
  highlightCodeCacheSize,
} from '../src/modal/components/common/utils';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

/** Paths from callabo-server#2703 example surface */
const EXAMPLE_PR_PATHS = [
  'src/callabo/core/settings.py',
  'src/v2/api/messages/error.py',
  'docs/features.md',
  '.env.sample',
];

describe('languageFromPath → hljs registration (example PR #2703 paths)', () => {
  test('maps example paths to expected language ids', () => {
    expect(languageFromPath('src/callabo/core/settings.py')).toBe('python');
    expect(languageFromPath('docs/features.md')).toBe('markdown');
    // .env.sample → ext "sample" → no map → plaintext (never highlighted)
    expect(languageFromPath('.env.sample')).toBe('plaintext');
  });

  test('python/markdown resolve to shipped grammar chunks; sample does not', () => {
    expect(isHljsLanguageId('python')).toBe(true);
    expect(isHljsLanguageId('markdown')).toBe(true);
    expect(resolveHljsLanguageId('python')).toBe('python');
    expect(resolveHljsLanguageId('markdown')).toBe('markdown');
    // plaintext is intentionally null (no chunk)
    expect(resolveHljsLanguageId('plaintext')).toBeNull();
    expect(resolveHljsLanguageId(languageFromPath('.env.sample'))).toBeNull();
  });

  test('shipped hljs-langs chunks exist for mapped languages', () => {
    const dir = path.join(root, 'src/modal/dist/hljs-langs');
    expect(fs.existsSync(path.join(dir, 'python.js'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'markdown.js'))).toBe(true);
    expect(HLJS_LANGUAGE_IDS).toContain('python');
    expect(HLJS_LANGUAGE_IDS).toContain('markdown');
  });

  test('all EXAMPLE_PR_PATHS covered by languageFromPath (no throw)', () => {
    for (const p of EXAMPLE_PR_PATHS) {
      const lang = languageFromPath(p);
      expect(typeof lang).toBe('string');
    }
  });
});

describe('highlightCode cold path without registered grammar', () => {
  test('without hljs engine returns escaped plain (no token spans)', () => {
    const prev = (globalThis as any).hljs;
    try {
      delete (globalThis as any).hljs;
      clearHighlightCodeCache();
      const html = highlightCode('def foo():\n  pass', 'a.py');
      expect(html).toBe(escapeHtml('def foo():\n  pass'));
      expect(html).not.toMatch(/class="hljs-/);
    } finally {
      (globalThis as any).hljs = prev;
    }
  });

  test('with engine but unregistered language: plain escape + same cache key risk', () => {
    const prev = (globalThis as any).hljs;
    clearHighlightCodeCache();
    (globalThis as any).hljs = {
      getLanguage: () => undefined,
      registerLanguage: () => {},
      highlight: () => {
        throw new Error('should not highlight without language');
      },
    };
    try {
      const html = highlightCode('x = 1', 'mod.py');
      expect(html).toBe(escapeHtml('x = 1'));
      // Cached under language key even when plain — load must clear cache
      expect(highlightCodeCacheSize()).toBeGreaterThanOrEqual(1);
      // Second call still plain while language missing
      expect(highlightCode('x = 1', 'mod.py')).toBe(escapeHtml('x = 1'));
    } finally {
      (globalThis as any).hljs = prev;
      clearHighlightCodeCache();
    }
  });

  test('after clear + registered language, highlight produces token markup', () => {
    const prev = (globalThis as any).hljs;
    clearHighlightCodeCache();
    (globalThis as any).hljs = {
      getLanguage: (id: string) => (id === 'python' ? {} : undefined),
      registerLanguage: () => {},
      highlight: (text: string, opts: { language: string }) => {
        expect(opts.language).toBe('python');
        return { value: `<span class="hljs-keyword">${escapeHtml(text)}</span>` };
      },
    };
    try {
      const html = highlightCode('import os', 'pkg/x.py');
      expect(html).toMatch(/hljs-keyword/);
      expect(html).toContain('import os');
    } finally {
      (globalThis as any).hljs = prev;
      clearHighlightCodeCache();
    }
  });
});

describe('VirtualDiff re-paint wiring (source)', () => {
  test('VirtualDiff clears highlight cache and bumps epoch on language load', () => {
    const src = read('src/modal/views/diff/VirtualDiff.tsx');
    expect(src).toMatch(/onHljsLanguagesChanged/);
    expect(src).toMatch(/clearHighlightCodeCache\s*\(\s*\)/);
    expect(src).toMatch(/setHljsEpoch/);
    expect(src).toMatch(/prefetchHljsLanguages/);
    expect(src).toMatch(/ensureHljsLanguageForPath/);
    expect(src).toMatch(/hljsEpoch=\{hljsEpoch\}/);
  });

  test('GAP: DiffCodeLine receives hljsEpoch but does not pass it to DiffCodeLineBody', () => {
    /**
     * This is the intermittent paint bug: DiffCodeLineBody is React.memo'd
     * without hljsEpoch in props, so when grammar finishes loading the shell
     * re-renders but the body keeps stale plain HTML.
     */
    const src = read('src/modal/views/diff/VirtualDiffRows.tsx');
    // Shell takes epoch (often renamed to unused _hljsEpoch)
    expect(src).toMatch(/hljsEpoch:\s*_hljsEpoch|hljsEpoch:\s*hljsEpoch/);
    expect(src).toMatch(/hljsEpoch:\s*_hljsEpoch/);
    // Body props type has no hljsEpoch
    const bodyProps = src.match(
      /type DiffCodeLineBodyProps = \{[\s\S]*?\n\};/
    )?.[0];
    expect(bodyProps).toBeTruthy();
    expect(bodyProps).not.toMatch(/hljsEpoch/);
    // Body render call does not pass epoch
    expect(src).toMatch(
      /<DiffCodeLineBody[\s\S]*?useSyntax=\{useSyntax\}[\s\S]*?\/>/
    );
    const bodyCall = src.match(/<DiffCodeLineBody[\s\S]*?\/>/)?.[0] || '';
    expect(bodyCall).not.toMatch(/hljsEpoch=/);
  });

  test('highlightCode documents lazy load + plain until grammar ready', () => {
    const src = read('src/modal/components/common/utils.tsx');
    expect(src).toMatch(/ensureHljsLanguage\(langKey\)/);
    expect(src).toMatch(/Grammar still loading or unknown/);
    expect(src).toMatch(/clearHighlightCodeCache/);
  });

  test('hljs-lazy uses chrome.runtime.getURL for ESM chunks under dist/hljs-langs', () => {
    const src = read('src/modal/lib/hljs-lazy.ts');
    expect(src).toMatch(/src\/modal\/dist\/hljs-langs\/\$\{id\}\.js/);
    expect(src).toMatch(/chromeApi\?\.runtime\?\.getURL/);
    expect(src).toMatch(/importLanguageModule/);
  });
});
