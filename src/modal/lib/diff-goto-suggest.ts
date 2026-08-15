/**
 * Diff Goto floating suggestions: rank by change volume (idle) and
 * contains + initial-match filters (typed query).
 */

export type GotoFileLike = {
  filename?: string;
  path?: string;
  previous_filename?: string;
  changes?: number;
  additions?: number;
  deletions?: number;
  [k: string]: unknown;
};

export type GotoSuggestion = {
  path: string;
  /** additions+deletions or GitHub `changes` */
  volume: number;
  /** match score (higher = better); 0 when idle ranking */
  score: number;
};

/** Total line changes for ranking (most-changed first). */
export function fileChangeVolume(file: GotoFileLike | null | undefined): number {
  if (!file || typeof file !== 'object') return 0;
  const c = Number((file as any).changes);
  if (Number.isFinite(c) && c >= 0) return c;
  const a = Number((file as any).additions);
  const d = Number((file as any).deletions);
  return (Number.isFinite(a) ? a : 0) + (Number.isFinite(d) ? d : 0);
}

export function filePathOf(file: GotoFileLike | null | undefined): string {
  if (!file) return '';
  return String(
    (file as any).filename || (file as any).path || (file as any).previous_filename || ''
  ).trim();
}

/**
 * Initials from a single path segment / identifier.
 * - PascalCase / camelCase: FooBar → fb, XMLParser → xp (letter groups)
 * - snake / kebab: foo_bar-baz → fbb
 * - whitespace: foo bar → fb
 */
export function segmentInitials(segment: string): string {
  const s = String(segment || '').trim();
  if (!s) return '';
  // Prefer split on non-alphanumeric
  const parts = s.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length > 1) {
    return parts
      .map((p) => p[0] || '')
      .join('')
      .toLowerCase();
  }
  // camelCase / PascalCase: boundary before capitals
  const camel = s.match(/[A-Z]?[a-z0-9]+|[A-Z]+(?![a-z])/g);
  if (camel && camel.length > 1) {
    return camel
      .map((p) => p[0] || '')
      .join('')
      .toLowerCase();
  }
  return s[0] ? s[0].toLowerCase() : '';
}

/**
 * Path-level initials: `/abc/def/gg` → `adg` (segment first letters).
 * Also concatenates identifier initials for the basename.
 */
export function pathInitials(path: string): string {
  const p = String(path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!p) return '';
  const segs = p.split('/').filter(Boolean);
  const fromSegs = segs
    .map((seg) => {
      // Prefer first letter of segment (path initial match adg)
      const base = seg.split('.').slice(0, -1).join('.') || seg;
      return (base[0] || seg[0] || '').toLowerCase();
    })
    .join('');
  const baseName = segs[segs.length - 1] || '';
  const baseNoExt = baseName.includes('.')
    ? baseName.slice(0, baseName.lastIndexOf('.'))
    : baseName;
  const fromIdent = segmentInitials(baseNoExt);
  // Unique candidates joined for matching
  return [fromSegs, fromIdent].filter(Boolean).join(' ');
}

/**
 * Whether path matches free-text query via contains or initial rules.
 * Returns score: higher is better (exact prefix > contains > initials).
 */
export function scoreFilePathMatch(path: string, query: string): number {
  const p = String(path || '');
  const q = String(query || '').trim().toLowerCase();
  if (!q) return 0;
  if (!p) return 0;
  const pl = p.toLowerCase();
  const base = pl.split('/').pop() || pl;

  if (pl === q || base === q) return 1000;
  if (base.startsWith(q)) return 800 - Math.min(200, base.length);
  if (pl.startsWith(q)) return 700 - Math.min(200, pl.length);
  if (base.includes(q)) return 500 - Math.min(200, base.indexOf(q));
  if (pl.includes(q)) return 400 - Math.min(200, pl.indexOf(q));

  // Initial match: query letters as initials
  const initialsBlob = pathInitials(p).replace(/\s+/g, '');
  const identOnly = segmentInitials(
    (p.split('/').pop() || '').replace(/\.[^.]+$/, '')
  );
  const qCompact = q.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (qCompact) {
    if (initialsBlob === qCompact || identOnly === qCompact) return 600;
    if (initialsBlob.startsWith(qCompact) || identOnly.startsWith(qCompact))
      return 550;
    if (initialsBlob.includes(qCompact) || identOnly.includes(qCompact))
      return 450;
    // Subsequence of path segment initials (a d g for adg already exact)
    if (isSubsequence(qCompact, initialsBlob) || isSubsequence(qCompact, identOnly))
      return 350;
  }
  return 0;
}

function isSubsequence(needle: string, hay: string): boolean {
  if (!needle || !hay) return false;
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) i++;
  }
  return i === needle.length;
}

export function filePathMatchesQuery(path: string, query: string): boolean {
  return scoreFilePathMatch(path, query) > 0;
}

/**
 * Path portion of a Goto query (strip trailing `:line[:line]`; bare line → empty).
 * Same strip rules as `rankGotoFileSuggestions`.
 */
export function gotoPathQueryForMatch(query: string): string {
  const q = String(query || '').trim();
  if (!q) return '';
  if (/^\d+(:\d+)?$/.test(q)) return '';
  const m = q.match(/^(.*?)(?::\d+){1,2}$/);
  if (m && m[1] != null && m[1].length) return m[1];
  return q;
}

export type GotoMatchRange = {
  start: number;
  end: number;
  mode: 'contains' | 'initial';
};

export type GotoPathSegment = {
  text: string;
  bold: boolean;
};

/**
 * Character ranges in `path` to bold for the active match mode.
 * - **contains**: first case-insensitive contiguous hit of the query
 * - **initial**: path-segment first letters (or basename camel initials) that
 *   form a subsequence / prefix of the compact query
 * Idle / no match → empty (no invented spans).
 */
export function gotoMatchRanges(
  path: string,
  query: string
): GotoMatchRange[] {
  const p = String(path || '');
  const pathQ = gotoPathQueryForMatch(query);
  if (!p || !pathQ) return [];

  const pl = p.toLowerCase();
  const ql = pathQ.toLowerCase();

  // Contains (substring) — prefer over initial when both would match
  const idx = pl.indexOf(ql);
  if (idx >= 0) {
    return [{ start: idx, end: idx + pathQ.length, mode: 'contains' }];
  }

  // Initial: segment-first-letter positions in the path string
  const segStarts = pathSegmentStartIndices(p);
  const qCompact = ql.replace(/[^a-z0-9]/g, '');
  if (!qCompact) return [];

  const fromSegs = matchInitialsAgainstPositions(p, qCompact, segStarts);
  if (fromSegs.length) return fromSegs;

  // Basename camelCase / snake initials (e.g. FooBar → fb)
  const segs = p.replace(/\\/g, '/').split('/');
  const baseName = segs[segs.length - 1] || '';
  const baseNoExt = baseName.includes('.')
    ? baseName.slice(0, baseName.lastIndexOf('.'))
    : baseName;
  const baseOffset = p.length - baseName.length;
  const identStarts = identifierInitialIndices(baseNoExt).map(
    (i) => baseOffset + i
  );
  return matchInitialsAgainstPositions(p, qCompact, identStarts);
}

/**
 * Split path into plain / bold segments for suggestion rendering.
 */
export function gotoHighlightSegments(
  path: string,
  query: string
): GotoPathSegment[] {
  const p = String(path || '');
  if (!p) return [];
  const ranges = gotoMatchRanges(p, query);
  if (!ranges.length) return [{ text: p, bold: false }];

  const marks = new Array<boolean>(p.length).fill(false);
  for (const r of ranges) {
    const a = Math.max(0, Math.min(p.length, r.start));
    const b = Math.max(a, Math.min(p.length, r.end));
    for (let i = a; i < b; i++) marks[i] = true;
  }

  const out: GotoPathSegment[] = [];
  let i = 0;
  while (i < p.length) {
    const bold = marks[i];
    let j = i + 1;
    while (j < p.length && marks[j] === bold) j++;
    out.push({ text: p.slice(i, j), bold });
    i = j;
  }
  return out;
}

/** First letter index of each path segment (skip empty). */
function pathSegmentStartIndices(path: string): number[] {
  const p = String(path || '');
  const out: number[] = [];
  let i = 0;
  while (i < p.length) {
    // skip slashes
    while (i < p.length && (p[i] === '/' || p[i] === '\\')) i++;
    if (i >= p.length) break;
    // first alnum in this segment (or first char)
    let j = i;
    while (j < p.length && p[j] !== '/' && p[j] !== '\\') {
      if (/[A-Za-z0-9]/.test(p[j])) {
        out.push(j);
        break;
      }
      j++;
    }
    if (j === i || (j < p.length && p[j] !== '/' && p[j] !== '\\' && !/[A-Za-z0-9]/.test(p[j]))) {
      // no alnum — still count first char of segment if any
      if (i < p.length && p[i] !== '/' && p[i] !== '\\' && !out.includes(i)) {
        out.push(i);
      }
    }
    while (i < p.length && p[i] !== '/' && p[i] !== '\\') i++;
  }
  return out;
}

/** Indices of identifier initials inside a single basename (no path). */
function identifierInitialIndices(ident: string): number[] {
  const s = String(ident || '');
  if (!s) return [];
  const parts = s.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length > 1) {
    const idxs: number[] = [];
    let searchFrom = 0;
    for (const part of parts) {
      const at = s.indexOf(part, searchFrom);
      if (at >= 0) {
        idxs.push(at);
        searchFrom = at + part.length;
      }
    }
    return idxs;
  }
  const camel = s.match(/[A-Z]?[a-z0-9]+|[A-Z]+(?![a-z])/g);
  if (camel && camel.length > 1) {
    const idxs: number[] = [];
    let searchFrom = 0;
    for (const part of camel) {
      const at = s.indexOf(part, searchFrom);
      if (at >= 0) {
        idxs.push(at);
        searchFrom = at + part.length;
      }
    }
    return idxs;
  }
  return s[0] ? [0] : [];
}

function matchInitialsAgainstPositions(
  path: string,
  qCompact: string,
  positions: number[]
): GotoMatchRange[] {
  if (!qCompact || !positions.length) return [];
  const ranges: GotoMatchRange[] = [];
  let qi = 0;
  for (const pos of positions) {
    if (qi >= qCompact.length) break;
    if (pos < 0 || pos >= path.length) continue;
    if (path[pos].toLowerCase() === qCompact[qi]) {
      ranges.push({ start: pos, end: pos + 1, mode: 'initial' });
      qi++;
    }
  }
  return qi === qCompact.length ? ranges : [];
}

/**
 * Rank suggestions for Diff Goto.
 * - Empty query: most-changed first, top `idleLimit` (default 3).
 * - Typed query: matches only, score then volume, top `searchLimit` (default 12).
 */
/**
 * Resolve the query string submitted on Enter / suggestion confirm.
 * Bare line forms (`42`, `10:20`) always win — never replace with a
 * suggestion path (idle top-N still shows files while typing only digits).
 */
export function resolveGotoSubmitQuery(
  typed: string,
  activeSuggestionPath: string | null | undefined
): string {
  const t = String(typed || '').trim();
  const hit = String(activeSuggestionPath || '').trim();
  // Idle Enter (empty typed + highlighted suggestion) → jump to that file
  if (!t) return hit || '';
  // Bare line or line:line — current-file Goto (never override with idle top file)
  if (/^\d+(:\d+)?$/.test(t)) return t;
  if (hit) {
    // path:line[:line] typed — keep line suffix on the selected file
    const lineSuffix = t.match(/(:\d+(?::\d+)?)$/);
    if (lineSuffix) {
      const before = t.slice(0, t.length - lineSuffix[1].length);
      if (before && !/^\d+$/.test(before)) {
        return hit + lineSuffix[1];
      }
    }
    return hit;
  }
  return t;
}

export function rankGotoFileSuggestions(
  files: GotoFileLike[] | null | undefined,
  query: string,
  opts: { idleLimit?: number; searchLimit?: number } = {}
): GotoSuggestion[] {
  const list = Array.isArray(files) ? files : [];
  const idleLimit =
    Number.isFinite(opts.idleLimit) && Number(opts.idleLimit) > 0
      ? Math.floor(Number(opts.idleLimit))
      : 3;
  const searchLimit =
    Number.isFinite(opts.searchLimit) && Number(opts.searchLimit) > 0
      ? Math.floor(Number(opts.searchLimit))
      : 12;
  const q = String(query || '').trim();

  // Strip trailing :line[:line] for path matching
  let pathQuery = q;
  if (q) {
    const m = q.match(/^(.*?)(?::\d+){1,2}$/);
    if (m && m[1] != null && m[1].length) pathQuery = m[1];
    else if (/^\d+(:\d+)?$/.test(q)) {
      // bare line query — no path filter; show idle top by volume
      pathQuery = '';
    }
  }

  const rows: GotoSuggestion[] = [];
  for (const f of list) {
    const path = filePathOf(f);
    if (!path) continue;
    const volume = fileChangeVolume(f);
    if (!pathQuery) {
      rows.push({ path, volume, score: 0 });
      continue;
    }
    const score = scoreFilePathMatch(path, pathQuery);
    if (score > 0) rows.push({ path, volume, score });
  }

  if (!pathQuery) {
    rows.sort((a, b) => b.volume - a.volume || a.path.localeCompare(b.path));
    return rows.slice(0, idleLimit);
  }
  rows.sort(
    (a, b) =>
      b.score - a.score || b.volume - a.volume || a.path.localeCompare(b.path)
  );
  return rows.slice(0, searchLimit);
}
