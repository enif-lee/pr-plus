/** SW unit: sw-handle-message.ts — handleMessage + chrome.runtime.onMessage. */
/* global PRTreeStorage, PRTreeFetch, PRModalCollapse, PRGithubEndpoints */

import { handleMessagePartA } from './sw-handle-a';
import { handleMessagePartB } from './sw-handle-b';
import { MSG, MESSAGE_TIMEOUT_MS } from './sw-enterprise';
import {
  isAbortError,
  withServiceWorkerKeepAlive,
  withTimeout,
} from './sw-rate-limit';

export const ENTERPRISE_CS_ID = 'prp-enterprise-hosts';
export const CONTENT_SCRIPT_JS = [
  'src/tree.js',
  'src/dom.js',
  'src/pr-list-focus.js',
  'src/pulls-palette.js',
  'src/github-endpoints.js',
  'src/content-bridge.js',
  'src/content-bootstrap.js',
  'src/onboarding.js',
  'src/content.js',
  'src/modal/pure/detail-idb-cache.js',
  'src/modal/pure/detail-cache.js',
  'src/modal/pure/detail-merge.js',
  'src/modal/pure/detail-store.js',
  'src/modal/pure/load-progress.js',
  'src/modal/pure/page-embed.js',
  'src/modal/pure/floating-scrollbar.js',
  'src/modal/pure/auto-refresh.js',
  'src/modal/dist/pr-modal.bundle.js',
  'src/pr-modal-host.js',
];

/**
 * Stateless API context from RPC message (webHost from content page).
 * No process-global mutation — pass returned ctx into every PRTreeFetch call.
 */
export async function handleMessage(message: any): Promise<any> {
  const a = await handleMessagePartA(message);
  if (a !== undefined) return a;
  return handleMessagePartB(message);
}

/**
 * MV3 messaging: return a Promise so the channel stays open (Chrome 110+).
 * Lost during SW split — without this, popup/content get
 * "Receiving end does not exist" / Background worker offline.
 */
chrome.runtime.onMessage.addListener((message, _sender) => {
  // Fire-and-forget broadcasts: content scripts listen; no reply expected.
  if (message?.type === MSG.TOKEN_CHANGED) {
    return false;
  }

  if (!message || typeof message.type !== 'string') {
    return Promise.resolve({ ok: false, error: 'invalid message' });
  }

  /**
   * CANCEL_FETCH / PING: no long GitHub work — skip keep-alive timeout wrapper
   * so cancel is never delayed behind unrelated timers.
   */
  if (message.type === MSG.CANCEL_FETCH || message.type === MSG.PING) {
    return Promise.resolve()
      .then(() => handleMessage(message))
      .catch((err) => ({
        ok: false,
        error: err?.message || String(err),
        status: err?.status,
      }));
  }

  // Stateless concurrent handlers: each message carries webHost → apiCtx.
  return withServiceWorkerKeepAlive(() =>
    withTimeout(
      handleMessage(message),
      MESSAGE_TIMEOUT_MS,
      message.type
    ).catch((err) => ({
      ok: false,
      error: err?.message || String(err),
      status: err?.status,
      aborted: isAbortError(err) || undefined,
    }))
  );
});

