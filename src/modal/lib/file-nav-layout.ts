/**
 * Pure helpers for Diff files navigator: collapse + resizable width.
 * Orthogonal to content layout; storage injected (local/session).
 */

export const FILE_NAV_MIN_WIDTH = 160;
export const FILE_NAV_MAX_WIDTH = 520;
export const FILE_NAV_DEFAULT_WIDTH = 260;
/**
 * Legacy rail width (no longer used for collapsed layout — expand is toolbar-only).
 * Kept for any callers that still reference the constant.
 */
export const FILE_NAV_RAIL_WIDTH = 0;
export const FILE_NAV_PREF_KEY = 'prp:file-nav';

export type FileNavPref = {
  collapsed: boolean;
  width: number;
};

/**
 * Clamp navigator width to [min, max]. Non-finite → default.
 */
export function clampFileNavWidth(
  width: unknown,
  opts: { min?: number; max?: number; fallback?: number } = {}
): number {
  const min = Number.isFinite(opts.min as number) ? (opts.min as number) : FILE_NAV_MIN_WIDTH;
  const max = Number.isFinite(opts.max as number) ? (opts.max as number) : FILE_NAV_MAX_WIDTH;
  const fallback =
    Number.isFinite(opts.fallback as number) ? (opts.fallback as number) : FILE_NAV_DEFAULT_WIDTH;
  if (width == null || width === '') {
    return Math.min(max, Math.max(min, fallback));
  }
  const n = Number(width);
  if (!Number.isFinite(n)) return Math.min(max, Math.max(min, fallback));
  if (n < min) return min;
  if (n > max) return max;
  return Math.round(n);
}

export function toggleFileNavCollapsed(collapsed: unknown): boolean {
  return !Boolean(collapsed);
}

/**
 * Next width from a horizontal drag starting at `startWidth` with pointer delta.
 * Positive deltaX widens the left navigator.
 */
export function nextFileNavWidthFromDrag(
  startWidth: unknown,
  deltaX: unknown,
  opts: { min?: number; max?: number } = {}
): number {
  const base = clampFileNavWidth(startWidth, opts);
  const d = Number(deltaX);
  if (!Number.isFinite(d)) return base;
  return clampFileNavWidth(base + d, opts);
}

/**
 * CSS grid-template-columns for Diff layout (legacy helper; layout is flex now).
 * Always returns 3 tracks so open/close can animate first-column width
 * without auto-placement gaps: expanded `Wpx Rpx 1fr`, collapsed `0 0 1fr`.
 * Children must stay mounted with stable order (nav | resizer | pane).
 */
export function fileNavGridTemplate(
  pref: Partial<FileNavPref> | null | undefined,
  opts: { resizerPx?: number; min?: number; max?: number } = {}
): string {
  const resizer = Number.isFinite(opts.resizerPx as number) ? (opts.resizerPx as number) : 4;
  const collapsed = Boolean(pref?.collapsed);
  if (collapsed) {
    return `0px 0px minmax(0, 1fr)`;
  }
  const w = clampFileNavWidth(pref?.width, {
    min: opts.min,
    max: opts.max,
  });
  return `${w}px ${resizer}px minmax(0, 1fr)`;
}

/** Default open state for the files navigator (expanded). */
export const FILE_NAV_DEFAULT_COLLAPSED = false;

export function serializeFileNavPref(pref: Partial<FileNavPref> | null | undefined): string {
  const width = clampFileNavWidth(pref?.width);
  const collapsed = Boolean(pref?.collapsed);
  return JSON.stringify({ v: 1, width, collapsed });
}

export function parseFileNavPref(raw: unknown): FileNavPref {
  const fallback: FileNavPref = {
    collapsed: FILE_NAV_DEFAULT_COLLAPSED,
    width: FILE_NAV_DEFAULT_WIDTH,
  };
  if (raw == null || raw === '') return { ...fallback };
  let obj: any = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      // bare number width
      const n = Number(raw);
      if (Number.isFinite(n)) return { collapsed: false, width: clampFileNavWidth(n) };
      return { ...fallback };
    }
  }
  // JSON.parse("280") → number
  if (typeof obj === 'number') {
    return { collapsed: false, width: clampFileNavWidth(obj) };
  }
  if (!obj || typeof obj !== 'object') return { ...fallback };
  return {
    collapsed: Boolean(obj.collapsed),
    width: clampFileNavWidth(obj.width),
  };
}

export function loadFileNavPref(
  storage: { getItem?: (k: string) => string | null } | null | undefined
): FileNavPref {
  if (!storage || typeof storage.getItem !== 'function') {
    return { collapsed: FILE_NAV_DEFAULT_COLLAPSED, width: FILE_NAV_DEFAULT_WIDTH };
  }
  try {
    const pref = parseFileNavPref(storage.getItem(FILE_NAV_PREF_KEY));
    // Width is restored; open/closed always starts expanded so Diff opens with
    // the navigator visible (user can still collapse for the session / persist).
    return { ...pref, collapsed: FILE_NAV_DEFAULT_COLLAPSED };
  } catch {
    return { collapsed: FILE_NAV_DEFAULT_COLLAPSED, width: FILE_NAV_DEFAULT_WIDTH };
  }
}

export function saveFileNavPref(
  storage: { setItem?: (k: string, v: string) => void } | null | undefined,
  pref: Partial<FileNavPref> | null | undefined
): boolean {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(FILE_NAV_PREF_KEY, serializeFileNavPref(pref));
    return true;
  } catch {
    return false;
  }
}

export function resolveFileNavStorage(
  win: { localStorage?: Storage; sessionStorage?: Storage } | null | undefined
): Storage | null {
  if (!win) return null;
  try {
    if (win.localStorage && typeof win.localStorage.getItem === 'function') {
      return win.localStorage;
    }
  } catch {
    /* private mode */
  }
  try {
    if (win.sessionStorage && typeof win.sessionStorage.getItem === 'function') {
      return win.sessionStorage;
    }
  } catch {
    /* ignore */
  }
  return null;
}
