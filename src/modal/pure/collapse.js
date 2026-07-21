/**
 * Default-collapse rules for PR files (binary / huge / generated).
 * Aligns with GitHub + linguist-style .gitattributes signals.
 */

const DEFAULT_LARGE_CHANGES = 500;
const DEFAULT_LARGE_PATCH_CHARS = 80_000;

/**
 * Parse .gitattributes body into path-pattern → attributes map.
 * @param {string} text
 * @returns {Array<{ pattern: string, attrs: Record<string, string|boolean> }>}
 */
function parseGitattributes(text) {
  const rules = [];
  if (!text || typeof text !== 'string') return rules;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const pattern = parts[0];
    const attrs = {};
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
function matchAttrPattern(filePath, pattern) {
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
function attributesForPath(filePath, rules) {
  const out = {};
  if (!Array.isArray(rules)) return out;
  for (const rule of rules) {
    if (matchAttrPattern(filePath, rule.pattern)) {
      Object.assign(out, rule.attrs);
    }
  }
  return out;
}

/**
 * Whether a PR file should start collapsed in the diff view.
 * @param {{ filename?: string, path?: string, patch?: string, changes?: number, additions?: number, deletions?: number, status?: string, linguistGenerated?: boolean, binary?: boolean }} file
 * @param {{ rules?: Array, largeChanges?: number, largePatchChars?: number }} [opts]
 */
function shouldCollapseFile(file, opts = {}) {
  if (!file) return true;
  const path = file.filename || file.path || '';
  const patch = file.patch || '';
  const changes =
    file.changes ??
    (Number(file.additions || 0) + Number(file.deletions || 0));
  const largeChanges = opts.largeChanges ?? DEFAULT_LARGE_CHANGES;
  const largePatchChars = opts.largePatchChars ?? DEFAULT_LARGE_PATCH_CHARS;
  const rules = opts.rules || [];

  const attrs = attributesForPath(path, rules);
  if (file.linguistGenerated === true || attrs['linguist-generated'] === true) {
    return true;
  }
  if (file.binary === true || attrs.binary === true || attrs['-diff'] === true || attrs.diff === false) {
    return true;
  }
  // GitHub omits patch for binary / too large
  if (!patch) return true;
  if (changes >= largeChanges) return true;
  if (patch.length >= largePatchChars) return true;

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
 * @param {object[]} files
 * @param {string} [gitattributesText]
 */
function annotateFilesForCollapse(files, gitattributesText) {
  const rules = parseGitattributes(gitattributesText || '');
  return (Array.isArray(files) ? files : []).map((f) => {
    const path = f.filename || f.path || '';
    const attrs = attributesForPath(path, rules);
    const collapsed = shouldCollapseFile(
      {
        ...f,
        linguistGenerated:
          f.linguistGenerated === true || attrs['linguist-generated'] === true,
        binary: f.binary === true || attrs.binary === true,
      },
      { rules }
    );
    return {
      ...f,
      attrs,
      defaultCollapsed: collapsed,
    };
  });
}

const api = {
  parseGitattributes,
  matchAttrPattern,
  attributesForPath,
  shouldCollapseFile,
  annotateFilesForCollapse,
  DEFAULT_LARGE_CHANGES,
  DEFAULT_LARGE_PATCH_CHARS,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalCollapse = api;
}
