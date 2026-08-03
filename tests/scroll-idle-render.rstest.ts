/**
 * Conversation scroll-idle deferral for expensive Mermaid/body work.
 * Drives shipped pure gates + source wiring (no re-implemented policy).
 */
import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CONVERSATION_SCROLL_IDLE_MS,
  mermaidSourceKey,
  shouldRunMermaidHeavyWork,
  shouldShowHeavyPlaceholder,
  shouldStartHeavyRender,
} from '../src/modal/lib/scroll-idle-render';

const root = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

describe('shouldStartHeavyRender (shipped pure)', () => {
  test('blocks heavy start while scrolling', () => {
    expect(shouldStartHeavyRender({ isScrolling: true })).toBe(false);
  });

  test('allows heavy start when idle', () => {
    expect(shouldStartHeavyRender({ isScrolling: false })).toBe(true);
    expect(shouldStartHeavyRender({})).toBe(true);
    expect(shouldStartHeavyRender({ isScrolling: null })).toBe(true);
  });
});

describe('shouldRunMermaidHeavyWork (shipped pure) — no re-render flash', () => {
  const key = mermaidSourceKey('graph TD; A-->B', 'neutral');

  test('blocks while scrolling even without cache', () => {
    expect(
      shouldRunMermaidHeavyWork({
        isScrolling: true,
        hasCachedResult: false,
        sourceKey: key,
        cachedSourceKey: '',
      })
    ).toBe(false);
  });

  test('blocks while scrolling when SVG already cached (keep diagram)', () => {
    expect(
      shouldRunMermaidHeavyWork({
        isScrolling: true,
        hasCachedResult: true,
        sourceKey: key,
        cachedSourceKey: key,
      })
    ).toBe(false);
  });

  test('idle + matching cache: does NOT re-invoke heavy path (scroll-end)', () => {
    expect(
      shouldRunMermaidHeavyWork({
        isScrolling: false,
        hasCachedResult: true,
        sourceKey: key,
        cachedSourceKey: key,
      })
    ).toBe(false);
  });

  test('idle + no cache: starts heavy work', () => {
    expect(
      shouldRunMermaidHeavyWork({
        isScrolling: false,
        hasCachedResult: false,
        sourceKey: key,
        cachedSourceKey: '',
      })
    ).toBe(true);
  });

  test('idle + cache for different code/theme: re-runs heavy work', () => {
    expect(
      shouldRunMermaidHeavyWork({
        isScrolling: false,
        hasCachedResult: true,
        sourceKey: mermaidSourceKey('graph TD; A-->C', 'neutral'),
        cachedSourceKey: key,
      })
    ).toBe(true);
  });

  test('mermaidSourceKey is stable for same inputs', () => {
    expect(mermaidSourceKey('  x  ', 'dark')).toBe(mermaidSourceKey('x', 'dark'));
  });
});

describe('shouldShowHeavyPlaceholder (shipped pure)', () => {
  test('shows placeholder while scrolling without a result', () => {
    expect(
      shouldShowHeavyPlaceholder({
        isScrolling: true,
        hasResult: false,
        busy: false,
      })
    ).toBe(true);
  });

  test('keeps existing result visible during scroll (no flash)', () => {
    expect(
      shouldShowHeavyPlaceholder({
        isScrolling: true,
        hasResult: true,
        busy: false,
      })
    ).toBe(false);
  });

  test('shows loading when busy and idle without result', () => {
    expect(
      shouldShowHeavyPlaceholder({
        isScrolling: false,
        hasResult: false,
        busy: true,
      })
    ).toBe(true);
  });

  test('hides placeholder when result is ready', () => {
    expect(
      shouldShowHeavyPlaceholder({
        isScrolling: false,
        hasResult: true,
        busy: false,
      })
    ).toBe(false);
  });
});

describe('wiring: Conversation scroller → Mermaid gate', () => {
  test('idle debounce constant is 700ms and shared with virtual list', () => {
    expect(CONVERSATION_SCROLL_IDLE_MS).toBe(700);
    const vcl = read('src/modal/views/conversation/VirtualConversationList.tsx');
    expect(vcl).toMatch(/CONVERSATION_SCROLL_IDLE_MS/);
    expect(vcl).toMatch(/ConversationScrollIdleProvider/);
    expect(vcl).toMatch(/setIsScrolling\(true\)/);
    expect(vcl).toMatch(/setIsScrolling\(false\)/);
  });

  test('MermaidBlock gates ensureMermaid via shouldRunMermaidHeavyWork + cache key', () => {
    const mmd = read('src/modal/components/common/MermaidBlock.tsx');
    expect(mmd).toMatch(/shouldRunMermaidHeavyWork/);
    expect(mmd).toMatch(/useConversationScrollIdle/);
    expect(mmd).toMatch(/cachedKeyRef/);
    expect(mmd).toMatch(/ensureMermaid/);
    // Heavy path only when runHeavy is true
    expect(mmd).toMatch(/if\s*\(\s*!runHeavy\s*\)/);
    const gateIdx = mmd.indexOf('if (!runHeavy)');
    const ensureIdx = mmd.indexOf('await ensureMermaid()');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(ensureIdx).toBeGreaterThan(gateIdx);
  });

  test('MarkdownView still mounts MermaidBlock for mermaid fences', () => {
    const md = read('src/modal/components/common/MarkdownView.tsx');
    expect(md).toMatch(/MermaidBlock/);
    expect(md).toMatch(/seg\.type === ['"]mermaid['"]/);
  });

  test('idle context defaults to non-scrolling outside conversation', () => {
    const ctx = read(
      'src/modal/views/conversation/ConversationScrollIdleContext.tsx'
    );
    expect(ctx).toMatch(/isScrolling:\s*false/);
  });
});

describe('conversation dual-window gap chrome', () => {
  test('buildConversationVirtualRows keeps gap when showThreadGap even if hiddenCount is 0', () => {
    const {
      buildConversationVirtualRows,
    } = require('../src/modal/lib/conversation-virtual') as typeof import('../src/modal/lib/conversation-virtual');
    const rows = buildConversationVirtualRows(
      {
        items: [{ id: 1, kind: 'comment' }],
        bottomItems: [],
        showThreadGap: true,
        hiddenCount: 0,
      },
      { reverseComments: true, hasMoreThreads: false, canLoadMore: true }
    );
    expect(rows.some((r) => r.type === 'gap')).toBe(true);
  });

  test('load-more pickDirection recovery is wired in host props-build', () => {
    const src = read('src/host/modules/props-build.ts');
    expect(src).toMatch(/oldestThreadIds/);
    expect(src).toMatch(/return 'oldest'/);
    expect(src).toMatch(/hasMore with neither cursor flag/);
  });
});
