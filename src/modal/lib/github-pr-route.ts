/**
 * GitHub-native PR URL parse/build (path + #diff-… line anchors).
 * Write-path prefers /pull/N/changes[/{sha}|/{a}..{b}]#diff-{sha256(path)}R… 
 * Read-path also accepts /files. Pure — no React/DOM.
 */

import type { DiffCommitFilter } from './diff-commit-filter';
import { normalizeDiffCommitFilter, isAllCommitsFilter } from './diff-commit-filter';

export type GithubPrRoute = {
  owner: string;
  repo: string;
  number: number;
  /** conversation | diff (files/changes surface) */
  page: 'conversation' | 'diff';
  /** Single commit or range start (full or abbreviated sha) */
  commitSha?: string | null;
  /** Range end sha when path is a..b */
  commitEndSha?: string | null;
  /** File path for #diff- (preferred over fileKey alone) */
  filePath?: string | null;
  /** SHA-256 hex of path when known from hash only */
  fileKey?: string | null;
  startLine?: number | null;
  endLine?: number | null;
  /** RIGHT → R, LEFT → L in fragment */
  side?: 'LEFT' | 'RIGHT' | null;
  /** Tab token as found (files|changes|'') */
  tab?: string | null;
};

/** Normalize path the way GitHub hashes it (no leading slash). */
export function normalizeGithubFilePath(filePath: unknown): string {
  return String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();
}

/**
 * Sync SHA-256 hex of UTF-8 text.
 * Prefer Node crypto when available; else pure implementation (content script).
 */
export function sha256HexUtf8(text: string): string {
  const src = String(text ?? '');
  try {
    // Node / tsx tests
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto');
    if (nodeCrypto?.createHash) {
      return nodeCrypto.createHash('sha256').update(src, 'utf8').digest('hex');
    }
  } catch {
    /* browser */
  }
  return pureSha256Hex(src);
}

/** GitHub #diff- file key = sha256(filepath) */
export function githubDiffFileKey(filePath: unknown): string {
  return sha256HexUtf8(normalizeGithubFilePath(filePath));
}

/**
 * Build fragment: #diff-{key}R26 or #diff-{key}R26-R32 (RIGHT).
 * LEFT uses L instead of R.
 */
export function buildGithubDiffHash(opts: {
  filePath?: string | null;
  fileKey?: string | null;
  startLine?: number | null;
  endLine?: number | null;
  side?: 'LEFT' | 'RIGHT' | null;
} = {}): string {
  const key =
    (opts.fileKey && /^[a-f0-9]{64}$/i.test(opts.fileKey)
      ? opts.fileKey.toLowerCase()
      : null) ||
    (opts.filePath ? githubDiffFileKey(opts.filePath) : '');
  if (!key) return '';
  const side = String(opts.side || 'RIGHT').toUpperCase() === 'LEFT' ? 'L' : 'R';
  const start = Number(opts.startLine);
  if (!Number.isFinite(start) || start < 1) {
    // File-level anchor without lines
    return `#diff-${key}`;
  }
  const end = Number(opts.endLine);
  if (Number.isFinite(end) && end > start) {
    return `#diff-${key}${side}${Math.floor(start)}-${side}${Math.floor(end)}`;
  }
  return `#diff-${key}${side}${Math.floor(start)}`;
}

/**
 * Parse #diff-{64hex}R12 or #diff-{64hex}R12-R20 (and L variants).
 */
export function parseGithubDiffHash(hash: unknown): {
  fileKey: string;
  startLine: number | null;
  endLine: number | null;
  side: 'LEFT' | 'RIGHT';
} | null {
  let h = String(hash || '').trim();
  if (h.startsWith('#')) h = h.slice(1);
  if (!h) return null;
  // Only the first segment before & or ;
  h = h.split('&')[0].split(';')[0];
  const m = h.match(
    /^diff-([a-f0-9]{64})(?:([RL])(\d+)(?:-\2(\d+)|-([RL])(\d+))?)?$/i
  );
  if (!m) return null;
  const fileKey = m[1].toLowerCase();
  if (!m[2]) {
    return { fileKey, startLine: null, endLine: null, side: 'RIGHT' };
  }
  const sideLetter = m[2].toUpperCase();
  const side: 'LEFT' | 'RIGHT' = sideLetter === 'L' ? 'LEFT' : 'RIGHT';
  const startLine = Math.floor(Number(m[3]));
  if (!Number.isFinite(startLine) || startLine < 1) {
    return { fileKey, startLine: null, endLine: null, side };
  }
  // Forms: R1-R2 (same letter) or R1-L2 (rare) — prefer same-side end
  const endRaw = m[4] != null ? m[4] : m[6] != null ? m[6] : null;
  const endLine =
    endRaw != null && Number.isFinite(Number(endRaw))
      ? Math.floor(Number(endRaw))
      : startLine;
  return {
    fileKey,
    startLine,
    endLine: endLine >= startLine ? endLine : startLine,
    side,
  };
}

const SHA_RE = /^[0-9a-f]{7,40}$/i;
const RANGE_RE = /^([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})$/i;

/**
 * Parse github.com PR path:
 *   /o/r/pull/N
 *   /o/r/pull/N/files | /changes
 *   /o/r/pull/N/changes/{sha}
 *   /o/r/pull/N/changes/{a}..{b}
 */
export function parseGithubPrPath(pathname: unknown): GithubPrRoute | null {
  const path = String(pathname || '')
    .split('?')[0]
    .split('#')[0];
  const m = path.match(
    /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/(files|changes)(?:\/([^/]+))?)?\/?$/i
  );
  if (!m) return null;
  const owner = m[1];
  const repo = m[2];
  const number = Number(m[3]);
  if (!owner || !repo || !Number.isFinite(number) || number <= 0) return null;
  const tab = String(m[4] || '')
    .trim()
    .toLowerCase();
  const rest = String(m[5] || '').trim();

  // commits/checks/etc. not handled here
  if (tab && tab !== 'files' && tab !== 'changes') return null;

  const page: 'conversation' | 'diff' =
    tab === 'files' || tab === 'changes' ? 'diff' : 'conversation';

  let commitSha: string | null = null;
  let commitEndSha: string | null = null;
  if (rest) {
    const range = rest.match(RANGE_RE);
    if (range) {
      commitSha = range[1].toLowerCase();
      commitEndSha = range[2].toLowerCase();
    } else if (SHA_RE.test(rest)) {
      commitSha = rest.toLowerCase();
    } else {
      // unknown suffix under changes — still treat as diff surface
    }
  }

  return {
    owner,
    repo,
    number: Math.floor(number),
    page,
    commitSha,
    commitEndSha,
    tab: tab || 'conversation',
  };
}

/**
 * Build pathname only (no search/hash).
 * Diff surface always writes **/changes** (not /files).
 */
export function buildGithubPrPath(route: {
  owner: string;
  repo: string;
  number: number;
  page?: 'conversation' | 'diff' | null;
  commitSha?: string | null;
  commitEndSha?: string | null;
}): string {
  const owner = encodeURIComponent(String(route.owner || '').trim());
  const repo = encodeURIComponent(String(route.repo || '').trim());
  const n = Math.floor(Number(route.number));
  if (!owner || !repo || !Number.isFinite(n) || n <= 0) return '';
  const base = `/${owner}/${repo}/pull/${n}`;
  if (route.page !== 'diff') return base;

  const a = String(route.commitSha || '').trim();
  const b = String(route.commitEndSha || '').trim();
  if (a && b && a.toLowerCase() !== b.toLowerCase()) {
    return `${base}/changes/${a}..${b}`;
  }
  if (a) return `${base}/changes/${a}`;
  return `${base}/changes`;
}

/** Pathname + hash for history.replaceState. */
export function buildGithubPrLocation(route: GithubPrRoute): {
  pathname: string;
  hash: string;
} {
  const pathname = buildGithubPrPath(route);
  let hash = '';
  if (route.page === 'diff' && (route.filePath || route.fileKey)) {
    hash = buildGithubDiffHash({
      filePath: route.filePath,
      fileKey: route.fileKey,
      startLine: route.startLine,
      endLine: route.endLine,
      side: route.side,
    });
  }
  return { pathname, hash };
}

/**
 * Full relative URL (pathname + optional preserved search without prp_* + hash).
 */
export function buildGithubPrHref(
  route: GithubPrRoute,
  existingSearch = ''
): string {
  const { pathname, hash } = buildGithubPrLocation(route);
  if (!pathname) return '';
  // Strip prp_* from search so GH path is primary
  let search = String(existingSearch || '');
  if (search && search !== '?') {
    try {
      const params = new URLSearchParams(
        search.startsWith('?') ? search.slice(1) : search
      );
      for (const k of [...params.keys()]) {
        if (/^prp_/i.test(k) || /^pr[+ ]/i.test(k) || k.startsWith('pr ')) {
          params.delete(k);
        }
      }
      const qs = params.toString();
      search = qs ? `?${qs}` : '';
    } catch {
      search = '';
    }
  } else {
    search = '';
  }
  return `${pathname}${search}${hash || ''}`;
}

export function replaceGithubPrLocation(
  historyApi: { replaceState?: Function; state?: unknown } | null | undefined,
  locationApi: {
    pathname?: string;
    search?: string;
    hash?: string;
    href?: string;
  } | null | undefined,
  route: GithubPrRoute
): boolean {
  if (!historyApi || typeof historyApi.replaceState !== 'function') return false;
  if (!locationApi) return false;
  try {
    const next = buildGithubPrHref(route, locationApi.search || '');
    if (!next) return false;
    const cur = `${locationApi.pathname || '/'}${locationApi.search || ''}${locationApi.hash || ''}`;
    if (cur === next) return true;
    historyApi.replaceState.call(historyApi, historyApi.state ?? null, '', next);
    return true;
  } catch {
    return false;
  }
}

/** Parse location into GithubPrRoute (path + #diff-). */
export function parseGithubPrLocation(location: {
  pathname?: string;
  hash?: string;
} | null): GithubPrRoute | null {
  if (!location) return null;
  const base = parseGithubPrPath(location.pathname || '');
  if (!base) return null;
  const frag = parseGithubDiffHash(location.hash || '');
  if (!frag) return base;
  return {
    ...base,
    fileKey: frag.fileKey,
    startLine: frag.startLine,
    endLine: frag.endLine,
    side: frag.side,
  };
}

export function commitFilterFromGithubRoute(
  route: { commitSha?: string | null; commitEndSha?: string | null } | null
): DiffCommitFilter {
  if (!route?.commitSha) return { mode: 'all' };
  if (route.commitEndSha && route.commitEndSha !== route.commitSha) {
    return {
      mode: 'range',
      sha: String(route.commitSha),
      endSha: String(route.commitEndSha),
    };
  }
  return { mode: 'single', sha: String(route.commitSha) };
}

export function githubCommitsFromFilter(
  filter: DiffCommitFilter | null | undefined
): { commitSha: string | null; commitEndSha: string | null } {
  const f = normalizeDiffCommitFilter(filter);
  if (isAllCommitsFilter(f)) return { commitSha: null, commitEndSha: null };
  if (f.mode === 'range' && f.sha && f.endSha) {
    return { commitSha: String(f.sha), commitEndSha: String(f.endSha) };
  }
  if (f.mode === 'single' && f.sha) {
    return { commitSha: String(f.sha), commitEndSha: null };
  }
  return { commitSha: null, commitEndSha: null };
}

/**
 * Line selection → GH route fields (for hash).
 * Uses normalize-shaped or raw selection with anchor/head.
 */
export function githubSelectionFields(selection: any): {
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  side: 'LEFT' | 'RIGHT' | null;
} {
  if (!selection) {
    return { filePath: null, startLine: null, endLine: null, side: null };
  }
  if (selection.kind === 'file' || selection.subjectType === 'file') {
    return {
      filePath: selection.filePath || selection.path || null,
      startLine: null,
      endLine: null,
      side: 'RIGHT',
    };
  }
  const filePath = selection.filePath || selection.path || null;
  let startLine = selection.startLine ?? selection.anchorLine ?? null;
  let endLine = selection.endLine ?? selection.headLine ?? null;
  let side =
    (selection.endSide ||
      selection.startSide ||
      selection.headSide ||
      selection.anchorSide ||
      'RIGHT') as 'LEFT' | 'RIGHT';
  // Order lines
  if (
    startLine != null &&
    endLine != null &&
    Number(startLine) > Number(endLine)
  ) {
    const t = startLine;
    startLine = endLine;
    endLine = t;
  }
  return {
    filePath: filePath ? String(filePath) : null,
    startLine:
      startLine != null && Number.isFinite(Number(startLine))
        ? Math.floor(Number(startLine))
        : null,
    endLine:
      endLine != null && Number.isFinite(Number(endLine))
        ? Math.floor(Number(endLine))
        : null,
    side: side === 'LEFT' ? 'LEFT' : 'RIGHT',
  };
}

/** Find file path whose githubDiffFileKey matches key. */
export function findFilePathByDiffKey(
  files: Array<{ filename?: string; path?: string; filePath?: string } | string> | null | undefined,
  fileKey: string | null | undefined
): string | null {
  const key = String(fileKey || '').toLowerCase();
  if (!key || !/^[a-f0-9]{64}$/.test(key)) return null;
  const list = Array.isArray(files) ? files : [];
  for (const f of list) {
    const p =
      typeof f === 'string'
        ? f
        : f?.filename || f?.path || f?.filePath || '';
    if (!p) continue;
    if (githubDiffFileKey(p) === key) return normalizeGithubFilePath(p);
  }
  return null;
}

// ── Pure SHA-256 (sync, browser-safe) ──────────────────────────────────

function pureSha256Hex(ascii: string): string {
  // UTF-8 encode
  const bytes: number[] = [];
  for (let i = 0; i < ascii.length; i++) {
    let c = ascii.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < ascii.length) {
      const c2 = ascii.charCodeAt(++i);
      const u = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
      bytes.push(
        0xf0 | (u >> 18),
        0x80 | ((u >> 12) & 0x3f),
        0x80 | ((u >> 6) & 0x3f),
        0x80 | (u & 0x3f)
      );
    } else {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return sha256Bytes(bytes);
}

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256Bytes(bytes: number[]): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const bitLen = bytes.length * 8;
  const withPad = bytes.slice();
  withPad.push(0x80);
  while ((withPad.length % 64) !== 56) withPad.push(0);
  // 64-bit big-endian length
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  for (const part of [hi, lo]) {
    withPad.push((part >>> 24) & 0xff);
    withPad.push((part >>> 16) & 0xff);
    withPad.push((part >>> 8) & 0xff);
    withPad.push(part & 0xff);
  }

  const w = new Array(64);
  for (let i = 0; i < withPad.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      const j = i + t * 4;
      w[t] =
        ((withPad[j] << 24) |
          (withPad[j + 1] << 16) |
          (withPad[j + 2] << 8) |
          withPad[j + 3]) >>>
        0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 =
        (rotr(7, w[t - 15]) ^ rotr(18, w[t - 15]) ^ (w[t - 15] >>> 3)) >>> 0;
      const s1 =
        (rotr(17, w[t - 2]) ^ rotr(19, w[t - 2]) ^ (w[t - 2] >>> 10)) >>> 0;
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = (rotr(6, e) ^ rotr(11, e) ^ rotr(25, e)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = (rotr(2, a) ^ rotr(13, a) ^ rotr(22, a)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((x) => x.toString(16).padStart(8, '0'))
    .join('');
}
