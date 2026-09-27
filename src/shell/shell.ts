/**
 * Extension-origin shell boot. Host IIFE already ran.
 *
 * Tab mode: SW drives open/close via `PR_TREE_SHELL_CMD` broadcasts addressed
 * to this tab (no long-lived port — it would die with the idle SW).
 * Frame mode (any time we are framed): the partner iframe on a Connected site.
 * The SW must confirm the embedder is a Connected site, else nothing renders
 * (a web-accessible page must not be clickjackable by arbitrary sites).
 */
(function bootShell(global: any) {
  const framed = (() => {
    try {
      return global.self !== global.top;
    } catch {
      return true;
    }
  })();

  function argsFromQuery() {
    const q = new URLSearchParams(global.location?.search || '');
    const num = (k: string) => {
      const v = q.get(k);
      return v == null || v === '' ? null : Number(v);
    };
    return {
      owner: q.get('owner') || '',
      repo: q.get('repo') || '',
      number: Number(q.get('number')),
      page: q.get('page') || null,
      position: q.get('position') || null,
      commitSha: q.get('commitSha') || null,
      commitEndSha: q.get('commitEndSha') || null,
      filePath: q.get('filePath') || null,
      fileKey: q.get('fileKey') || null,
      startLine: num('startLine'),
      endLine: num('endLine'),
      side: q.get('side') || null,
      githubWebHost: q.get('githubWebHost') || 'github.com',
      presentation: 'modal',
    };
  }

  function send(message: any): Promise<any> {
    return new Promise((resolve) => {
      try {
        global.chrome.runtime.sendMessage(message, (res: any) => {
          void global.chrome.runtime.lastError;
          resolve(res || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  async function evalFeatures() {
    const host = global.PRModalHost;
    if (!host || typeof host.setEnabled !== 'function') return false;
    const token = await send({ type: 'PR_TREE_TOKEN_STATUS' });
    const configured = Boolean(token?.configured);
    host.setEnabled(configured);
    return configured;
  }

  function openFromArgs(args: any) {
    const host = global.PRModalHost;
    if (!host?.openModal) return;
    void host.openModal({
      ...args,
      presentation: 'modal',
    });
  }

  function embedderOrigin(): string {
    try {
      const list = global.location?.ancestorOrigins;
      return list && list.length ? String(list[0]) : '';
    } catch {
      return '';
    }
  }

  async function frameAllowed(): Promise<boolean> {
    // Only a direct child of a top-level Connected site page.
    try {
      if (global.parent !== global.top) return false;
    } catch {
      return false;
    }
    const origin = embedderOrigin();
    if (!origin) return false;
    const res = await send({ type: 'PR_TREE_FRAME_ALLOWED', origin });
    return Boolean(res?.ok && res.allowed);
  }

  function watchFrameClose(origin: string) {
    let seenOpen = false;
    const tick = () => {
      const open = Boolean(global.document.querySelector('#prp-modal-host .prp-overlay'));
      if (open) {
        seenOpen = true;
        return;
      }
      if (!seenOpen) return;
      seenOpen = false;
      try {
        global.parent.postMessage({ type: 'prp-frame-close' }, origin);
      } catch {
        /* ignore */
      }
    };
    new MutationObserver(tick).observe(global.document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  async function bootFrame() {
    const doc = global.document;
    // Transparent before first paint so the host page shows behind the sheet.
    doc.documentElement.setAttribute('data-prp-shell-frame', '1');
    const origin = embedderOrigin();
    if (!(await frameAllowed())) {
      doc.body.textContent = '';
      // Data-free; lets a real partner drop its (now empty) full-viewport iframe.
      if (origin) {
        try {
          global.parent.postMessage({ type: 'prp-frame-close' }, origin);
        } catch {
          /* ignore */
        }
      }
      return;
    }
    // Links must not navigate the frame (GitHub refuses to be framed).
    const base = doc.createElement('base');
    base.target = '_blank';
    doc.head.appendChild(base);
    watchFrameClose(origin);
    if (!(await evalFeatures())) {
      global.parent.postMessage({ type: 'prp-frame-close' }, origin);
      return;
    }
    const args = argsFromQuery();
    if (args.owner && args.repo && Number.isFinite(args.number) && args.number > 0) {
      openFromArgs(args);
    }
  }

  function bootTab() {
    let myTabId: number | null = null;
    try {
      global.chrome?.tabs?.getCurrent?.((tab: any) => {
        myTabId = tab?.id ?? null;
      });
    } catch {
      /* ignore */
    }
    try {
      global.chrome?.runtime?.onMessage?.addListener(
        (msg: any, _sender: any, sendResponse: any) => {
          if (msg?.type !== 'PR_TREE_SHELL_CMD' || myTabId == null || msg.tabId !== myTabId) {
            return false;
          }
          if (msg.op === 'open') openFromArgs(msg.args || {});
          if (msg.op === 'close') global.PRModalHost?.closeModal?.();
          sendResponse({ ok: true });
          return false;
        }
      );
    } catch {
      /* ignore */
    }
    void evalFeatures().then(async (ok) => {
      if (!ok) return;
      const args = argsFromQuery();
      if (!(args.owner && args.repo && Number.isFinite(args.number) && args.number > 0)) return;
      // Only URLs the SW minted (a web page can navigate here too).
      const launch = new URLSearchParams(global.location?.search || '').get('launch') || '';
      const res = await send({ type: 'PR_TREE_SHELL_LAUNCH_CHECK', launch });
      if (res?.ok && res.allowed) openFromArgs(args);
    });
  }

  if (framed) void bootFrame();
  else bootTab();
})(typeof globalThis !== 'undefined' ? globalThis : window);
