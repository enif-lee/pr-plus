/** @module modal/lib/collapse */
/**
 * Default-collapse rules for PR files (binary / huge / generated).
 * Aligns with GitHub + linguist-style .gitattributes signals.
 */

/** Files with this many change lines (additions+deletions) start collapsed. */
export const DEFAULT_LARGE_CHANGES = 5000;
export const DEFAULT_LARGE_PATCH_CHARS = 80_000;

/** Common image extensions GitHub treats as non-text (no patch). */
const IMAGE_EXT_RE =
  /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif|jfif|pjpeg|pjp|tif{1,2})$/i;

/**
 * @param {unknown} path
 * @returns {boolean}
 */
export function isImagePath(path) {
  const p = String(path || '').split('?')[0].split('#')[0];
  return IMAGE_EXT_RE.test(p);
}

/**
 * Classify a PR file for diff presentation.
 * - image: renderable preview (added/replaced); not open as text
 * - binary: non-image blob / no patch — never open a textual body
 * - text: normal patch diff
 *
 * @param {{
 *   filename?: string,
 *   path?: string,
 *   patch?: string,
 *   binary?: boolean,
 *   mediaType?: string,
 *   contentType?: string,
 * }} file
 * @returns {{
 *   kind: 'image'|'binary'|'text',
 *   openableAsText: boolean,
 *   renderImage: boolean,
 * }}
 */
export function classifyDiffFile(file: any) {
  if (!file) {
    return { kind: 'binary', openableAsText: false, renderImage: false };
  }
  const path = file.filename || file.path || '';
  const patch = typeof file.patch === 'string' ? file.patch : '';
  const hasPatch = patch.length > 0;
  const media = String(file.mediaType || file.contentType || '').toLowerCase();
  const image =
    isImagePath(path) ||
    (media.startsWith('image/') && media !== 'image/svg+xml-not');

  if (image) {
    return { kind: 'image', openableAsText: false, renderImage: true };
  }
  if (hasPatch) {
    return { kind: 'text', openableAsText: true, renderImage: false };
  }
  // No textual patch: binary blob or oversized file GitHub omitted
  return { kind: 'binary', openableAsText: false, renderImage: false };
}

/**
 * Parse .gitattributes body into path-pattern → attributes map.
 * @param {string} text
 * @returns {Array<{ pattern: string, attrs: Record<string, string|boolean> }>}
 */
export function parseGitattributes(text) {
  const rules = [];
  if (!text || typeof text !== 'string') return rules;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const pattern = parts[0];
    const attrs: any = {};
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i];
      if (p.startsWith('-')) {
        attrs[p.slice(1)] = false;
      } else if (p.includes('=')) {
        const [k, v] = p.split('=');
        attrs[k] = v;
      } else {
        attrs[p] = true;
      }
    }
    rules.push({ pattern, attrs });
  }
  return rules;
}

/**
 * Simple gitignore-style match for attributes patterns (basename or ** suffix).
 * @param {string} filePath
 * @param {string} pattern
 */
export function matchAttrPattern(filePath, pattern) {
  if (!filePath || !pattern) return false;
  const path = filePath.replace(/^\/+/, '');
  if (pattern === path) return true;
  // **/foo or *.min.js style
  if (pattern.startsWith('**/')) {
    const rest = pattern.slice(3);
    return path === rest || path.endsWith(`/${rest}`) || path.endsWith(rest);
  }
  if (pattern.startsWith('*.')) {
    return path.endsWith(pattern.slice(1));
  }
  if (pattern.includes('*')) {
    const re = new RegExp(
      '^' +
        pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*\*/g, '§§')
          .replace(/\*/g, '[^/]*')
          .replace(/§§/g, '.*') +
        '$'
    );
    return re.test(path);
  }
  return path === pattern || path.endsWith(`/${pattern}`);
}

/**
 * Resolve attributes for a path (later rules override).
 * @param {string} filePath
 * @param {Array<{ pattern: string, attrs: Record<string, string|boolean> }>} rules
 */
export function attributesForPath(filePath, rules) {
  const out: any = {};
  if (!Array.isArray(rules)) return out;
  for (const rule of rules) {
    if (matchAttrPattern(filePath, rule.pattern)) {
      Object.assign(out, rule.attrs);
    }
  }
  return out;
}

/**
 * gitattributes values arrive as booleans (flag form) or strings ("true"/"false"
 * from key=value). Treat truthy-enabled forms as on.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isAttrEnabled(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === '' || v === 'false' || v === '0' || v === 'no' || v === 'unset') {
      return false;
    }
    // "true", "set", "yes", "1", or bare presence-like values
    return true;
  }
  return Boolean(value);
}

/**
 * Whether a PR file should start collapsed in the diff view.
 * @param {{ filename?: string, path?: string, patch?: string, changes?: number, additions?: number, deletions?: number, status?: string, linguistGenerated?: boolean, binary?: boolean }} file
 * @param {{ rules?: Array, largeChanges?: number, largePatchChars?: number }} [opts]
 */
export function shouldCollapseFile(file: any, opts: any = {}) {
  if (!file) return true;
  const path = file.filename || file.path || '';
  const patch = file.patch || '';
  const changes =
    file.changes ??
    (Number(file.additions || 0) + Number(file.deletions || 0));
  const largeChanges = opts.largeChanges ?? DEFAULT_LARGE_CHANGES;
  const largePatchChars = opts.largePatchChars ?? DEFAULT_LARGE_PATCH_CHARS;
  const rules = opts.rules || [];
  const classified = classifyDiffFile(file);

  const attrs = attributesForPath(path, rules);
  if (
    isAttrEnabled(file.linguistGenerated) ||
    isAttrEnabled(attrs['linguist-generated'])
  ) {
    return true;
  }
  if (isAttrEnabled(file.binary) || isAttrEnabled(attrs.binary)) {
    // Explicit binary attr: collapse (images still classified for render when expanded)
    return true;
  }
  // `-diff` sets attrs.diff=false; `diff=false` arrives as string
  if (attrs.diff === false || String(attrs.diff || '').toLowerCase() === 'false') {
    return true;
  }
  // Non-image blob / no patch: header-only and start collapsed
  if (classified.kind === 'binary') return true;
  // Large text change threshold (≥ 5000 by default)
  if (changes >= largeChanges) return true;
  if (patch && patch.length >= largePatchChars) return true;
  // Images without patch: keep expanded so previews show (unless rules above)
  if (classified.kind === 'image') return false;
  // GitHub omits patch for oversized text — collapse
  if (!patch) return true;

  // Common generated / lockfile noise
  const lower = path.toLowerCase();
  if (
    lower.endsWith('package-lock.json') ||
    lower.endsWith('yarn.lock') ||
    lower.endsWith('pnpm-lock.yaml') ||
    lower.endsWith('.min.js') ||
    lower.endsWith('.min.css') ||
    lower.endsWith('.map') ||
    lower.includes('/dist/') ||
    lower.endsWith('.bundle.js')
  ) {
    return true;
  }

  return false;
}

/**
 * Annotate files with collapse + attrs metadata (pure).
 * Always re-runnable with gitattributesText so SW weak defaults can be upgraded.
 * @param {object[]} files
 * @param {string} [gitattributesText]
 */
export function annotateFilesForCollapse(files, gitattributesText) {
  const rules = parseGitattributes(gitattributesText || '');
  return (Array.isArray(files) ? files : []).map((f) => {
    const path = f.filename || f.path || '';
    const attrs = attributesForPath(path, rules);
    const enriched = {
      ...f,
      linguistGenerated:
        isAttrEnabled(f.linguistGenerated) ||
        isAttrEnabled(attrs['linguist-generated']),
      binary: isAttrEnabled(f.binary) || isAttrEnabled(attrs.binary),
    };
    const classified = classifyDiffFile(enriched);
    const collapsed = shouldCollapseFile(enriched, { rules });
    return {
      ...f,
      attrs,
      fileKind: classified.kind,
      openableAsText: classified.openableAsText,
      renderImage: classified.renderImage,
      defaultCollapsed: collapsed,
    };
  });
}

function toPathSet(paths) {
  if (!paths) return new Set();
  if (paths instanceof Set) return paths;
  return new Set(Array.isArray(paths) ? paths : []);
}

/**
 * Effective collapsed state for a path.
 * Empty `collapsedPaths` means "use defaults": binary/huge/generated + viewed.
 * Non-empty means an explicit set of collapsed paths only.
 *
 * @param {string} path
 * @param {Set<string>|string[]|null|undefined} collapsedPaths
 * @param {boolean} [defaultCollapsed]
 * @param {boolean} [expandAll]
 * @param {Set<string>|string[]|null|undefined} [viewedPaths]
 */
export function isPathCollapsed(
  path,
  collapsedPaths,
  defaultCollapsed = false,
  expandAll = false,
  viewedPaths = null
) {
  if (expandAll || !path) return false;
  const set = toPathSet(collapsedPaths);
  if (set.has(path)) return true;
  if (set.size === 0) {
    if (defaultCollapsed === true) return true;
    if (toPathSet(viewedPaths).has(path)) return true;
  }
  return false;
}

/**
 * Paths that start collapsed by default (for materializing on first toggle).
 * Includes defaultCollapsed files and viewed paths.
 * @param {Array<{ filename?: string, path?: string, defaultCollapsed?: boolean }>} files
 * @param {Set<string>|string[]|null|undefined} [viewedPaths]
 * @returns {Set<string>}
 */
export function defaultCollapsedPathSet(files, viewedPaths = null) {
  const out = new Set();
  for (const f of Array.isArray(files) ? files : []) {
    if (!f?.defaultCollapsed) continue;
    const p = f.filename || f.path;
    if (p) out.add(p);
  }
  for (const p of toPathSet(viewedPaths)) {
    if (p) out.add(p);
  }
  return out;
}

/**
 * Materialize implicit defaults into an explicit collapsed set.
 * First user expand/collapse must not open every other default-collapsed file.
 *
 * @param {Set<string>|string[]|null|undefined} collapsedPaths
 * @param {Array<{ filename?: string, path?: string, defaultCollapsed?: boolean }>} files
 * @param {Set<string>|string[]|null|undefined} [viewedPaths]
 * @returns {Set<string>}
 */
export function materializeCollapsedPaths(collapsedPaths, files, viewedPaths = null) {
  if (collapsedPaths instanceof Set && collapsedPaths.size > 0) {
    return new Set(collapsedPaths);
  }
  if (Array.isArray(collapsedPaths) && collapsedPaths.length > 0) {
    return new Set(collapsedPaths);
  }
  return defaultCollapsedPathSet(files, viewedPaths);
}
