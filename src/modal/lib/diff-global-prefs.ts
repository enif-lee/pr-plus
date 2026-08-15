/**
 * Global Diff view preferences: hide whitespace + hide outdated comments.
 * Orthogonal to per-PR session-view; survives PR switches and reloads.
 * Pure — no chrome.* dependency; storage is injected.
 */

export const DIFF_GLOBAL_PREFS_KEY = 'prp:diff-global-prefs';

export type DiffGlobalPrefs = {
  hideWhitespace: boolean;
  hideOutdated: boolean;
};

export const DEFAULT_DIFF_GLOBAL_PREFS: DiffGlobalPrefs = {
  hideWhitespace: false,
  hideOutdated: false,
};

/**
 * Normalize unknown input to a full prefs object. Safe defaults on garbage.
 */
export function normalizeDiffGlobalPrefs(raw: unknown): DiffGlobalPrefs {
  if (raw == null || raw === '' || typeof raw !== 'object') {
    return { ...DEFAULT_DIFF_GLOBAL_PREFS };
  }
  const o = raw as Record<string, unknown>;
  return {
    hideWhitespace: Boolean(o.hideWhitespace),
    hideOutdated: Boolean(o.hideOutdated),
  };
}

export function serializeDiffGlobalPrefs(prefs: unknown): string {
  return JSON.stringify(normalizeDiffGlobalPrefs(prefs));
}

/**
 * Parse storage raw (JSON object or legacy plain values). Never throws.
 */
export function parseDiffGlobalPrefs(raw: unknown): DiffGlobalPrefs {
  if (raw == null || raw === '') return { ...DEFAULT_DIFF_GLOBAL_PREFS };
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return { ...DEFAULT_DIFF_GLOBAL_PREFS };
    if (t.startsWith('{')) {
      try {
        return normalizeDiffGlobalPrefs(JSON.parse(t));
      } catch {
        return { ...DEFAULT_DIFF_GLOBAL_PREFS };
      }
    }
    // Unknown non-JSON token → defaults
    return { ...DEFAULT_DIFF_GLOBAL_PREFS };
  }
  if (typeof raw === 'object') {
    return normalizeDiffGlobalPrefs(raw);
  }
  return { ...DEFAULT_DIFF_GLOBAL_PREFS };
}

/**
 * @param storage Storage-like with getItem
 */
export function loadDiffGlobalPrefs(
  storage: { getItem?: (k: string) => string | null } | null | undefined
): DiffGlobalPrefs {
  if (!storage || typeof storage.getItem !== 'function') {
    return { ...DEFAULT_DIFF_GLOBAL_PREFS };
  }
  try {
    return parseDiffGlobalPrefs(storage.getItem(DIFF_GLOBAL_PREFS_KEY));
  } catch {
    return { ...DEFAULT_DIFF_GLOBAL_PREFS };
  }
}

/**
 * Merge partial into stored prefs and write. Returns false if storage missing/throws.
 */
export function saveDiffGlobalPrefs(
  storage:
    | {
        getItem?: (k: string) => string | null;
        setItem?: (k: string, v: string) => void;
      }
    | null
    | undefined,
  partial: Partial<DiffGlobalPrefs> | null | undefined
): boolean {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    const prev = loadDiffGlobalPrefs(storage);
    const next = normalizeDiffGlobalPrefs({
      ...prev,
      ...(partial && typeof partial === 'object' ? partial : {}),
    });
    storage.setItem(DIFF_GLOBAL_PREFS_KEY, serializeDiffGlobalPrefs(next));
    return true;
  } catch {
    return false;
  }
}

/**
 * Prefer localStorage (survives browser restart); fall back to sessionStorage.
 */
export function resolveDiffGlobalPrefsStorage(
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
