/**
 * Extension-origin shell boot. Host IIFE already ran.
 */
(function bootShell(global: any) {
  try {
    global.chrome?.runtime?.connect?.({ name: 'prp-shell' });
  } catch {
    /* ignore */
  }

  function argsFromQuery() {
    const q = new URLSearchParams(global.location?.search || '');
    const number = Number(q.get('number'));
    return {
      owner: q.get('owner') || '',
      repo: q.get('repo') || '',
      number,
      page: q.get('page') || null,
      filePath: q.get('filePath') || null,
      githubWebHost: q.get('githubWebHost') || 'github.com',
      presentation: 'modal',
    };
  }

  async function evalFeatures() {
    const host = global.PRModalHost;
    if (!host || typeof host.setEnabled !== 'function') return;
    let configured = false;
    try {
      const token = await global.chrome?.runtime?.sendMessage?.({
        type: 'PR_TREE_TOKEN_STATUS',
      });
      configured = Boolean(token?.configured);
    } catch {
      configured = false;
    }
    host.setEnabled(configured);
    return configured;
  }

  function openFromPort(args: any) {
    const host = global.PRModalHost;
    if (!host?.openModal) return;
    void host.openModal({
      ...args,
      presentation: 'modal',
    });
  }

  try {
    const port = global.chrome?.runtime?.connect?.({ name: 'prp-shell' });
    port?.onMessage?.addListener((msg: any) => {
      if (msg?.op === 'open') openFromPort(msg.args || {});
      if (msg?.op === 'close') global.PRModalHost?.closeModal?.();
    });
  } catch {
    /* ignore */
  }

  void evalFeatures().then((ok) => {
    if (!ok) return;
    const args = argsFromQuery();
    if (args.owner && args.repo && Number.isFinite(args.number) && args.number > 0) {
      openFromPort(args);
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
