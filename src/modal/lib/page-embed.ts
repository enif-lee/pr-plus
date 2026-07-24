/**
 * Pure helpers for in-page PR embed (replace GitHub main content under header).
 * Orthogonal to overlay modal/sheet shells. No React dependency.
 */

export const PRESENTATION_MODAL = 'modal';
export const PRESENTATION_EMBED = 'embed';

export type PresentationMode =
  | typeof PRESENTATION_MODAL
  | typeof PRESENTATION_EMBED;

export type PrPageTarget = {
  owner: string;
  repo: string;
  number: number;
  /** Content layout: conversation vs files/diff */
  page: 'conversation' | 'diff';
  /** Path tab segment (empty | files | …) */
  tab: string;
};

/** Host root id for in-page embed (distinct from overlay #prp-modal-host). */
export const PAGE_EMBED_HOST_ID = 'prp-page-embed';

/** html/body class while embed is active */
export const PAGE_EMBED_ACTIVE_CLASS = 'prp-embed-active';

/** Default GH global header height used for embed layout (px). */
export const PAGE_EMBED_HEADER_OFFSET_PX = 64;

/**
 * Embed host CSS height policy: full viewport so
 * document content height = headerOffset + 100vh > 100vh → global scroll room
 * equals headerOffset (header can collapse before panel takes wheel).
 */
export const PAGE_EMBED_HOST_HEIGHT_CSS = '100vh';

/** Mark applied to GitHub footer nodes while embed is active */
export const PAGE_EMBED_FOOTER_HIDDEN_ATTR = 'data-prp-footer-hidden';

/**
 * Resilient github.com footer selectors (hide under replace mode).
 * Prefer specific → generic; callers de-dupe by element identity.
 */
export const GH_FOOTER_SELECTORS: readonly string[] = [
  'footer.footer',
  'footer.Footer',
  '#footer',
  '[data-test-selector="site-footer"]',
  '[data-test-selector="footer"]',
  'div.footer',
  '.footer',
  'footer',
];

/**
 * Keyboard: restore native GH UI from embed.
 * ⌘⇧E / Ctrl+Shift+E — not used by common browser tab/window defaults.
 */
export const EMBED_RESTORE_SHORTCUT = {
  mod: true,
  shift: true,
  key: 'e',
  action: 'restoreNativeView' as const,
  label: '⌘⇧E',
  labelWin: 'Ctrl+Shift+E',
};

/**
 * Parse a GitHub PR conversation or files URL path.
 * Matches:
 *   /owner/repo/pull/123
 *   /owner/repo/pull/123/
 *   /owner/repo/pull/123/files
 * Does not match commits/checks/other sub-tabs (not embed targets).
 */
export function parsePrPagePath(pathname: unknown): PrPageTarget | null {
  const path = String(pathname || '').split('?')[0].split('#')[0];
  const m = path.match(
    /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/([^/]+))?\/?$/i
  );
  if (!m) return null;
  const owner = m[1];
  const repo = m[2];
  const number = Number(m[3]);
  if (!owner || !repo || !Number.isFinite(number) || number <= 0) return null;
  const tab = String(m[4] || '')
    .trim()
    .toLowerCase();
  // Conversation (no tab) or files/changes only
  if (tab && tab !== 'files' && tab !== 'changes') return null;
  const page: 'conversation' | 'diff' =
    tab === 'files' || tab === 'changes' ? 'diff' : 'conversation';
  return {
    owner,
    repo,
    number,
    page,
    tab: tab || 'conversation',
  };
}

/** True when pathname is a PR conversation or files page we embed into. */
export function isPrEmbedTarget(pathname: unknown): boolean {
  return parsePrPagePath(pathname) != null;
}

export function normalizePresentation(value: unknown): PresentationMode {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (v === PRESENTATION_EMBED || v === 'page' || v === 'in-page' || v === 'inline') {
    return PRESENTATION_EMBED;
  }
  return PRESENTATION_MODAL;
}

export function isEmbedPresentation(value: unknown): boolean {
  return normalizePresentation(value) === PRESENTATION_EMBED;
}

/**
 * Chrome flags for embed presentation — overlay-only controls stay off;
 * restore-native control is embed-only.
 */
export function embedShellChromeFlags(): {
  presentation: typeof PRESENTATION_EMBED;
  showClose: false;
  showShellToggle: false;
  showFullscreen: false;
  showExit: false;
  showRestoreNative: true;
} {
  return {
    presentation: PRESENTATION_EMBED,
    showClose: false,
    showShellToggle: false,
    showFullscreen: false,
    showExit: false,
    showRestoreNative: true,
  };
}

/** Overlay CSS fragment for presentation mode. */
export function presentationClassName(presentation: unknown): string {
  return isEmbedPresentation(presentation) ? 'prp-shell--embed' : '';
}

/**
 * Whether Header should render a chrome control for this presentation.
 * @param control close | shellToggle | fullscreen | exit | restoreNative
 */
export function shouldShowEmbedChrome(
  presentation: unknown,
  control:
    | 'close'
    | 'shellToggle'
    | 'fullscreen'
    | 'exit'
    | 'restoreNative'
): boolean {
  if (control === 'restoreNative') {
    return isEmbedPresentation(presentation);
  }
  if (!isEmbedPresentation(presentation)) return true;
  // Overlay-only chrome hidden in embed
  return false;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/**
 * Document scroll room when embed is active and footer is hidden.
 * Shipped layout: header (in flow) + embed host height 100vh →
 * content = headerOffset + viewport → scrollMax = headerOffset.
 *
 * @returns max global scrollTop (px). Must be > 0 so first wheel can hit global.
 */
export function embedGlobalScrollMax(opts: {
  viewportHeight: number;
  headerOffset?: number;
  /** Embed host height in px (default = viewport = 100vh) */
  embedHeight?: number;
  /** Footer contribution after hide (should be 0) */
  footerHeight?: number;
}): number {
  const vh = Math.max(0, Number(opts.viewportHeight) || 0);
  const header =
    opts.headerOffset != null && Number.isFinite(Number(opts.headerOffset))
      ? Math.max(0, Number(opts.headerOffset))
      : PAGE_EMBED_HEADER_OFFSET_PX;
  const embedH =
    opts.embedHeight != null && Number.isFinite(Number(opts.embedHeight))
      ? Math.max(0, Number(opts.embedHeight))
      : vh; // 100vh
  const footer =
    opts.footerHeight != null && Number.isFinite(Number(opts.footerHeight))
      ? Math.max(0, Number(opts.footerHeight))
      : 0;
  const content = header + embedH + footer;
  return Math.max(0, content - vh);
}

/**
 * Embed-only wheel routing: apply delta to **global/document scroll first**,
 * then remaining delta to the conversation panel scroller.
 *
 * @returns deltas to ADD to each scrollTop; preventDefault when any consumed.
 */
export function routeEmbedWheelScroll(opts: {
  deltaY: number;
  globalScrollTop: number;
  globalScrollMax: number;
  panelScrollTop: number;
  panelScrollMax: number;
}): {
  globalDelta: number;
  panelDelta: number;
  preventDefault: boolean;
} {
  const dy = Number(opts.deltaY);
  if (!Number.isFinite(dy) || dy === 0) {
    return { globalDelta: 0, panelDelta: 0, preventDefault: false };
  }
  const gMax = Math.max(0, Number(opts.globalScrollMax) || 0);
  const pMax = Math.max(0, Number(opts.panelScrollMax) || 0);
  const gTop = clamp(Number(opts.globalScrollTop) || 0, 0, gMax);
  const pTop = clamp(Number(opts.panelScrollTop) || 0, 0, pMax);

  // Global first
  const nextG = clamp(gTop + dy, 0, gMax);
  const globalDelta = nextG - gTop;
  const remaining = dy - globalDelta;
  const nextP = clamp(pTop + remaining, 0, pMax);
  const panelDelta = nextP - pTop;
  return {
    globalDelta,
    panelDelta,
    preventDefault: globalDelta !== 0 || panelDelta !== 0,
  };
}

/**
 * Apply routed wheel deltas to live scroll elements (embed only).
 * Returns the route result for tests/callers.
 */
export function applyEmbedWheelScroll(
  opts: {
    deltaY: number;
    globalEl: { scrollTop: number; scrollHeight: number; clientHeight: number } | null;
    panelEl: { scrollTop: number; scrollHeight: number; clientHeight: number } | null;
  }
): {
  globalDelta: number;
  panelDelta: number;
  preventDefault: boolean;
} {
  const g = opts.globalEl;
  const p = opts.panelEl;
  const gMax = g
    ? Math.max(0, (g.scrollHeight || 0) - (g.clientHeight || 0))
    : 0;
  const pMax = p
    ? Math.max(0, (p.scrollHeight || 0) - (p.clientHeight || 0))
    : 0;
  const routed = routeEmbedWheelScroll({
    deltaY: opts.deltaY,
    globalScrollTop: g?.scrollTop ?? 0,
    globalScrollMax: gMax,
    panelScrollTop: p?.scrollTop ?? 0,
    panelScrollMax: pMax,
  });
  if (g && routed.globalDelta) {
    g.scrollTop = (g.scrollTop || 0) + routed.globalDelta;
  }
  if (p && routed.panelDelta) {
    p.scrollTop = (p.scrollTop || 0) + routed.panelDelta;
  }
  return routed;
}

/** Collect unique GH footer nodes under doc. */
export function matchGithubFooterNodes(
  doc: { querySelectorAll?: (sel: string) => ArrayLike<Element> } | null | undefined
): Element[] {
  if (!doc || typeof doc.querySelectorAll !== 'function') return [];
  const seen = new Set<Element>();
  const out: Element[] = [];
  for (const sel of GH_FOOTER_SELECTORS) {
    let list: ArrayLike<Element>;
    try {
      list = doc.querySelectorAll(sel);
    } catch {
      continue;
    }
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (!el || seen.has(el)) continue;
      // Skip our own UI
      if (
        (el as HTMLElement).closest?.('#prp-page-embed, .prp-overlay, .prp-page-embed')
      ) {
        continue;
      }
      seen.add(el);
      out.push(el);
    }
  }
  return out;
}

/**
 * Hide GH footers while embed is active. Idempotent.
 * @returns number of newly hidden nodes
 */
export function applyFooterHide(
  doc: Document | { querySelectorAll?: (sel: string) => ArrayLike<Element> } | null
): number {
  let n = 0;
  for (const el of matchGithubFooterNodes(doc as any)) {
    const h = el as HTMLElement;
    if (h.getAttribute?.(PAGE_EMBED_FOOTER_HIDDEN_ATTR) === '1') continue;
    try {
      h.setAttribute(PAGE_EMBED_FOOTER_HIDDEN_ATTR, '1');
      if (h.style?.setProperty) {
        h.style.setProperty('display', 'none', 'important');
      }
      n += 1;
    } catch {
      /* ignore */
    }
  }
  return n;
}

/**
 * Restore footers previously hidden by applyFooterHide.
 * @returns number of restored nodes
 */
export function restoreFooters(
  doc:
    | Document
    | {
        querySelectorAll?: (sel: string) => ArrayLike<Element>;
      }
    | null
): number {
  if (!doc || typeof doc.querySelectorAll !== 'function') return 0;
  let n = 0;
  let list: ArrayLike<Element>;
  try {
    list = doc.querySelectorAll(`[${PAGE_EMBED_FOOTER_HIDDEN_ATTR}="1"]`);
  } catch {
    return 0;
  }
  for (let i = 0; i < list.length; i++) {
    const h = list[i] as HTMLElement;
    try {
      h.removeAttribute?.(PAGE_EMBED_FOOTER_HIDDEN_ATTR);
      h.style?.removeProperty?.('display');
      n += 1;
    } catch {
      /* ignore */
    }
  }
  return n;
}

/**
 * Pure shortcut policy for embed restore (mod+shift+e).
 * Returns 'restoreNativeView' or null.
 */
export function resolveEmbedShortcutAction(opts: {
  mod?: boolean;
  shift?: boolean;
  key?: string;
  presentation?: unknown;
  editableTarget?: boolean;
} = {}): 'restoreNativeView' | null {
  if (!isEmbedPresentation(opts.presentation)) return null;
  if (opts.editableTarget) return null;
  if (!opts.mod || !opts.shift) return null;
  const key = String(opts.key || '').toLowerCase();
  if (key === EMBED_RESTORE_SHORTCUT.key) return 'restoreNativeView';
  return null;
}
