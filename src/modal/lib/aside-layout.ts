/**
 * Conversation right-rail (PR metadata) collapse preference.
 * Pure helpers — storage injected (local/session), same pattern as file-nav / shell size.
 */

export const ASIDE_PREF_KEY = 'prp:aside-rail';
export const ASIDE_EXPANDED_WIDTH = 280;
/** Compact rail width (~80px for labels + small avatars / check stack) */
export const ASIDE_COLLAPSED_WIDTH = 80;
/**
 * Vertical splitter track between main and aside (hosts collapse control).
 * Hairline sits on the left edge so main content is flush; the track width
 * is for the circular control, not empty gap on both sides.
 */
export const ASIDE_SPLITTER_WIDTH = 28;

export type AsideRailPref = {
  collapsed: boolean;
};

export function toggleAsideCollapsed(collapsed: unknown): boolean {
  return !Boolean(collapsed);
}

export function serializeAsidePref(pref: Partial<AsideRailPref> | null | undefined): string {
  return JSON.stringify({ v: 1, collapsed: Boolean(pref?.collapsed) });
}

export function parseAsidePref(raw: unknown): AsideRailPref {
  const fallback: AsideRailPref = { collapsed: false };
  if (raw == null || raw === '') return { ...fallback };
  let obj: any = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      if (raw === '1' || raw === 'true' || raw === 'collapsed') {
        return { collapsed: true };
      }
      return { ...fallback };
    }
  }
  if (typeof obj === 'boolean') return { collapsed: obj };
  if (!obj || typeof obj !== 'object') return { ...fallback };
  return { collapsed: Boolean(obj.collapsed) };
}

export function loadAsidePref(
  storage: { getItem?: (k: string) => string | null } | null | undefined
): AsideRailPref {
  if (!storage || typeof storage.getItem !== 'function') {
    return { collapsed: false };
  }
  try {
    return parseAsidePref(storage.getItem(ASIDE_PREF_KEY));
  } catch {
    return { collapsed: false };
  }
}

export function saveAsidePref(
  storage: { setItem?: (k: string, v: string) => void } | null | undefined,
  pref: Partial<AsideRailPref> | null | undefined
): boolean {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(ASIDE_PREF_KEY, serializeAsidePref(pref));
    return true;
  } catch {
    return false;
  }
}

export function resolveAsideStorage(
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

/**
 * CSS grid-template-columns for conversation: main | splitter | aside
 * Splitter column hosts the vertical line + circular collapse control.
 */
export function conversationGridTemplate(collapsed: unknown): string {
  const w = Boolean(collapsed) ? ASIDE_COLLAPSED_WIDTH : ASIDE_EXPANDED_WIDTH;
  return `minmax(0, 1fr) ${ASIDE_SPLITTER_WIDTH}px ${w}px`;
}

/** Aside column width in px (for --prp-aside-w CSS var; media queries can still collapse layout). */
export function conversationAsideWidthPx(collapsed: unknown): number {
  return Boolean(collapsed) ? ASIDE_COLLAPSED_WIDTH : ASIDE_EXPANDED_WIDTH;
}
