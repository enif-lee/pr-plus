/** channel */
/**
 * SOURCE OF TRUTH — complete content-script bridge body.
 * Runtime: src/content-bridge.js via npm run build:content-bridge
 * Do not split into mid-function fragments.
 */

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTransientChannelError(msg) {
  return /message channel closed|Receiving end does not exist|asynchronous response|Could not establish connection|Extension context invalidated/i.test(
    String(msg || '')
  );
}

export function isContextInvalidated(msg) {
  return /Extension context invalidated/i.test(String(msg || ''));
}

/** True when this content script can no longer talk to the extension (reload/update). */
export function isExtensionContextAlive() {
  try {
    return Boolean((globalThis as any).chrome?.runtime?.id);
  } catch {
    return false;
  }
}

export const RELOAD_REFRESH_MSG =
  'Extension was reloaded. Refresh this GitHub tab (⌘R / Ctrl+R) to reconnect pr+.';

/**
 * Prefer Promise-based chrome.runtime.sendMessage (MV3).
 * Retries with backoff while the service worker wakes from idle.
 * After extension reload, only a full page refresh can re-bind content scripts.
 */
/** Page origin context for GitHub Enterprise endpoint resolution. */
export function pageEndpointContext() {
  try {
    const host = String(globalThis.location?.hostname || '').toLowerCase();
    const origin = String(globalThis.location?.origin || '');
    return { webHost: host, webOrigin: origin };
  } catch {
    return { webHost: '', webOrigin: '' };
  }
}

export function makeAbortError() {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

export function isAbortError(err) {
  return (
    err?.name === 'AbortError' ||
    /aborted|AbortError/i.test(String(err?.message || err || ''))
  );
}

export let requestSeq = 0;
export function nextRequestId() {
  requestSeq += 1;
  return `prp-req-${Date.now().toString(36)}-${requestSeq}`;
}

/**
 * Ask the service worker to abort GitHub fetches for the given ids.
 * Fire-and-forget; safe if SW is already gone.
 * @param {string[]|string|null} requestIds
 * @param {{ cancelAll?: boolean }} [opts] cancelAll aborts every active SW GitHub fetch
 */
export function cancelFetches(requestIds, opts: any = {}) {
  const ids = Array.isArray(requestIds)
    ? requestIds.map(String).filter(Boolean)
    : requestIds != null
      ? [String(requestIds)]
      : [];
  const cancelAll = Boolean(opts?.cancelAll);
  if ((!ids.length && !cancelAll) || !isExtensionContextAlive()) {
    return Promise.resolve({ ok: false });
  }
  return chrome.runtime
    .sendMessage({
      type: 'PR_TREE_CANCEL_FETCH',
      requestIds: ids,
      ...(cancelAll ? { cancelAll: true } : null),
    })
    .catch(() => ({ ok: false }));
}

/** Reject when AbortSignal fires (unblocks await sendMessage on sheet close). */
export function whenAborted(signal) {
  return new Promise((_, reject) => {
    if (!signal) return;
    if (signal.aborted) {
      reject(makeAbortError());
      return;
    }
    signal.addEventListener(
      'abort',
      () => {
        reject(makeAbortError());
      },
      { once: true }
    );
  });
}

export async function send(message, { retries = 4, signal = null } = {} as any) {
  if (!(globalThis as any).chrome?.runtime?.sendMessage) {
    throw new Error('chrome.runtime unavailable');
  }
  // After chrome://extensions Reload, old content scripts lose chrome.runtime.id
  if (!isExtensionContextAlive()) {
    throw new Error(RELOAD_REFRESH_MSG);
  }
  if (signal?.aborted) throw makeAbortError();

  const page = pageEndpointContext();
  const requestId =
    (message && message.requestId) ||
    (signal ? nextRequestId() : null);
  const payload =
    message && typeof message === 'object'
      ? {
          ...message,
          ...(requestId ? { requestId } : null),
          webHost: message.webHost || page.webHost,
          webOrigin: message.webOrigin || page.webOrigin,
        }
      : message;

  // Track ids so host can bulk-cancel without relying only on signal listeners
  if (requestId && signal) {
    try {
      if (!signal.__prpRequestIds) signal.__prpRequestIds = new Set();
      signal.__prpRequestIds.add(requestId);
    } catch {
      /* ignore */
    }
  }

  const onAbort = () => {
    if (requestId) void cancelFetches([requestId]);
  };
  if (signal) {
    signal.addEventListener('abort', onAbort, { once: true });
  }

  const msgType = String(payload?.type || message?.type || '');
  const logFetch =
    /FETCH|DETAIL|THREADS|COMMITS|CHECKS|DEVELOPMENT|COMMENTS|REVIEWS|FILES|COMPARE/i.test(
      msgType
    ) && !/PING|CANCEL/i.test(msgType);
  const tBridge0 =
    typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  if (logFetch) {
    console.log(
      `[pr-plus][bridge] start ${msgType}` +
        (payload?.owner && payload?.repo
          ? ` ${payload.owner}/${payload.repo}`
          : '') +
        (payload?.number != null ? `#${payload.number}` : '') +
        (payload?.headSha
          ? ` sha=${String(payload.headSha).slice(0, 7)}`
          : '')
    );
  }

  let lastErr;
  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (signal?.aborted) throw makeAbortError();
      try {
        // Race: sheet close must not wait for SW to finish the full fetch.
        // CANCEL_FETCH runs immediately in SW (outside exclusive queue) and
        // aborts the underlying GitHub HTTP; race unblocks the content side.
        const sendP = chrome.runtime.sendMessage(payload);
        const response = signal
          ? await Promise.race([sendP, whenAborted(signal)])
          : await sendP;
        if (signal?.aborted) throw makeAbortError();
        if (response?.aborted) throw makeAbortError();
        if (logFetch) {
          const ms = Math.round(
            ((typeof performance !== 'undefined' && performance.now
              ? performance.now()
              : Date.now()) -
              tBridge0)
          );
          const ok = response?.ok !== false;
          console.log(
            `[pr-plus][bridge] end ${msgType} ${ms}ms${ok ? ' ok' : ' fail'}` +
              (response?.error ? ` err=${String(response.error).slice(0, 80)}` : '')
          );
        }
        return response;
      } catch (e) {
        if (isAbortError(e)) throw e;
        const msg = e?.message || String(e);
        lastErr = new Error(msg);
        if (isContextInvalidated(msg) || !isExtensionContextAlive()) {
          throw new Error(RELOAD_REFRESH_MSG);
        }
        // Do not retry after abort / sheet close
        if (signal?.aborted) throw makeAbortError();
        if (attempt < retries && isTransientChannelError(msg)) {
          // Wake SW: light PING then retry (idle SW common after minutes unused)
          try {
            await chrome.runtime.sendMessage({ type: 'PR_TREE_PING' });
          } catch {
            /* ignore — next attempt is the real message */
          }
          await sleep(80 + attempt * 160);
          continue;
        }
        if (logFetch) {
          const ms = Math.round(
            ((typeof performance !== 'undefined' && performance.now
              ? performance.now()
              : Date.now()) -
              tBridge0)
          );
          console.log(
            `[pr-plus][bridge] end ${msgType} ${ms}ms fail err=${String(msg).slice(0, 100)}`
          );
        }
        if (/Receiving end does not exist|Could not establish connection/i.test(msg)) {
          throw new Error(
            'Background worker offline. Open chrome://extensions → pr+ → Reload, then refresh this page (⌘R).'
          );
        }
        throw lastErr;
      }
    }
    throw lastErr || new Error('Failed to message background worker');
  } finally {
    if (signal) {
      try {
        signal.removeEventListener('abort', onAbort);
      } catch {
        /* ignore */
      }
    }
  }
}

/** Pure helper (no network / no token). */
