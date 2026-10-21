/**
 * ```mermaid fences → SVG through the service worker (Ondine WASM).
 * Content scripts on github.com cannot compile WASM, so rendering happens in
 * the SW (`src/background/sw-ondine.ts`) and only the SVG string comes back.
 */

import { MSG } from '../../sw-messages';

export type OndineRenderResponse =
  | { ok: true; svg: string; type: string; width: number; height: number }
  | { ok: false; error: string; unavailable?: boolean };

/** Light vs dark from open modal shell (drives `--ondine-*` CSS vars). */
export function resolveMermaidColorMode(): 'light' | 'dark' {
  try {
    const el =
      typeof document !== 'undefined'
        ? document.querySelector('.prp-overlay[data-color-mode]')
        : null;
    const mode = el?.getAttribute('data-color-mode') || '';
    if (mode === 'dark') return 'dark';
  } catch {
    /* ignore */
  }
  return 'light';
}

/**
 * Render mermaid source to SVG. Never throws: `unavailable` marks transport
 * failures (no extension runtime / SW unreachable) vs diagram errors.
 */
export function renderOndine(
  source: string,
  opts: { idPrefix?: string } = {}
): Promise<OndineRenderResponse> {
  const runtime = (globalThis as any).chrome?.runtime;
  if (!runtime?.sendMessage) {
    return Promise.resolve({ ok: false, error: 'no-runtime', unavailable: true });
  }
  return new Promise((resolve) => {
    try {
      runtime.sendMessage(
        { type: MSG.ONDINE_RENDER, source, idPrefix: opts.idPrefix || '' },
        (res: any) => {
          const lastError = runtime.lastError;
          if (lastError || !res) {
            resolve({
              ok: false,
              error: lastError?.message || 'no-response',
              unavailable: true,
            });
            return;
          }
          if (res.ok && typeof res.svg === 'string' && res.svg) {
            resolve(res);
            return;
          }
          resolve({ ok: false, error: String(res.error || 'Empty SVG') });
        }
      );
    } catch (err: any) {
      resolve({ ok: false, error: err?.message || String(err), unavailable: true });
    }
  });
}
