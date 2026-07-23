import { languageFromPath } from '../../lib/diff-rows';
import { ensureHljsLanguage } from '../../lib/hljs-lazy';
import { enhanceMarkdownHtml } from '../../lib/ui-polish';

export const ROW_HEIGHT = 22;
/**
 * Estimated height for expanded inline review threads in the virtualized list.
 * Must not under-estimate: short spacer clips bottom content (threads + reply UI).
 */
/** Virtual-list estimate for expanded threads (not forced CSS min-height). */
export const COMMENT_ROW_HEIGHT = 220;
/**
 * @deprecated Same as COMMENT_ROW_HEIGHT — pending must not under-estimate or
 * the virtual list clips the card (composer / collapse toggle mis-hit).
 */
export const COMMENT_ROW_HEIGHT_PENDING = COMMENT_ROW_HEIGHT;
/** Collapsed thread chrome (filebar + 3-line preview) — keep tight to avoid dead space. */
export const COMMENT_ROW_HEIGHT_COLLAPSED = 76;

/**
 * @param {any} row
 * @param {{ isCollapsed?: (row: any) => boolean } | null | undefined} [opts]
 */
export function rowHeightFor(row, opts: any = null) {
  if (row?.kind === 'inline-comment') {
    const collapsed =
      typeof opts?.isCollapsed === 'function' ? Boolean(opts.isCollapsed(row)) : false;
    if (collapsed) return COMMENT_ROW_HEIGHT_COLLAPSED;
    // Pending and submitted threads share the same estimate so virtual offsets
    // match real card height (under-estimate clips bottom + breaks toggles).
    return COMMENT_ROW_HEIGHT;
  }
  // Symmetric @@ -N,M +N,M @@ headers are hidden unless they carry expand controls
  if (
    row?.lineType === 'hunk' &&
    row.hidden &&
    !row.expandAbove &&
    !row.expandBelow
  ) {
    return 0;
  }
  return ROW_HEIGHT;
}

export function averageRowHeight(rows, opts: any = null) {
  if (!rows?.length) return ROW_HEIGHT;
  let sum = 0;
  for (const r of rows) sum += rowHeightFor(r, opts);
  return sum / rows.length;
}

/**
 * Prefix offsets [0, h0, h0+h1, ...] for variable-height virtualization.
 * @returns {number[]} length = rows.length + 1; last entry is total height
 */
export function rowOffsets(rows: any[] | null | undefined, opts: any = null): number[] {
  const list = Array.isArray(rows) ? rows : [];
  const offsets = new Array(list.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < list.length; i++) {
    offsets[i + 1] = offsets[i] + rowHeightFor(list[i], opts);
  }
  return offsets;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Syntax-highlight cache: scroll re-renders the same visible lines repeatedly.
 * Key = language + code; bound size to avoid unbounded growth on huge PRs.
 */
const HIGHLIGHT_CACHE_MAX = 4000;
const highlightCache = new Map<string, string>();

/** @internal test/diag — clear cached hljs HTML */
export function clearHighlightCodeCache() {
  highlightCache.clear();
}

/** @internal test/diag */
export function highlightCodeCacheSize() {
  return highlightCache.size;
}

/**
 * Map markdown fence info strings (```ts, ```c++, ```shell) to registered hljs ids.
 * Empty string = plain escape (no grammar).
 */
export function normalizeFenceLang(info: unknown): string {
  const raw = String(info || '')
    .trim()
    .toLowerCase()
    // ```ts{...} or ```js title="x" — take first token
    .split(/[\s,{:=]+/)[0]
    .replace(/^language-/, '');
  if (!raw || raw === 'text' || raw === 'plain' || raw === 'plaintext' || raw === 'none') {
    return '';
  }
  const aliases: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    node: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    python3: 'python',
    rb: 'ruby',
    rs: 'rust',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    fish: 'bash',
    console: 'bash',
    yml: 'yaml',
    html: 'xml',
    htm: 'xml',
    xhtml: 'xml',
    svg: 'xml',
    vue: 'xml',
    svelte: 'xml',
    'c++': 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    hpp: 'cpp',
    h: 'c',
    'c#': 'csharp',
    cs: 'csharp',
    fs: 'fsharp',
    fsharp: 'fsharp',
    objc: 'objectivec',
    'objective-c': 'objectivec',
    'objectivec': 'objectivec',
    kt: 'kotlin',
    kts: 'kotlin',
    golang: 'go',
    ps1: 'powershell',
    pwsh: 'powershell',
    powershell: 'powershell',
    docker: 'dockerfile',
    make: 'makefile',
    mk: 'makefile',
    gql: 'graphql',
    proto: 'protobuf',
    md: 'markdown',
    patch: 'diff',
    toml: 'ini',
    conf: 'ini',
    properties: 'ini',
  };
  return aliases[raw] || raw;
}

/**
 * Sync highlight for a line or fenced block.
 * @param filePath used when opts.language is omitted (diff lines)
 * @param opts.language explicit fence / language id (markdown code blocks)
 *
 * If the grammar is not yet loaded, returns escaped HTML and kicks off a lazy
 * load — listeners re-render when the grammar arrives.
 */
export function highlightCode(
  code: unknown,
  filePath?: unknown,
  opts: { language?: string } = {}
) {
  const text = code == null ? '' : String(code);
  if (!text) return '';
  try {
    const eng = (globalThis as any).hljs;
    if (!eng) return escapeHtml(text);
    const explicit =
      opts.language != null && String(opts.language).trim() !== ''
        ? normalizeFenceLang(opts.language)
        : '';
    const lang =
      explicit ||
      (filePath != null && filePath !== ''
        ? languageFromPath(filePath as string) || ''
        : '');
    const langKey = lang === 'plaintext' ? '' : lang;
    // Request grammar if missing (no-op when already registered / unknown id)
    if (
      langKey &&
      typeof eng.getLanguage === 'function' &&
      !eng.getLanguage(langKey)
    ) {
      void ensureHljsLanguage(langKey);
    }
    const cacheKey = `${langKey}\0${text}`;
    const cached = highlightCache.get(cacheKey);
    if (cached != null) {
      // LRU-ish: re-insert so hot lines stay during scroll
      highlightCache.delete(cacheKey);
      highlightCache.set(cacheKey, cached);
      return cached;
    }
    let html: string;
    if (langKey && eng.getLanguage?.(langKey)) {
      html = eng.highlight(text, { language: langKey, ignoreIllegals: true }).value;
    } else {
      // Grammar still loading or unknown: plain escape (no highlightAuto —
      // auto needs many langs resident; we load on demand instead).
      html = escapeHtml(text);
    }
    if (highlightCache.size >= HIGHLIGHT_CACHE_MAX) {
      // Drop oldest ~12.5%
      const drop = Math.ceil(HIGHLIGHT_CACHE_MAX / 8);
      let i = 0;
      for (const k of highlightCache.keys()) {
        highlightCache.delete(k);
        if (++i >= drop) break;
      }
    }
    highlightCache.set(cacheKey, html);
    return html;
  } catch {
    return escapeHtml(text);
  }
}

/**
 * Highlight a markdown fenced code body (multi-line). Same cache as highlightCode.
 */
export function highlightFenceCode(code: unknown, fenceInfo: unknown): string {
  return highlightCode(code, null, { language: normalizeFenceLang(fenceInfo) });
}

/** Wire marked's fenced-code renderer once (idempotent). */
export function configureMarkedCodeHighlight(mdEngine?: any): boolean {
  const md = mdEngine || (globalThis as any).marked;
  if (!md || typeof md.use !== 'function') return false;
  if (md.__prpHljsCodeConfigured) return true;
  md.__prpHljsCodeConfigured = true;
  md.use({
    renderer: {
      code(token: any) {
        // marked v9+: { text, lang, escaped }; older: (code, infostring)
        let text: string;
        let lang: string;
        if (token && typeof token === 'object' && 'text' in token) {
          text = String(token.text ?? '');
          lang = String(token.lang ?? '');
        } else {
          text = String(token ?? '');
          lang = String(arguments[1] ?? '');
        }
        const id = normalizeFenceLang(lang);
        const body = highlightFenceCode(text, id || lang);
        const safeId = id ? escapeHtml(id) : '';
        const cls = id ? `hljs language-${safeId} prp-code` : 'prp-code';
        const langAttr = safeId ? ` data-lang="${safeId}"` : '';
        return `<pre class="prp-md-code"${langAttr}><code class="${cls}">${body}</code></pre>\n`;
      },
    },
  });
  return true;
}

/** Drop cache entries for one language after its grammar loads (or clear all). */
export function clearHighlightCodeCacheForLang(lang: unknown) {
  const id = String(lang || '');
  if (!id) {
    highlightCache.clear();
    return;
  }
  const prefix = `${id}\0`;
  for (const k of [...highlightCache.keys()]) {
    if (k.startsWith(prefix)) highlightCache.delete(k);
  }
}

export function renderMdHtml(raw, linkCtx) {
  try {
    const md = (globalThis as any).marked;
    const purify = (globalThis as any).DOMPurify;
    if (!md) return escapeHtml(raw).replace(/\n/g, '<br/>');
    configureMarkedCodeHighlight(md);
    let parsed =
      typeof md.parse === 'function' ? md.parse(raw) : typeof md === 'function' ? md(raw) : raw;
    const html = typeof parsed === 'string' ? parsed : String(parsed);
    // Keep hljs class names on pre/code (default purify already allows class;
    // be explicit for extension builds that tighten ALLOWED_ATTR).
    const clean = purify?.sanitize
      ? purify.sanitize(html, { ADD_ATTR: ['class', 'data-lang'] })
      : html;
    if (typeof enhanceMarkdownHtml === 'function') {
      return enhanceMarkdownHtml(clean, linkCtx || {});
    }
    return clean;
  } catch {
    return escapeHtml(raw).replace(/\n/g, '<br/>');
  }
}

export function avatarInitials(login) {
  const s = String(login || '?').trim();
  if (!s) return '?';
  return s.slice(0, 2).toUpperCase();
}

export function formatWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export function reviewStatusTone(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'APPROVED') return 'ok';
  if (s === 'CHANGES_REQUESTED') return 'danger';
  if (s === 'PENDING' || s === 'REVIEW_REQUIRED') return 'warn';
  return 'muted';
}
