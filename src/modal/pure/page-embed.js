/**
 * Pure page-embed helpers (content-script + unit tests).
 * Keep in sync with src/modal/lib/page-embed.ts.
 */
(function initPageEmbed() {
  const PRESENTATION_MODAL = 'modal';
  const PRESENTATION_EMBED = 'embed';
  const PAGE_EMBED_HOST_ID = 'prp-page-embed';
  const PAGE_EMBED_ACTIVE_CLASS = 'prp-embed-active';
  const PAGE_EMBED_HEADER_OFFSET_PX = 64;
  const PAGE_EMBED_HOST_HEIGHT_CSS = '100vh';
  const PAGE_EMBED_HOST_Z_INDEX = 100000;
  const PAGE_EMBED_FOOTER_HIDDEN_ATTR = 'data-prp-footer-hidden';
  const GH_FOOTER_SELECTORS = [
    'footer.footer',
    'footer.Footer',
    '#footer',
    '[data-test-selector="site-footer"]',
    '[data-test-selector="footer"]',
    'div.footer',
    '.footer',
    'footer',
  ];
  const EMBED_RESTORE_SHORTCUT = {
    alt: true,
    shift: true,
    key: 'e',
    action: 'restoreNativeView',
    label: '⌥⇧E',
    labelWin: 'Alt+Shift+E',
  };

  /** Same chord; open pr+ from native GH PR chrome. */
  const EMBED_OPEN_SHORTCUT = {
    alt: true,
    shift: true,
    key: 'e',
    action: 'openEmbedView',
    label: EMBED_RESTORE_SHORTCUT.label,
    labelWin: EMBED_RESTORE_SHORTCUT.labelWin,
  };

  const SHA_RE = /^[0-9a-f]{7,40}$/i;
  const RANGE_RE = /^([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})$/i;

  function parsePrPagePath(pathname) {
    const path = String(pathname || '')
      .split('?')[0]
      .split('#')[0];
    // conversation | files | changes | changes/{sha} | changes/{a}..{b}
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
    if (tab && tab !== 'files' && tab !== 'changes') return null;
    const page =
      tab === 'files' || tab === 'changes' ? 'diff' : 'conversation';
    const rest = String(m[5] || '').trim();
    let commitSha = null;
    let commitEndSha = null;
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

  function isPrEmbedTarget(pathname) {
    return parsePrPagePath(pathname) != null;
  }

  function normalizePresentation(value) {
    const v = String(value || '')
      .trim()
      .toLowerCase();
    if (
      v === PRESENTATION_EMBED ||
      v === 'page' ||
      v === 'in-page' ||
      v === 'inline'
    ) {
      return PRESENTATION_EMBED;
    }
    return PRESENTATION_MODAL;
  }

  function isEmbedPresentation(value) {
    return normalizePresentation(value) === PRESENTATION_EMBED;
  }

  function embedShellChromeFlags() {
    return {
      presentation: PRESENTATION_EMBED,
      showClose: false,
      showShellToggle: false,
      showFullscreen: false,
      showExit: false,
      showRestoreNative: true,
    };
  }

  function presentationClassName(presentation) {
    return isEmbedPresentation(presentation) ? 'prp-shell--embed' : '';
  }

  function shouldShowEmbedChrome(presentation, control) {
    if (control === 'restoreNative') {
      return isEmbedPresentation(presentation);
    }
    if (!isEmbedPresentation(presentation)) return true;
    return false;
  }

  function clamp(n, lo, hi) {
    if (!Number.isFinite(n)) return lo;
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  function embedGlobalScrollMax(opts) {
    // Full-window fixed embed covers GH header → no document scroll room
    if (opts?.coverHeader !== false) return 0;
    const vh = Math.max(0, Number(opts?.viewportHeight) || 0);
    const header =
      opts?.headerOffset != null && Number.isFinite(Number(opts.headerOffset))
        ? Math.max(0, Number(opts.headerOffset))
        : PAGE_EMBED_HEADER_OFFSET_PX;
    const embedH =
      opts?.embedHeight != null && Number.isFinite(Number(opts.embedHeight))
        ? Math.max(0, Number(opts.embedHeight))
        : vh;
    const footer =
      opts?.footerHeight != null && Number.isFinite(Number(opts.footerHeight))
        ? Math.max(0, Number(opts.footerHeight))
        : 0;
    return Math.max(0, header + embedH + footer - vh);
  }

  function routeEmbedWheelScroll(opts) {
    const dy = Number(opts?.deltaY);
    if (!Number.isFinite(dy) || dy === 0) {
      return { globalDelta: 0, panelDelta: 0, preventDefault: false };
    }
    const gMax = Math.max(0, Number(opts.globalScrollMax) || 0);
    const pMax = Math.max(0, Number(opts.panelScrollMax) || 0);
    const gTop = clamp(Number(opts.globalScrollTop) || 0, 0, gMax);
    const pTop = clamp(Number(opts.panelScrollTop) || 0, 0, pMax);
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

  function applyEmbedWheelScroll(opts) {
    const g = opts?.globalEl || null;
    const p = opts?.panelEl || null;
    const gMax = g
      ? Math.max(0, (g.scrollHeight || 0) - (g.clientHeight || 0))
      : 0;
    const pMax = p
      ? Math.max(0, (p.scrollHeight || 0) - (p.clientHeight || 0))
      : 0;
    const routed = routeEmbedWheelScroll({
      deltaY: opts?.deltaY,
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

  function matchGithubFooterNodes(doc) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return [];
    const seen = new Set();
    const out = [];
    for (const sel of GH_FOOTER_SELECTORS) {
      let list;
      try {
        list = doc.querySelectorAll(sel);
      } catch {
        continue;
      }
      for (let i = 0; i < list.length; i++) {
        const el = list[i];
        if (!el || seen.has(el)) continue;
        if (
          el.closest &&
          el.closest('#prp-page-embed, .prp-overlay, .prp-page-embed')
        ) {
          continue;
        }
        seen.add(el);
        out.push(el);
      }
    }
    return out;
  }

  function applyFooterHide(doc) {
    let n = 0;
    for (const el of matchGithubFooterNodes(doc)) {
      if (el.getAttribute?.(PAGE_EMBED_FOOTER_HIDDEN_ATTR) === '1') continue;
      try {
        el.setAttribute(PAGE_EMBED_FOOTER_HIDDEN_ATTR, '1');
        if (el.style?.setProperty) {
          el.style.setProperty('display', 'none', 'important');
        }
        n += 1;
      } catch {
        /* ignore */
      }
    }
    return n;
  }

  function restoreFooters(doc) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return 0;
    let n = 0;
    let list;
    try {
      list = doc.querySelectorAll(`[${PAGE_EMBED_FOOTER_HIDDEN_ATTR}="1"]`);
    } catch {
      return 0;
    }
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      try {
        el.removeAttribute?.(PAGE_EMBED_FOOTER_HIDDEN_ATTR);
        el.style?.removeProperty?.('display');
        n += 1;
      } catch {
        /* ignore */
      }
    }
    return n;
  }

  function resolveEmbedShortcutAction(opts) {
    if (opts?.editableTarget) return null;
    if (opts?.mod) return null;
    if (!opts?.alt || !opts?.shift) return null;
    const key = String(opts?.key || '').toLowerCase();
    const code = String(opts?.code || '');
    const isE =
      key === EMBED_RESTORE_SHORTCUT.key ||
      code === 'KeyE' ||
      code === 'keye';
    if (!isE) return null;
    if (isEmbedPresentation(opts?.presentation)) return 'restoreNativeView';
    if (opts?.onNativePrPage) return 'openEmbedView';
    return null;
  }

  const api = {
    PRESENTATION_MODAL,
    PRESENTATION_EMBED,
    PAGE_EMBED_HOST_ID,
    PAGE_EMBED_ACTIVE_CLASS,
    PAGE_EMBED_HEADER_OFFSET_PX,
    PAGE_EMBED_HOST_HEIGHT_CSS,
    PAGE_EMBED_HOST_Z_INDEX,
    PAGE_EMBED_FOOTER_HIDDEN_ATTR,
    GH_FOOTER_SELECTORS,
    EMBED_RESTORE_SHORTCUT,
    EMBED_OPEN_SHORTCUT,
    parsePrPagePath,
    isPrEmbedTarget,
    normalizePresentation,
    isEmbedPresentation,
    embedShellChromeFlags,
    presentationClassName,
    shouldShowEmbedChrome,
    embedGlobalScrollMax,
    routeEmbedWheelScroll,
    applyEmbedWheelScroll,
    matchGithubFooterNodes,
    applyFooterHide,
    restoreFooters,
    resolveEmbedShortcutAction,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.PRModalPageEmbed = api;
  }
})();
