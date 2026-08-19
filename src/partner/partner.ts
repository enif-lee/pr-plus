/**
 * Linear partner boot. Host IIFE already ran (PARTNER_HOST_JS order).
 * Overlay only; enable after token/prefs evaluation.
 * Capture-phase click on GitHub PR links (Linear "linked PR") opens pr+.
 */
(function bootPartner(global: any) {
  let lastOpenKey = '';
  let lastOpenAt = 0;

  function isPrPlusUiEvent(event: any): boolean {
    const path =
      typeof event?.composedPath === 'function' ? event.composedPath() : [];
    const nodes = path.length ? path : [event?.target];
    for (const n of nodes) {
      if (!n) continue;
      const id = String(n.id || '');
      if (
        id === 'prp-modal-host' ||
        id === 'prp-page-embed' ||
        id === 'prp-modal-root'
      ) {
        return true;
      }
      const cls = n.classList;
      if (
        cls &&
        typeof cls.contains === 'function' &&
        (cls.contains('prp-overlay') ||
          cls.contains('prp-shell') ||
          cls.contains('prp-header'))
      ) {
        return true;
      }
      if (typeof n.closest === 'function') {
        if (n.closest('#prp-modal-host, #prp-page-embed, .prp-overlay, .prp-shell')) {
          return true;
        }
      }
    }
    return false;
  }

  function findPrFromEvent(event: any) {
    const ep = global.PRGithubEndpoints;
    if (typeof ep?.findGithubPullFromClickPath !== 'function') {
      if (typeof ep?.parseGithubPullUrl === 'function') {
        const t = event?.target;
        const href =
          (t && t.getAttribute && t.getAttribute('href')) || t?.href || null;
        return ep.parseGithubPullUrl(href, global.location?.href);
      }
      return null;
    }
    const path =
      typeof event.composedPath === 'function' ? event.composedPath() : [];
    const nodes = path.length ? path : [event.target];
    return ep.findGithubPullFromClickPath(nodes, {
      base: global.location?.href,
    });
  }

  function openOverlay(parsed: any) {
    const host = global.PRModalHost;
    if (host && typeof host.openModal === 'function') {
      if (typeof host.isEnabled === 'function' && !host.isEnabled()) {
        return false;
      }
      const key = `${parsed.githubWebHost}/${parsed.owner}/${parsed.repo}/${parsed.number}`;
      const now = Date.now();
      if (key === lastOpenKey && now - lastOpenAt < 500) return true;
      lastOpenKey = key;
      lastOpenAt = now;
      void host.openModal({
        owner: parsed.owner,
        repo: parsed.repo,
        number: parsed.number,
        presentation: 'modal',
      });
      try {
        global.chrome?.runtime?.sendMessage?.({
          type: 'PR_TREE_OPEN_PR',
          owner: parsed.owner,
          repo: parsed.repo,
          number: parsed.number,
          githubWebHost: parsed.githubWebHost,
          target: 'opener-embed',
          source: 'local-host',
        });
      } catch {
        /* ignore */
      }
      return true;
    }
    return false;
  }

  function onLinkedPrPointer(event: any) {
    if (event.defaultPrevented) return;
    if (event.button != null && event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (isPrPlusUiEvent(event)) return;
    const parsed = findPrFromEvent(event);
    if (!parsed) return;
    if (!openOverlay(parsed)) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  }

  try {
    global.document.addEventListener('pointerdown', onLinkedPrPointer, true);
    global.document.addEventListener('click', onLinkedPrPointer, true);
  } catch {
    /* ignore */
  }

  async function evalFeatures() {
    const host = global.PRModalHost;
    if (!host || typeof host.setEnabled !== 'function') return;
    let configured = false;
    let pluginEnabled = true;
    try {
      const token = await global.chrome?.runtime?.sendMessage?.({
        type: 'PR_TREE_TOKEN_STATUS',
      });
      configured = Boolean(token?.configured);
    } catch {
      configured = false;
    }
    try {
      const prefs = await global.chrome?.runtime?.sendMessage?.({
        type: 'PR_TREE_PREFS_GET',
      });
      pluginEnabled = prefs?.prefs?.pluginEnabled !== false;
    } catch {
      pluginEnabled = true;
    }
    host.setEnabled(configured && pluginEnabled);
  }

  void evalFeatures();
})(typeof globalThis !== 'undefined' ? globalThis : window);
