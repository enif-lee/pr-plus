/**
 * Pure helpers for PR shell panel size: side-sheet width, centered modal
 * width/height, clamp min/max (viewport-aware), drag deltas, load/save, fullscreen.
 * Storage is injected (local/session) — no chrome.* dependency.
 */

/** Side sheet width bounds (px). Effective min/max also respect viewport. */
export const SHEET_MIN_WIDTH = 480;
export const SHEET_MAX_WIDTH = 1200;
export const SHEET_DEFAULT_WIDTH = 900;

/** Centered modal size bounds (px). */
export const MODAL_MIN_WIDTH = 640;
export const MODAL_MAX_WIDTH = 1600;
export const MODAL_DEFAULT_WIDTH = 1100;
export const MODAL_MIN_HEIGHT = 420;
export const MODAL_MAX_HEIGHT = 1200;
export const MODAL_DEFAULT_HEIGHT = 800;

export const SHELL_SHEET_WIDTH_KEY = 'prp:shell-sheet-width';
export const SHELL_MODAL_SIZE_KEY = 'prp:shell-modal-size';

export type ModalShellSize = {
  width: number;
  height: number;
};

export type ShellSizePref = {
  sheetWidth: number;
  modal: ModalShellSize;
};

export type ClampSizeOpts = {
  min?: number;
  max?: number;
  fallback?: number;
  /** Viewport dimension (width or height) — clamps hard max to viewport. */
  viewport?: number;
};

/**
 * Clamp a size to [min, max], both also limited by viewport when provided.
 * Non-finite / empty → fallback (also clamped).
 */
export function clampShellSize(value: unknown, opts: ClampSizeOpts = {}): number {
  const minBase = Number.isFinite(opts.min as number) ? (opts.min as number) : 0;
  const maxBase = Number.isFinite(opts.max as number) ? (opts.max as number) : minBase + 1;
  const fallbackBase = Number.isFinite(opts.fallback as number)
    ? (opts.fallback as number)
    : minBase;
  const vw =
    Number.isFinite(opts.viewport as number) && (opts.viewport as number) > 0
      ? (opts.viewport as number)
      : Infinity;

  // Viewport-aware: never require more than the viewport, never exceed it.
  let min = Math.min(minBase, vw);
  let max = Math.min(maxBase, vw);
  if (min > max) {
    // Degenerate (e.g. min > viewport): pin both to viewport.
    min = max;
  }

  const clampFinite = (n: number) => {
    if (n < min) return min;
    if (n > max) return max;
    return Math.round(n);
  };

  if (value == null || value === '') {
    return clampFinite(fallbackBase);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return clampFinite(fallbackBase);
  return clampFinite(n);
}

export function clampSheetWidth(
  width: unknown,
  opts: { viewportWidth?: number; min?: number; max?: number; fallback?: number } = {}
): number {
  return clampShellSize(width, {
    min: opts.min ?? SHEET_MIN_WIDTH,
    max: opts.max ?? SHEET_MAX_WIDTH,
    fallback: opts.fallback ?? SHEET_DEFAULT_WIDTH,
    viewport: opts.viewportWidth,
  });
}

export function clampModalWidth(
  width: unknown,
  opts: { viewportWidth?: number; min?: number; max?: number; fallback?: number } = {}
): number {
  return clampShellSize(width, {
    min: opts.min ?? MODAL_MIN_WIDTH,
    max: opts.max ?? MODAL_MAX_WIDTH,
    fallback: opts.fallback ?? MODAL_DEFAULT_WIDTH,
    viewport: opts.viewportWidth,
  });
}

export function clampModalHeight(
  height: unknown,
  opts: { viewportHeight?: number; min?: number; max?: number; fallback?: number } = {}
): number {
  return clampShellSize(height, {
    min: opts.min ?? MODAL_MIN_HEIGHT,
    max: opts.max ?? MODAL_MAX_HEIGHT,
    fallback: opts.fallback ?? MODAL_DEFAULT_HEIGHT,
    viewport: opts.viewportHeight,
  });
}

export function clampModalSize(
  size: Partial<ModalShellSize> | null | undefined,
  opts: { viewportWidth?: number; viewportHeight?: number } = {}
): ModalShellSize {
  return {
    width: clampModalWidth(size?.width, { viewportWidth: opts.viewportWidth }),
    height: clampModalHeight(size?.height, { viewportHeight: opts.viewportHeight }),
  };
}

/**
 * Side sheet is docked on the right; resizer is on the panel's left edge.
 * Moving the pointer left (clientX decreases) widens the sheet.
 */
export function nextSheetWidthFromDrag(
  startWidth: unknown,
  startX: unknown,
  clientX: unknown,
  opts: { viewportWidth?: number; min?: number; max?: number } = {}
): number {
  const base = clampSheetWidth(startWidth, opts);
  const sx = Number(startX);
  const cx = Number(clientX);
  if (!Number.isFinite(sx) || !Number.isFinite(cx)) return base;
  return clampSheetWidth(base + (sx - cx), opts);
}

/**
 * Centered modal: positive deltaX/deltaY grow width/height (SE-corner style).
 *
 * Deltas are doubled so the dragged edge tracks the pointer 1:1. Because the
 * panel stays centered, a 1px size change only moves each edge by 0.5px; 2×
 * compensates for that split.
 */
export function nextModalSizeFromDrag(
  start: Partial<ModalShellSize> | null | undefined,
  deltaX: unknown,
  deltaY: unknown,
  opts: { viewportWidth?: number; viewportHeight?: number } = {}
): ModalShellSize {
  const base = clampModalSize(start, opts);
  const dx = Number(deltaX);
  const dy = Number(deltaY);
  const nextW = Number.isFinite(dx) ? base.width + dx * 2 : base.width;
  const nextH = Number.isFinite(dy) ? base.height + dy * 2 : base.height;
  return clampModalSize({ width: nextW, height: nextH }, opts);
}

export function toggleShellFullscreen(fullscreen: unknown): boolean {
  return !Boolean(fullscreen);
}

/** CSS class fragment for fullscreen shell (overlay + panel). */
export function shellFullscreenClassName(fullscreen: unknown): string {
  return Boolean(fullscreen) ? 'prp-shell--fullscreen' : '';
}

export function defaultShellSizePref(
  opts: { viewportWidth?: number; viewportHeight?: number } = {}
): ShellSizePref {
  return {
    sheetWidth: clampSheetWidth(SHEET_DEFAULT_WIDTH, { viewportWidth: opts.viewportWidth }),
    modal: clampModalSize(
      { width: MODAL_DEFAULT_WIDTH, height: MODAL_DEFAULT_HEIGHT },
      opts
    ),
  };
}

export function serializeSheetWidth(width: unknown): string {
  return String(clampSheetWidth(width));
}

export function parseSheetWidth(raw: unknown): number {
  if (raw == null || raw === '') return SHEET_DEFAULT_WIDTH;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t.startsWith('{')) {
      try {
        const obj = JSON.parse(t);
        return clampSheetWidth(obj?.sheetWidth ?? obj?.width ?? obj);
      } catch {
        return SHEET_DEFAULT_WIDTH;
      }
    }
    return clampSheetWidth(t);
  }
  if (typeof raw === 'object' && raw) {
    return clampSheetWidth((raw as any).sheetWidth ?? (raw as any).width ?? raw);
  }
  return clampSheetWidth(raw);
}

export function serializeModalSize(size: Partial<ModalShellSize> | null | undefined): string {
  const s = clampModalSize(size);
  return JSON.stringify({ v: 1, width: s.width, height: s.height });
}

export function parseModalSize(raw: unknown): ModalShellSize {
  const fallback = clampModalSize({
    width: MODAL_DEFAULT_WIDTH,
    height: MODAL_DEFAULT_HEIGHT,
  });
  if (raw == null || raw === '') return { ...fallback };
  let obj: any = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { ...fallback };
    }
  }
  if (!obj || typeof obj !== 'object') return { ...fallback };
  return clampModalSize({ width: obj.width, height: obj.height });
}

export function loadSheetWidth(
  storage: { getItem?: (k: string) => string | null } | null | undefined,
  opts: { viewportWidth?: number } = {}
): number {
  if (!storage || typeof storage.getItem !== 'function') {
    return clampSheetWidth(SHEET_DEFAULT_WIDTH, opts);
  }
  try {
    return clampSheetWidth(parseSheetWidth(storage.getItem(SHELL_SHEET_WIDTH_KEY)), opts);
  } catch {
    return clampSheetWidth(SHEET_DEFAULT_WIDTH, opts);
  }
}

export function saveSheetWidth(
  storage: { setItem?: (k: string, v: string) => void } | null | undefined,
  width: unknown
): boolean {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(SHELL_SHEET_WIDTH_KEY, serializeSheetWidth(width));
    return true;
  } catch {
    return false;
  }
}

export function loadModalSize(
  storage: { getItem?: (k: string) => string | null } | null | undefined,
  opts: { viewportWidth?: number; viewportHeight?: number } = {}
): ModalShellSize {
  if (!storage || typeof storage.getItem !== 'function') {
    return clampModalSize(
      { width: MODAL_DEFAULT_WIDTH, height: MODAL_DEFAULT_HEIGHT },
      opts
    );
  }
  try {
    return clampModalSize(parseModalSize(storage.getItem(SHELL_MODAL_SIZE_KEY)), opts);
  } catch {
    return clampModalSize(
      { width: MODAL_DEFAULT_WIDTH, height: MODAL_DEFAULT_HEIGHT },
      opts
    );
  }
}

export function saveModalSize(
  storage: { setItem?: (k: string, v: string) => void } | null | undefined,
  size: Partial<ModalShellSize> | null | undefined
): boolean {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(SHELL_MODAL_SIZE_KEY, serializeModalSize(size));
    return true;
  } catch {
    return false;
  }
}

export function loadShellSizePref(
  storage: { getItem?: (k: string) => string | null } | null | undefined,
  opts: { viewportWidth?: number; viewportHeight?: number } = {}
): ShellSizePref {
  return {
    sheetWidth: loadSheetWidth(storage, { viewportWidth: opts.viewportWidth }),
    modal: loadModalSize(storage, opts),
  };
}

export function saveShellSizePref(
  storage: { setItem?: (k: string, v: string) => void } | null | undefined,
  pref: Partial<ShellSizePref> | null | undefined
): boolean {
  if (!storage || typeof storage.setItem !== 'function') return false;
  let ok = true;
  if (pref && 'sheetWidth' in pref) {
    ok = saveSheetWidth(storage, pref.sheetWidth) && ok;
  }
  if (pref && pref.modal) {
    ok = saveModalSize(storage, pref.modal) && ok;
  }
  return ok;
}

/** Prefer localStorage; fall back to sessionStorage (same pattern as shell pref). */
export function resolveShellSizeStorage(
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
