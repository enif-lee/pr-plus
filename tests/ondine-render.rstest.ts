/**
 * Ondine (mermaid fences): SW render handler with the shipped WASM, the
 * content-side client contract, and the inline-fit / viewer style rewrite
 * (theme CSS vars and stroke-width must survive).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, test } from '@rstest/core';
import {
  __resetOndineRendererForTests,
  handleOndineMessage,
  ONDINE_WASM_PATH,
} from '../src/background/sw-ondine';
import { MSG } from '../src/sw-messages';
import { renderOndine } from '../src/modal/lib/ondine-client';
import {
  fitMermaidSvgInline,
  prepareMermaidSvgForViewer,
  stripStyleDeclarations,
} from '../src/modal/lib/mermaid-viewer';

const wasmBytes = readFileSync(
  createRequire(import.meta.url).resolve('ondine/compiler/wasm/all.wasm')
);

const g = globalThis as any;
let prevChrome: any;
let prevFetch: any;
let fetchedUrls: string[] = [];

beforeEach(() => {
  prevChrome = g.chrome;
  prevFetch = g.fetch;
  fetchedUrls = [];
  __resetOndineRendererForTests();
  g.chrome = {
    runtime: { getURL: (p: string) => `chrome-extension://prp/${p}` },
  };
  g.fetch = async (url: string) => {
    fetchedUrls.push(url);
    return new Response(wasmBytes, {
      headers: { 'content-type': 'application/wasm' },
    });
  };
});

afterEach(() => {
  g.chrome = prevChrome;
  g.fetch = prevFetch;
});

function render(source: string, extra: Record<string, unknown> = {}) {
  return handleOndineMessage({ type: MSG.ONDINE_RENDER, source, ...extra }) as Promise<any>;
}

function rootStyle(svg: string): string {
  return svg.match(/<svg\b[^>]*\sstyle="([^"]*)"/i)?.[1] || '';
}

describe('handleOndineMessage (SW)', () => {
  test('ignores other message types', async () => {
    expect(await handleOndineMessage({ type: MSG.PING })).toBeUndefined();
  });

  test('flowchart → SVG that reads --ondine-* vars; WASM fetched once', async () => {
    const out = await render('flowchart LR\n  A[Start] --> B{Ok?}\n  B -->|yes| C', {
      idPrefix: 'prp-mmd-t-',
    });
    expect(out.ok).toBe(true);
    expect(out.type).toBe('flowchart');
    expect(out.svg).toMatch(/^<svg\b/);
    expect(rootStyle(out.svg)).toMatch(/var\(--ondine-fg/);

    const seq = await render('sequenceDiagram\n  A->>B: hi\n  B-->>A: ok');
    expect(seq).toMatchObject({ ok: true, type: 'sequence' });
    expect(fetchedUrls).toEqual([`chrome-extension://prp/${ONDINE_WASM_PATH}`]);
  });

  test('syntax error → ok:false with the parser message', async () => {
    const out = await render('flowchart LR\n  A -->');
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/Parse error/);
  });

  test('empty source is rejected without loading WASM', async () => {
    expect(await render('   ')).toMatchObject({ ok: false });
    expect(fetchedUrls).toEqual([]);
  });
});

describe('renderOndine (content client)', () => {
  test('sends MSG.ONDINE_RENDER and passes the SVG through', async () => {
    let sent: any = null;
    g.chrome.runtime.sendMessage = (msg: any, cb: (res: any) => void) => {
      sent = msg;
      cb({ ok: true, svg: '<svg/>', type: 'flowchart', width: 1, height: 1 });
    };
    const res = await renderOndine('graph TD; A-->B', { idPrefix: 'p-' });
    expect(sent).toEqual({ type: MSG.ONDINE_RENDER, source: 'graph TD; A-->B', idPrefix: 'p-' });
    expect(res).toMatchObject({ ok: true, svg: '<svg/>' });
  });

  test('diagram error vs transport failure', async () => {
    g.chrome.runtime.sendMessage = (_m: any, cb: (res: any) => void) =>
      cb({ ok: false, error: 'Parse error on line 2' });
    expect(await renderOndine('x')).toEqual({ ok: false, error: 'Parse error on line 2' });

    g.chrome.runtime.sendMessage = (_m: any, cb: (res: any) => void) => {
      g.chrome.runtime.lastError = { message: 'Receiving end does not exist.' };
      cb(undefined);
      delete g.chrome.runtime.lastError;
    };
    expect(await renderOndine('x')).toMatchObject({ ok: false, unavailable: true });

    delete g.chrome.runtime.sendMessage;
    expect(await renderOndine('x')).toMatchObject({ ok: false, unavailable: true });
  });
});

describe('Ondine SVG through inline fit / viewer', () => {
  test('keeps stroke-width and theme vars; drops width/height', async () => {
    const { svg } = await render('flowchart TD\n  A --> B');
    const fitted = fitMermaidSvgInline(svg, { maxHeight: 720 });
    const style = rootStyle(fitted);
    expect(style).toMatch(/stroke-width:var\(--_sw\)/);
    expect(style).toMatch(/--_bg:var\(--ondine-bg,#fff\)/);
    expect(style).not.toMatch(/(^|;)\s*max-width\s*:/);
    expect(style).not.toMatch(/(^|;)\s*height\s*:/);
    expect(style).not.toMatch(/stroke-color/);

    const viewer = prepareMermaidSvgForViewer(fitted);
    expect(rootStyle(viewer)).toMatch(/stroke-width:var\(--_sw\)/);
    expect(viewer).toMatch(/data-prp-mermaid-viewer-svg="1"/);
  });
});

describe('stripStyleDeclarations', () => {
  test('matches whole property names only', () => {
    expect(
      stripStyleDeclarations(
        'max-width:100%;height:auto;--_sw:2px;stroke-width:var(--_sw);width:10px',
        (prop) => /^(max-)?(width|height)$/.test(prop)
      )
    ).toBe('--_sw:2px;stroke-width:var(--_sw)');
  });
});
