/**
 * Linear partner boot. Host IIFE already ran (PARTNER_HOST_JS order).
 * Overlay only; enable after token/prefs evaluation.
 */
(function bootPartner(global: any) {
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
