/**
 * Pure helpers for in-page PR embed (full-window replace covering GH header).
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
  /** Path tab segment (empty | files | changes | …) */
  tab: string;
  /** Single commit or range start under /changes/{sha} */
  commitSha?: string | null;
  /** Range end under /changes/{a}..{b} */
  commitEndSha?: string | null;
};

/** Host root id for in-page embed (distinct from overlay #prp-modal-host). */
export const PAGE_EMBED_HOST_ID = 'prp-page-embed';

/** html/body class while embed is active */
export const PAGE_EMBED_ACTIVE_CLASS = 'prp-embed-active';

/**
 * While embed covers the PR page, host installs a window-capture key shield
 * so GitHub SPA document-level shortcuts never see keydown/keyup/keypress.
 * pr+ handlers must listen on `window` (same phase) — stopPropagation does not
 * cancel other listeners on the same target.
 */
export const PAGE_EMBED_KEY_SHIELD_EVENTS: readonly string[] = [
  'keydown',
  'keyup',
  'keypress',
];

/** Stop pr+ UI events before GitHub's document-level delegated handlers. */
export const PAGE_EMBED_BUBBLE_SHIELD_EVENTS: readonly string[] = [
  'click',
  'auxclick',
  'dblclick',
  'contextmenu',
  'mousedown',
  'mouseup',
  'mousemove',
  'pointerdown',
  'pointerup',
  'pointermove',
  'touchstart',
  'touchend',
  'input',
  'change',
  'submit',
];

/**
 * Legacy GH header height token (px). Kept for scroll helpers / tests;
 * embed host is now fixed full-viewport and covers the header.
 */
export const PAGE_EMBED_HEADER_OFFSET_PX = 64;

/**
 * Embed host CSS height policy: full window (covers GH header).
 * Prefer 100dvh in CSS when supported; logical height remains 100vh.
 */
export const PAGE_EMBED_HOST_HEIGHT_CSS = '100vh';

/** Host stacking: above GH AppHeader so official chrome is covered. */
export const PAGE_EMBED_HOST_Z_INDEX = 100000;

/** Mark applied to GitHub footer nodes while embed is active */
export const PAGE_EMBED_FOOTER_HIDDEN_ATTR = 'data-prp-footer-hidden';

/**
 * Mark applied to native GH nodes we fully suppress under embed
 * (`display:none` + optional `inert`). Restored by host restoreNativeMain.
 */
export const PAGE_EMBED_NATIVE_HIDDEN_ATTR = 'data-prp-native-hidden';

/** Companion mark when we set `element.inert = true` (safe restore only). */
export const PAGE_EMBED_NATIVE_INERT_ATTR = 'data-prp-native-inert';

/**
 * Body-level ids that must stay mounted while embed is active.
 * Everything else under `body` is residual GH (or other) chrome we can hide.
 */
export const PAGE_EMBED_BODY_KEEP_IDS: readonly string[] = [
  PAGE_EMBED_HOST_ID,
  'prp-modal-host',
];

/**
 * Tags under body that carry no paint cost and must not be display:none'd
 * (extension injectors / GH boot scripts may still need them in the tree).
 */
export const PAGE_EMBED_BODY_KEEP_TAGS: readonly string[] = [
  'SCRIPT',
  'STYLE',
  'LINK',
  'TEMPLATE',
  'META',
  'NOSCRIPT',
];

/**
 * Extra GH chrome selectors outside `application-main` children
 * (header shelf, global banners). Applied with native-hidden + inert.
 */
export const GH_RESIDUAL_CHROME_SELECTORS: readonly string[] = [
  '.AppHeader',
  'header.AppHeader',
  '.js-header-wrapper',
  '[data-target="app-header"]',
  '.js-notification-shelf',
  '#js-flash-container',
  '.flash-messages',
  '#ajax-error-message',
  '[data-turbo-permanent][data-prp-gh-chrome]',
];

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
 * Keyboard: toggle pr+ embed ↔ native GH PR UI.
 * ⌥⇧E / Alt+Shift+E — migrated from ⌘⇧E (mod → opt).
 * - embed active → restoreNativeView
 * - native PR page → openEmbedView
 */
export const EMBED_RESTORE_SHORTCUT = {
  alt: true,
  shift: true,
  key: 'e',
  action: 'restoreNativeView' as const,
  label: '⌥⇧E',
  labelWin: 'Alt+Shift+E',
};

/** Same chord as EMBED_RESTORE_SHORTCUT; open pr+ from native PR chrome. */
export const EMBED_OPEN_SHORTCUT = {
  alt: true,
  shift: true,
  key: 'e',
  action: 'openEmbedView' as const,
  label: EMBED_RESTORE_SHORTCUT.label,
  labelWin: EMBED_RESTORE_SHORTCUT.labelWin,
};

const SHA_RE = /^[0-9a-f]{7,40}$/i;
const RANGE_RE = /^([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})$/i;

/**
 * Parse a GitHub PR conversation or files/changes URL path.
 * Matches:
 *   /owner/repo/pull/123
 *   /owner/repo/pull/123/
 *   /owner/repo/pull/123/files
 *   /owner/repo/pull/123/changes
 *   /owner/repo/pull/123/changes/{sha}
 *   /owner/repo/pull/123/changes/{a}..{b}
 * Does not match commits/checks/other sub-tabs (not embed targets).
 */
export function parsePrPagePath(pathname: unknown): PrPageTarget | null {
  const path = String(pathname || '').split('?')[0].split('#')[0];
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
  // Conversation (no tab) or files/changes only
  if (tab && tab !== 'files' && tab !== 'changes') return null;
  const page: 'conversation' | 'diff' =
    tab === 'files' || tab === 'changes' ? 'diff' : 'conversation';
  const rest = String(m[5] || '').trim();
  let commitSha: string | null = null;
  let commitEndSha: string | null = null;
  if (rest) {
    const range = rest.match(RANGE_RE);
    if (range) {
      commitSha = range[1].toLowerCase();
      commitEndSha = range[2].toLowerCase();
    } else if (SHA_RE.test(rest)) {
      commitSha = rest.toLowerCase();
    }
  }
  return {
    owner,
    repo,
    number,
    page,
    tab: tab || 'conversation',
    commitSha,
    commitEndSha,
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
 * Document scroll room when embed is active.
 * Full-window fixed embed covers GH header and locks document scroll →
 * global max is 0 (panel owns the wheel). Callers may still pass layout
 * metrics for tests of alternate policies.
 *
 * @returns max global scrollTop (px).
 */
export function embedGlobalScrollMax(opts: {
  viewportHeight: number;
  headerOffset?: number;
  /** Embed host height in px (default = viewport = 100vh) */
  embedHeight?: number;
  /** Footer contribution after hide (should be 0) */
  footerHeight?: number;
  /**
   * When true (default), fixed full-window cover → no document scroll room.
   * Set false to compute legacy header+embed flow layout capacity.
   */
  coverHeader?: boolean;
}): number {
  const cover =
    opts.coverHeader !== false; /* shipped: cover GH header */
  if (cover) return 0;

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

type ResidualEl = {
  id?: string;
  tagName?: string;
  getAttribute?: (name: string) => string | null;
  setAttribute?: (name: string, value: string) => void;
  removeAttribute?: (name: string) => void;
  style?: {
    setProperty?: (name: string, value: string, priority?: string) => void;
    removeProperty?: (name: string) => void;
  };
  inert?: boolean;
  closest?: (sel: string) => Element | null;
};

/**
 * Whether a direct `body` child should stay visible/mounted under embed.
 * Keeps pr+ hosts, non-layout tags (script/style/link/…), and pr+ portals
 * (ConfirmDialog / ShortcutHint / reaction picker live on document.body).
 */
export function shouldKeepEmbedBodyChild(
  el: ResidualEl | null | undefined,
  embedEl?: ResidualEl | null
): boolean {
  if (!el) return true;
  if (embedEl && el === embedEl) return true;
  const id = String(el.id || '');
  if (id && PAGE_EMBED_BODY_KEEP_IDS.includes(id)) return true;
  if (id.includes('prp')) return true;
  const tag = String(el.tagName || '').toUpperCase();
  if (tag && PAGE_EMBED_BODY_KEEP_TAGS.includes(tag)) return true;
  // className may be string or SVGAnimatedString
  try {
    const cls = String((el as { className?: unknown }).className ?? '');
    if (cls.includes('prp-')) return true;
  } catch {
    /* ignore */
  }
  try {
    if (
      el.getAttribute?.('data-prp-confirm') != null ||
      el.getAttribute?.('data-prp-reaction-picker') != null
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  // Nested pr+ UI (should not be a body child, but be defensive)
  try {
    if (el.closest?.(`#${PAGE_EMBED_HOST_ID}, .prp-page-embed, .prp-overlay`)) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Apply display:none + inert + native-hidden attr. Idempotent. */
export function markNativeHidden(el: ResidualEl | null | undefined): boolean {
  if (!el || typeof el.setAttribute !== 'function') return false;
  if (el.getAttribute?.(PAGE_EMBED_NATIVE_HIDDEN_ATTR) === '1') return false;
  try {
    el.setAttribute(PAGE_EMBED_NATIVE_HIDDEN_ATTR, '1');
    el.style?.setProperty?.('display', 'none', 'important');
    el.style?.setProperty?.('content-visibility', 'hidden', 'important');
    try {
      el.inert = true;
      el.setAttribute?.(PAGE_EMBED_NATIVE_INERT_ATTR, '1');
    } catch {
      /* inert unsupported */
    }
    return true;
  } catch {
    return false;
  }
}

/** Undo markNativeHidden for one node. */
export function unmarkNativeHidden(el: ResidualEl | null | undefined): boolean {
  if (!el || typeof el.removeAttribute !== 'function') return false;
  if (el.getAttribute?.(PAGE_EMBED_NATIVE_HIDDEN_ATTR) !== '1') return false;
  try {
    el.removeAttribute(PAGE_EMBED_NATIVE_HIDDEN_ATTR);
    el.style?.removeProperty?.('display');
    el.style?.removeProperty?.('content-visibility');
    if (el.getAttribute?.(PAGE_EMBED_NATIVE_INERT_ATTR) === '1') {
      try {
        el.inert = false;
      } catch {
        /* ignore */
      }
      el.removeAttribute(PAGE_EMBED_NATIVE_INERT_ATTR);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Hide every direct `body` child except pr+ hosts and non-layout tags.
 * Strong residual suppress: GH PR SPA root, side panels, turbo frames at body.
 * @returns newly hidden count
 */
export function applyBodyResidualHide(
  doc: {
    body?: { children?: ArrayLike<ResidualEl> } | null;
  } | null,
  embedEl?: ResidualEl | null
): number {
  const body = doc?.body;
  if (!body || !body.children) return 0;
  let n = 0;
  const kids = body.children;
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    if (shouldKeepEmbedBodyChild(child, embedEl)) continue;
    if (markNativeHidden(child)) n += 1;
  }
  return n;
}

/**
 * Hide known GH chrome nodes (header, flash, notification shelf) even when
 * they are not direct body children.
 * @returns newly hidden count
 */
export function applyGithubChromeHide(
  doc: {
    querySelectorAll?: (sel: string) => ArrayLike<ResidualEl>;
  } | null
): number {
  if (!doc || typeof doc.querySelectorAll !== 'function') return 0;
  let n = 0;
  const seen = new Set<ResidualEl>();
  for (const sel of GH_RESIDUAL_CHROME_SELECTORS) {
    let list: ArrayLike<ResidualEl>;
    try {
      list = doc.querySelectorAll(sel);
    } catch {
      continue;
    }
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (!el || seen.has(el)) continue;
      try {
        if (
          el.closest?.(
            `#${PAGE_EMBED_HOST_ID}, .prp-page-embed, .prp-overlay, #prp-modal-host`
          )
        ) {
          continue;
        }
      } catch {
        /* ignore */
      }
      seen.add(el);
      if (markNativeHidden(el)) n += 1;
    }
  }
  return n;
}

/**
 * Full residual suppress for embed open: body children + GH chrome + footers.
 * Safe to call repeatedly (idempotent).
 * @returns total newly hidden nodes (body + chrome + footer)
 */
export function applyNativeResidualHide(
  doc: Document | null | undefined,
  embedEl?: ResidualEl | null
): { body: number; chrome: number; footer: number; total: number } {
  const body = applyBodyResidualHide(doc as any, embedEl);
  const chrome = applyGithubChromeHide(doc as any);
  const footer = applyFooterHide(doc as any);
  return { body, chrome, footer, total: body + chrome + footer };
}

/**
 * Restore every node marked with PAGE_EMBED_NATIVE_HIDDEN_ATTR.
 * @returns restored count
 */
export function restoreNativeHiddenNodes(
  doc: {
    querySelectorAll?: (sel: string) => ArrayLike<ResidualEl>;
  } | null
): number {
  if (!doc || typeof doc.querySelectorAll !== 'function') return 0;
  let n = 0;
  let list: ArrayLike<ResidualEl>;
  try {
    list = doc.querySelectorAll(`[${PAGE_EMBED_NATIVE_HIDDEN_ATTR}="1"]`);
  } catch {
    return 0;
  }
  for (let i = 0; i < list.length; i++) {
    if (unmarkNativeHidden(list[i])) n += 1;
  }
  return n;
}

/**
 * Resolve ⌥⇧E / Alt+Shift+E for embed ↔ native PR chrome (was ⌘⇧E).
 * @returns restoreNativeView | openEmbedView | null
 */
export function resolveEmbedShortcutAction(opts: {
  mod?: boolean;
  alt?: boolean;
  shift?: boolean;
  key?: string;
  code?: string;
  presentation?: unknown;
  /** True when on a GH PR conversation/files URL and embed is not covering the page */
  onNativePrPage?: boolean;
  editableTarget?: boolean;
} = {}): 'restoreNativeView' | 'openEmbedView' | null {
  if (opts.editableTarget) return null;
  if (opts.mod) return null;
  if (!opts.alt || !opts.shift) return null;
  const key = String(opts.key || '').toLowerCase();
  const code = String(opts.code || '');
  const isE =
    key === EMBED_RESTORE_SHORTCUT.key ||
    code === 'KeyE' ||
    code === 'keye';
  if (!isE) return null;
  if (isEmbedPresentation(opts.presentation)) return 'restoreNativeView';
  if (opts.onNativePrPage) return 'openEmbedView';
  return null;
}

/**
 * Stable PR identity for the location-driven auto-open latch.
 * Ignores conversation/files tab, hash (`#discussion_r…`), and query.
 * @returns e.g. `owner/repo#7` or null when invalid
 */
export function prEmbedAutoOpenKey(
  owner: unknown,
  repo: unknown,
  number: unknown
): string | null {
  const o = String(owner || '')
    .trim()
    .toLowerCase();
  const r = String(repo || '')
    .trim()
    .toLowerCase();
  const n = Number(number);
  if (!o || !r || !Number.isFinite(n) || n <= 0) return null;
  return `${o}/${r}#${n}`;
}

export type EmbedAutoOpenDecision = {
  /** Call openModal for auto-open (not route-update of an already-open embed). */
  shouldOpen: boolean;
  /** Latch value after this evaluation (null = left PR pages). */
  nextEvaluatedKey: string | null;
  reason:
    | 'not-pr-page'
    | 'auto-open-disabled'
    | 'already-evaluated'
    | 'first-entry'
    | 'force';
};

/**
 * Whether location-driven auto-open should open pr+ embed.
 *
 * Product: evaluate each PR at most once per document lifetime (or until the
 * user soft-navigates away from all PR pages). Hash-only / Files tab changes
 * on the **same** PR must not re-open after the first decision (opened or
 * stayed native). A **different** PR key may open once. `force` is for pref
 * flip false→true (open even if this PR was already evaluated).
 *
 * Manual open (header toggle / ⌥⇧E) bypasses this gate in the host.
 */
export function resolveEmbedAutoOpen(
  opts: {
    prKey?: string | null;
    lastEvaluatedPrKey?: string | null;
    autoOpenEmbed?: boolean;
    /** Pref turned on while already on a PR page */
    force?: boolean;
  } = {}
): EmbedAutoOpenDecision {
  const rawKey = opts.prKey == null ? '' : String(opts.prKey).trim();
  const prKey = rawKey || null;
  if (!prKey) {
    return {
      shouldOpen: false,
      nextEvaluatedKey: null,
      reason: 'not-pr-page',
    };
  }
  const lastRaw =
    opts.lastEvaluatedPrKey == null
      ? ''
      : String(opts.lastEvaluatedPrKey).trim();
  const last = lastRaw || null;
  const auto = opts.autoOpenEmbed !== false;
  const force = Boolean(opts.force);

  if (force && auto) {
    return {
      shouldOpen: true,
      nextEvaluatedKey: prKey,
      reason: 'force',
    };
  }
  if (!auto) {
    // Stay native; still mark so later hash/tab events with pref off are quiet.
    // Pref false→true uses force.
    return {
      shouldOpen: false,
      nextEvaluatedKey: prKey,
      reason: 'auto-open-disabled',
    };
  }
  if (last === prKey) {
    return {
      shouldOpen: false,
      nextEvaluatedKey: prKey,
      reason: 'already-evaluated',
    };
  }
  return {
    shouldOpen: true,
    nextEvaluatedKey: prKey,
    reason: 'first-entry',
  };
}
