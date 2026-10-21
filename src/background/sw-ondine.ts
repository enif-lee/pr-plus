/**
 * ```mermaid fences → SVG via Ondine (Rust → WASM). Content scripts on
 * github.com cannot compile WASM (isolated-world CSP), so the SW renders and
 * returns the SVG string. Requires `'wasm-unsafe-eval'` in the manifest
 * extension_pages CSP.
 */

import { create } from 'ondine/compiler/wasm';
import { MSG, type SwMessage } from '../sw-messages';

export const ONDINE_WASM_PATH = 'src/modal/dist/ondine.wasm';

type Renderer = ReturnType<typeof create>;

let rendererP: Promise<Renderer> | null = null;

function getRenderer(): Promise<Renderer> {
  if (!rendererP) {
    rendererP = (async () => {
      const res = await fetch(chrome.runtime.getURL(ONDINE_WASM_PATH));
      if (!res.ok) throw new Error(`ondine.wasm ${res.status}`);
      const module = await WebAssembly.compile(await res.arrayBuffer());
      return create({ modules: { all: module } });
    })().catch((err) => {
      rendererP = null;
      throw err;
    });
  }
  return rendererP;
}

export async function handleOndineMessage(message: SwMessage): Promise<unknown> {
  if (message.type !== MSG.ONDINE_RENDER) return undefined;
  const source = String(message.source || '');
  if (!source.trim()) return { ok: false, error: 'Empty mermaid diagram' };
  try {
    const renderer = await getRenderer();
    const idPrefix = String(message.idPrefix || '');
    const out = renderer.render(source, idPrefix ? { idPrefix } : {});
    return {
      ok: true,
      svg: out.svg,
      type: out.type,
      width: out.width,
      height: out.height,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/** Tests only. */
export function __resetOndineRendererForTests() {
  rendererP = null;
}
