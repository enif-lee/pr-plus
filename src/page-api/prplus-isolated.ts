/**
 * Isolated-world PRPlus bridge. Talks to SW; never uses send() (would stamp
 * page hostname as webHost).
 */
(function initPrPlusIsolated(global: any) {
  const CHANNEL = 'prp-page-api';
  const HELLO = 'prp-page-api-hello';
  const ATTR = 'data-prp-api-nonce';
  const VERSION = '1.10.2';
  const MSG = {
    OPEN_PR: 'PR_TREE_OPEN_PR',
    CLOSE_PR: 'PR_TREE_CLOSE_PR',
    PR_STATUS: 'PR_TREE_PR_STATUS',
  };

  const nonce = `prp-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

  function hello() {
    try {
      global.document?.documentElement?.setAttribute(ATTR, nonce);
    } catch {
      /* ignore */
    }
    try {
      global.dispatchEvent(
        new CustomEvent(HELLO, { detail: { nonce } })
      );
    } catch {
      /* ignore */
    }
  }

  function localOpenModal(args: any): boolean {
    const host = global.PRModalHost;
    if (!host || typeof host.openModal !== 'function') return false;
    if (typeof host.isEnabled === 'function' && !host.isEnabled()) return false;
    try {
      void host.openModal({
        owner: args.owner,
        repo: args.repo,
        number: args.number,
        page: args.page,
        position: args.position,
        presentation: 'modal',
        commitSha: args.commitSha,
        commitEndSha: args.commitEndSha,
        filePath: args.filePath,
        fileKey: args.fileKey,
        startLine: args.startLine,
        endLine: args.endLine,
        side: args.side,
      });
      return true;
    } catch {
      return false;
    }
  }

  function rpc(payload: Record<string, unknown>) {
    if (!global.chrome?.runtime?.sendMessage) {
      return Promise.resolve({ ok: false, error: 'chrome.runtime unavailable' });
    }
    return new Promise((resolve) => {
      try {
        global.chrome.runtime.sendMessage(payload, (res: any) => {
          const err = global.chrome.runtime.lastError;
          if (err) resolve({ ok: false, error: err.message });
          else resolve(res || { ok: false });
        });
      } catch (err: any) {
        resolve({ ok: false, error: err?.message || String(err) });
      }
    });
  }

  async function handleOp(op: string, args: any) {
    if (op === 'ping') return { ok: true, version: VERSION };
    if (op === 'status') {
      const res: any = await rpc({ type: MSG.PR_STATUS });
      return res?.status || res;
    }
    if (op === 'close') {
      return rpc({ type: MSG.CLOSE_PR });
    }
    if (op === 'open') {
      const openArgs = args && typeof args === 'object' ? args : {};
      const githubWebHost = openArgs.githubHost || openArgs.githubWebHost || undefined;
      const payload = {
        type: MSG.OPEN_PR,
        owner: openArgs.owner,
        repo: openArgs.repo,
        number: openArgs.number,
        page: openArgs.page ?? null,
        position: openArgs.position ?? null,
        presentation: openArgs.presentation ?? null,
        commitSha: openArgs.commitSha ?? null,
        commitEndSha: openArgs.commitEndSha ?? null,
        filePath: openArgs.filePath ?? null,
        fileKey: openArgs.fileKey ?? null,
        startLine: openArgs.startLine ?? null,
        endLine: openArgs.endLine ?? null,
        side: openArgs.side ?? null,
        githubWebHost,
        target: openArgs.target || 'auto',
      };
      if (localOpenModal(openArgs)) {
        return rpc({ ...payload, source: 'local-host' });
      }
      return rpc(payload);
    }
    return { ok: false, error: 'unknown-op' };
  }

  global.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== global) return;
    if (event.origin !== global.location.origin) return;
    const data = event.data;
    if (!data || data.channel !== CHANNEL || data.dir !== 'req') return;
    if (data.nonce !== nonce) return;
    void handleOp(String(data.op || ''), data.args).then((result: any) => {
      const ok = result && result.ok !== false;
      global.postMessage(
        {
          channel: CHANNEL,
          v: 1,
          dir: 'res',
          id: data.id,
          nonce,
          ok,
          result: ok ? result : undefined,
          error: ok ? undefined : result?.error || 'error',
        },
        global.location.origin
      );
    });
  });

  hello();
})(typeof globalThis !== 'undefined' ? globalThis : window);
