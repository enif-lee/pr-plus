/**
 * Lazy-load highlight.js language grammars (ESM chunks under dist/hljs-langs/).
 * Content-script safe: chrome.runtime.getURL + dynamic import / fetch+blob fallback.
 * MV3 forbids eval; languages must be real ESM modules, not eval'd source.
 */

import langIds from '../hljs-languages.json';
import { languageFromPath } from './diff-rows';

export const HLJS_LANGUAGE_IDS: readonly string[] = Array.isArray(langIds)
  ? langIds.map(String)
  : [];

const HLJS_LANGUAGE_ID_SET = new Set(HLJS_LANGUAGE_IDS);

/** Extra ids that map onto a real chunk (aliases). */
const LANG_ALIASES: Record<string, string> = {
  docker: 'dockerfile',
  shell: 'bash',
  zsh: 'bash',
  sh: 'bash',
  yml: 'yaml',
  text: 'plaintext',
  md: 'markdown',
  py: 'python',
  js: 'javascript',
  ts: 'typescript',
  rs: 'rust',
};

/** Grammars that need another language loaded first (hljs subLanguage). */
const LANG_DEPS: Record<string, string[]> = {
  dockerfile: ['bash'],
  markdown: ['xml'], // occasional fenced html
};

/** lang id → in-flight load promise */
const loading = new Map<string, Promise<boolean>>();

/** Fired after any language successfully registers (or fails after attempt). */
const listeners = new Set<() => void>();

export function isHljsLanguageId(lang: unknown): boolean {
  if (typeof lang !== 'string') return false;
  const id = resolveHljsLanguageId(lang);
  return Boolean(id && HLJS_LANGUAGE_ID_SET.has(id));
}

/** Normalize alias → canonical chunk id (or null for plaintext). */
export function resolveHljsLanguageId(lang: unknown): string | null {
  const raw = String(lang || '')
    .trim()
    .toLowerCase();
  if (!raw || raw === 'plaintext' || raw === 'text' || raw === 'plain') return null;
  const aliased = LANG_ALIASES[raw] || raw;
  if (aliased === 'plaintext') return null;
  return HLJS_LANGUAGE_ID_SET.has(aliased) ? aliased : null;
}

/**
 * Extension URL for a language chunk, or null outside an extension context.
 */
export function hljsLanguageUrl(lang: string): string | null {
  const id = resolveHljsLanguageId(lang);
  if (!id) return null;
  try {
    const chromeApi = (globalThis as any).chrome;
    if (chromeApi?.runtime?.getURL) {
      return chromeApi.runtime.getURL(`src/modal/dist/hljs-langs/${id}.js`);
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function onHljsLanguagesChanged(cb: () => void): () => void {
  if (typeof cb !== 'function') return () => {};
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notifyLangsChanged() {
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      /* ignore listener errors */
    }
  }
}

function registerGrammar(eng: any, id: string, def: any): boolean {
  if (typeof def !== 'function') return false;
  if (!eng.getLanguage?.(id)) {
    eng.registerLanguage(id, def);
  }
  // Common aliases for dockerfile etc.
  if (id === 'dockerfile' && !eng.getLanguage?.('docker')) {
    try {
      eng.registerLanguage('docker', def);
    } catch {
      /* ignore */
    }
  }
  notifyLangsChanged();
  return Boolean(eng.getLanguage?.(id));
}

/**
 * Load an ESM language module. Prefer dynamic import(chrome-extension URL);
 * fall back to fetch → blob URL when import fails (some Chrome versions).
 */
async function importLanguageModule(url: string): Promise<any> {
  try {
    return await import(/* @vite-ignore */ /* webpackIgnore: true */ url);
  } catch (importErr) {
    // Fallback: fetch as text + blob module (still no eval)
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      try {
        return await import(/* @vite-ignore */ /* webpackIgnore: true */ blobUrl);
      } finally {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {
          /* ignore */
        }
      }
    } catch (fetchErr) {
      const e = new Error(
        `hljs chunk load failed: ${String((importErr as any)?.message || importErr)}; fallback: ${String((fetchErr as any)?.message || fetchErr)}`
      );
      (e as any).cause = importErr;
      throw e;
    }
  }
}

/**
 * Ensure a highlight.js language grammar is registered.
 * @returns true if the language is available after the call (sync or after load)
 */
export async function ensureHljsLanguage(lang: unknown): Promise<boolean> {
  const id = resolveHljsLanguageId(lang);
  if (!id) return false;

  const eng = (globalThis as any).hljs;
  if (!eng || typeof eng.registerLanguage !== 'function') return false;
  if (typeof eng.getLanguage === 'function' && eng.getLanguage(id)) return true;

  let p = loading.get(id);
  if (!p) {
    p = (async () => {
      // Load dependencies first (e.g. dockerfile → bash)
      const deps = LANG_DEPS[id] || [];
      for (const dep of deps) {
        try {
          await ensureHljsLanguage(dep);
        } catch {
          /* continue — highlight still works without subLanguage */
        }
      }

      const url = hljsLanguageUrl(id);
      if (!url) return false;
      try {
        const mod = await importLanguageModule(url);
        const def = mod?.default ?? mod;
        return registerGrammar(eng, id, def);
      } catch (err) {
        // Allow retry on next ensure (extension reload, race, etc.)
        loading.delete(id);
        try {
          console.warn(
            '[pr+] failed to load hljs language',
            id,
            '— reload the extension (chrome://extensions) if you just rebuilt. URL:',
            url,
            err
          );
        } catch {
          /* ignore */
        }
        return false;
      }
    })();
    loading.set(id, p);
  }
  return p;
}

/** Resolve path → language id and ensure that grammar is loaded. */
export function ensureHljsLanguageForPath(filePath: unknown): Promise<boolean> {
  return ensureHljsLanguage(languageFromPath(filePath as string));
}

/**
 * Fire-and-forget prefetch for a set of paths/ids (e.g. visible diff files).
 */
export function prefetchHljsLanguages(
  langsOrPaths: Iterable<string>,
  opts: { fromPath?: boolean } = {}
): void {
  const seen = new Set<string>();
  for (const raw of langsOrPaths) {
    const id = opts.fromPath
      ? languageFromPath(raw)
      : resolveHljsLanguageId(raw) || String(raw || '').trim();
    if (!id || id === 'plaintext' || seen.has(id)) continue;
    seen.add(id);
    void ensureHljsLanguage(id);
  }
}

/** @internal test helper */
export function __resetHljsLazyForTests() {
  loading.clear();
  listeners.clear();
}
