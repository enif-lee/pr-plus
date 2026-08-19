import { languageFromPath } from '../../lib/diff-rows';
import { ensureHljsLanguage } from '../../lib/hljs-lazy';
import {
  enhanceMarkdownHtml,
  isGithubVideoAttachmentUrl,
} from '../../lib/ui-polish';

/**
 * Fixed height (px) for plain Diff code / header rows in the virtual list.
 * Matches GitHub PR density (~20px line box) — keep in sync with
 * `--prp-diff-row-h` on `.prp-vlist-host`.
 */
export const ROW_HEIGHT = 20;
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
/** Collapsed thread chrome (filebar + 2-line body preview) — keep tight. */
export const COMMENT_ROW_HEIGHT_COLLAPSED = 76;
/** Estimated height for rendered image previews in the virtualized diff list. */
export const IMAGE_ROW_HEIGHT = 220;
/** Soft cap so a mega-thread cannot dominate spacer before measure. */
export const COMMENT_ROW_HEIGHT_MAX = 1600;

/**
 * Stable measure-map key for variable-height Diff virtual rows.
 * Fixed-height rows (plain code / header / meta) return null.
 *
 * - inline-comment → `c:{commentId}`
 * - diff-image → `img:{path|rowIndex}`
 * - expanded code line → same format as line-expand.diffLineExpandKey
 *   (`{path}#{lineType}:{old}:{new}`) so measure map survives rowIndex shifts
 */
export function diffRowMeasureKey(
  row: any,
  opts?: { expandedKeys?: Set<string> | null } | null
): string | null {
  if (!row) return null;
  if (row.kind === 'inline-comment' && row.commentId != null) {
    // Include body/reply fingerprint so shell→full hydrate and expand re-measure
    // (stale short heights clip markdown under .prp-vline overflow:hidden).
    const bodyLen = Math.max(
      String(row.body || '').length,
      String(row.root?.body || '').length,
      String(row.comment?.body || '').length
    );
    const replies = Array.isArray(row.replies)
      ? row.replies.length
      : Number.isFinite(Number(row.replyCount))
        ? Number(row.replyCount)
        : 0;
    const loaded = row.commentsLoaded === false ? '0' : '1';
    return `c:${row.commentId}:b${bodyLen}:r${replies}:L${loaded}`;
  }
  if (row.kind === 'diff-image') {
    const path = String(row.filePath || row.path || '');
    if (path) return `img:${path}`;
    const ri = Number(row.rowIndex);
    return Number.isFinite(ri) ? `img:#${ri}` : null;
  }
  if (row.kind === 'diff-line') {
    const t = row.lineType;
    if (t !== 'add' && t !== 'del' && t !== 'change' && t !== 'context') {
      return null;
    }
    const path = String(row.filePath || row.path || '');
    if (!path) return null;
    const oldL =
      row.oldLine != null && row.oldLine !== '' ? String(row.oldLine) : '';
    const newL =
      row.newLine != null && row.newLine !== '' ? String(row.newLine) : '';
    let key: string | null = null;
    if (oldL || newL) {
      key = `${path}#${t}:${oldL}:${newL}`;
    } else {
      const ri = Number(row.rowIndex);
      if (!Number.isFinite(ri)) return null;
      key = `${path}#${t}:ri${ri}`;
    }
    // Only measure when expanded (or caller already tracks this key)
    if (opts?.expandedKeys?.has?.(key)) return key;
    return null;
  }
  return null;
}

/**
 * Estimate open-thread height from row shape (before ResizeObserver).
 * Floors at COMMENT_ROW_HEIGHT so under-estimate never clips the card.
 */
export function estimateInlineCommentHeight(
  row: any,
  opts: { isCollapsed?: (row: any) => boolean } | null = null
): number {
  const collapsed =
    typeof opts?.isCollapsed === 'function'
      ? Boolean(opts.isCollapsed(row))
      : false;
  if (collapsed) return COMMENT_ROW_HEIGHT_COLLAPSED;

  let replies = 0;
  if (Array.isArray(row?.replies)) replies = row.replies.length;
  else if (Number.isFinite(Number(row?.replyCount))) {
    replies = Math.max(0, Number(row.replyCount));
  }
  const bodyLen = Math.max(
    String(row?.body || '').length,
    String(row?.root?.body || '').length,
    String(row?.comment?.body || '').length
  );
  // Chrome (filebar + author + reactions + reply composer) + body.
  // Prefer slight over-estimate: under-estimate + overflow:hidden clips markdown.
  let h = 200; // chrome + single comment baseline (incl. reply row)
  // ~40 chars/line at 14px; Korean packs denser — use /2.8 not /3.5
  h += Math.min(520, Math.floor(bodyLen / 2.8) * 1.15);
  h += Math.min(12, replies) * 72;
  if (
    isGithubVideoAttachmentUrl(row?.body) ||
    isGithubVideoAttachmentUrl(row?.root?.body) ||
    isGithubVideoAttachmentUrl(row?.comment?.body)
  ) {
    h += 360;
  }
  if (row?.pending || row?.root?.pending) h += 96; // reply composer room
  if (row?.path || row?.root?.path) h += 28; // file bar
  // Reactions row + padding under body
  h += 36;
  return Math.max(
    COMMENT_ROW_HEIGHT,
    Math.min(COMMENT_ROW_HEIGHT_MAX, Math.round(h))
  );
}

/**
 * @param {any} row
 * @param {{
 *   isCollapsed?: (row: any) => boolean,
 *   expandedKeys?: Set<string> | null,
 *   measuredHeights?: Map<string, number> | null,
 *   expandedCodeLineHeight?: (row: any, opts: any) => number | null,
 * } | null | undefined} [opts]
 */
export function rowHeightFor(row: any, opts: any = null) {
  // Measured heights win for any variable row (comments, images, expanded lines).
  // For comments, ignore a stale expanded measure while collapsed (RO will re-publish).
  const measureKey = diffRowMeasureKey(row, opts);
  if (measureKey && opts?.measuredHeights) {
    const m = opts.measuredHeights.get?.(measureKey);
    if (m != null && Number.isFinite(m) && m > 0) {
      if (row?.kind === 'inline-comment') {
        const collapsed =
          typeof opts?.isCollapsed === 'function'
            ? Boolean(opts.isCollapsed(row))
            : false;
        if (collapsed) {
          if (m <= COMMENT_ROW_HEIGHT_COLLAPSED + 60) {
            return Math.max(40, Math.ceil(m));
          }
          // Stale open measure — fall through to collapsed estimate
        } else {
          return Math.max(COMMENT_ROW_HEIGHT_COLLAPSED, Math.ceil(m));
        }
      } else if (row?.kind === 'diff-line') {
        // Mega-line dblclick expand: never let RO scrollHeight blow the virtualizer.
        const capped =
          typeof opts?.expandedCodeLineHeight === 'function'
            ? opts.expandedCodeLineHeight(row, opts)
            : Math.min(ROW_HEIGHT * 48, Math.max(ROW_HEIGHT, Math.ceil(m)));
        if (capped != null && Number.isFinite(capped) && capped > 0) {
          return Math.max(ROW_HEIGHT, capped);
        }
        return Math.min(ROW_HEIGHT * 48, Math.max(ROW_HEIGHT, Math.ceil(m)));
      } else {
        return Math.max(ROW_HEIGHT, Math.ceil(m));
      }
    }
  }

  if (row?.kind === 'inline-comment') {
    return estimateInlineCommentHeight(row, opts);
  }
  if (row?.kind === 'diff-image') {
    return IMAGE_ROW_HEIGHT;
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
  // Expanded long code lines (ellipsis → multi-line)
  if (opts?.expandedKeys?.size && row?.kind === 'diff-line') {
    if (typeof opts.expandedCodeLineHeight === 'function') {
      const h = opts.expandedCodeLineHeight(row, opts);
      if (h != null && Number.isFinite(h) && h > 0) return Math.max(ROW_HEIGHT, h);
    } else {
      // Lazy import-free path: inline estimate via measured map only
      const path = String(row.filePath || row.path || '');
      const ri = Number(row.rowIndex);
      if (Number.isFinite(ri)) {
        const key = `${path}#${ri}`;
        if (opts.expandedKeys.has(key)) {
          // Fallback estimate without circular import
          const len = Math.max(
            String(row.text || '').length,
            String(row.code || '').length,
            String(row.leftCode || '').length,
            String(row.rightCode || '').length
          );
          const lines = Math.min(48, Math.max(1, Math.ceil(len / 100)));
          return Math.max(ROW_HEIGHT, lines * ROW_HEIGHT);
        }
      }
    }
  }
  return ROW_HEIGHT;
}

export function averageRowHeight(rows: any, opts: any = null) {
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

export function escapeHtml(s: any) {
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

export function renderMdHtml(raw: any, linkCtx: any) {
  try {
    const md = (globalThis as any).marked;
    const purify = (globalThis as any).DOMPurify;
    // Expand :shortcode: → Unicode before markdown parse (preview + feed)
    let source = String(raw ?? '');
    try {
      const expand =
        typeof (globalThis as any).PRModalMarkdownComposer
          ?.expandEmojiShortcodes === 'function'
          ? (globalThis as any).PRModalMarkdownComposer.expandEmojiShortcodes
          : null;
      if (expand) source = expand(source);
      else {
        // Bundled modal path: direct import not available here; inline light expand
        // via marked-time dynamic require avoided — MarkdownView uses expand pre-call.
      }
    } catch {
      /* keep raw */
    }
    if (!md) return escapeHtml(source).replace(/\n/g, '<br/>');
    configureMarkedCodeHighlight(md);
    let parsed =
      typeof md.parse === 'function'
        ? md.parse(source)
        : typeof md === 'function'
          ? md(source)
          : source;
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

export function avatarInitials(login: any) {
  const s = String(login || '?').trim();
  if (!s) return '?';
  return s.slice(0, 2).toUpperCase();
}

export function formatWhen(iso: any) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export function reviewStatusTone(status: any) {
  const s = String(status || '').toUpperCase();
  if (s === 'APPROVED') return 'ok';
  if (s === 'CHANGES_REQUESTED') return 'danger';
  if (s === 'PENDING' || s === 'REVIEW_REQUIRED') return 'warn';
  return 'muted';
}
