/**
 * MAIN-world window.PRPlus shim. No chrome.runtime.
 * Built as a classic script (world: MAIN).
 */
(function initPrPlusMain(global: any) {
  const CHANNEL = 'prp-page-api';
  const HELLO = 'prp-page-api-hello';
  const ATTR = 'data-prp-api-nonce';
  const VERSION = '1.10.2';

  let nonce = '';
  let ready = false;
  const pending: Array<() => void> = [];
  let seq = 0;

  function flush() {
    const q = pending.splice(0, pending.length);
    for (const fn of q) fn();
  }

  function acceptNonce(next: string) {
    if (!next || nonce) return;
    nonce = String(next);
    ready = true;
    try {
      global.document?.documentElement?.removeAttribute(ATTR);
    } catch {
      /* ignore */
    }
    flush();
  }

  try {
    global.addEventListener(HELLO, (ev: any) => {
      const n = ev?.detail?.nonce;
      if (n) acceptNonce(n);
    });
  } catch {
    /* ignore */
  }

  const start = Date.now();
  function poll() {
    try {
      const n = global.document?.documentElement?.getAttribute(ATTR);
      if (n) {
        acceptNonce(n);
        return;
      }
    } catch {
      /* ignore */
    }
    if (Date.now() - start > 1000) {
      flush();
      return;
    }
    try {
      global.requestAnimationFrame(poll);
    } catch {
      setTimeout(poll, 50);
    }
  }
  poll();

  function waitReady(): Promise<void> {
    if (ready) return Promise.resolve();
    if (Date.now() - start > 1000) return Promise.resolve();
    return new Promise((resolve) => {
      pending.push(resolve);
      setTimeout(resolve, Math.max(0, 1000 - (Date.now() - start)));
    });
  }

  function request(op: string, args?: unknown): Promise<any> {
    return waitReady().then(() => {
      if (!nonce) {
        return { ok: false, error: 'bridge-timeout' };
      }
      seq += 1;
      const id = `prp-${Date.now().toString(36)}-${seq}`;
      return new Promise((resolve) => {
        const onMsg = (event: MessageEvent) => {
          if (event.source !== global) return;
          if (event.origin !== global.location.origin) return;
          const data = event.data;
          if (!data || data.channel !== CHANNEL || data.dir !== 'res') return;
          if (data.id !== id || data.nonce !== nonce) return;
          global.removeEventListener('message', onMsg);
          if (data.ok) resolve(data.result);
          else resolve({ ok: false, error: data.error || 'error' });
        };
        global.addEventListener('message', onMsg);
        global.postMessage(
          {
            channel: CHANNEL,
            v: 1,
            dir: 'req',
            id,
            nonce,
            op,
            args,
          },
          global.location.origin
        );
        setTimeout(() => {
          global.removeEventListener('message', onMsg);
          resolve({ ok: false, error: 'bridge-timeout' });
        }, 30_000);
      });
    });
  }

  const api = {
    version: VERSION,
    ping() {
      return request('ping');
    },
    open(args: unknown) {
      return request('open', args);
    },
    close() {
      return request('close');
    },
    status() {
      return request('status');
    },
  };

  try {
    Object.defineProperty(global, 'PRPlus', {
      value: api,
      writable: false,
      configurable: true,
    });
  } catch {
    global.PRPlus = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
