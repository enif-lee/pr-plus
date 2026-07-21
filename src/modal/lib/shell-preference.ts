/**
 * Outer shell preference for PR detail: centered modal vs side sheet.
 * Orthogonal to content layout (conversation/diff).
 * Pure — no chrome.* dependency; storage is injected.
 */

export const SHELL_MODAL = 'modal';
export const SHELL_SHEET = 'sheet';

/** localStorage / sessionStorage key — global preference, not per-PR. */
export const SHELL_PREF_KEY = 'prp:shell';

export type ShellMode = typeof SHELL_MODAL | typeof SHELL_SHEET;

/**
 * Normalize unknown input to a valid shell mode. Default: modal.
 */
export function normalizeShell(value: unknown): ShellMode {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (v === SHELL_SHEET || v === 'side' || v === 'side-sheet' || v === 'drawer') {
    return SHELL_SHEET;
  }
  return SHELL_MODAL;
}

export function isValidShell(value: unknown): boolean {
  return value === SHELL_MODAL || value === SHELL_SHEET;
}

export function toggleShell(shell: unknown): ShellMode {
  return normalizeShell(shell) === SHELL_SHEET ? SHELL_MODAL : SHELL_SHEET;
}

/**
 * CSS class fragment for the overlay (and optionally the panel).
 * Content layout classes stay in layout-mode.ts.
 */
export function shellClassName(shell: unknown): string {
  return normalizeShell(shell) === SHELL_SHEET ? 'prp-shell--sheet' : 'prp-shell--modal';
}

/**
 * Combine content layout classes with shell classes.
 * @param {string} layoutCls from layoutClassName(mode)
 */
export function withShellClass(layoutCls: string, shell: unknown): string {
  return `${String(layoutCls || '').trim()} ${shellClassName(shell)}`.trim();
}

export function serializeShellPref(shell: unknown): string {
  return normalizeShell(shell);
}

export function parseShellPref(raw: unknown): ShellMode {
  if (raw == null || raw === '') return SHELL_MODAL;
  if (typeof raw === 'string') {
    const t = raw.trim();
    // Allow JSON {"shell":"sheet"} or plain token
    if (t.startsWith('{')) {
      try {
        const obj = JSON.parse(t);
        return normalizeShell(obj?.shell ?? obj?.mode ?? obj);
      } catch {
        return SHELL_MODAL;
      }
    }
    return normalizeShell(t);
  }
  if (typeof raw === 'object' && raw) {
    return normalizeShell((raw as any).shell ?? (raw as any).mode ?? raw);
  }
  return SHELL_MODAL;
}

/**
 * @param {Storage} storage
 * @returns {ShellMode}
 */
export function loadShellPref(storage: { getItem?: (k: string) => string | null } | null | undefined): ShellMode {
  if (!storage || typeof storage.getItem !== 'function') return SHELL_MODAL;
  try {
    return parseShellPref(storage.getItem(SHELL_PREF_KEY));
  } catch {
    return SHELL_MODAL;
  }
}

/**
 * @param {Storage} storage
 * @returns {boolean}
 */
export function saveShellPref(
  storage: { setItem?: (k: string, v: string) => void } | null | undefined,
  shell: unknown
): boolean {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(SHELL_PREF_KEY, serializeShellPref(shell));
    return true;
  } catch {
    return false;
  }
}

/**
 * Prefer localStorage (survives browser restart); fall back to sessionStorage.
 */
export function resolveShellStorage(
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
