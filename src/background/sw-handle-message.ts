/** SW unit: sw-handle-message.ts — handleMessage + chrome.runtime.onMessage. */
/* global PRTreeStorage, PRTreeFetch, PRModalCollapse, PRGithubEndpoints */

import { handleMessagePartA } from './sw-handle-a';
import { handleMessagePartB } from './sw-handle-b';
import {
  MSG,
  MESSAGE_TIMEOUT_MS,
  ENTERPRISE_CS_ID,
  CONTENT_SCRIPT_JS,
  bindGithubWebHost,
} from './sw-enterprise';
import { isSwMessage, type SwMessage } from '../sw-messages';
import { handlePageApiMessage, allowExternalSender } from './sw-open-pr';
import { handleDetailCacheMessage } from './sw-detail-cache';
import {
  isAbortError,
  withServiceWorkerKeepAlive,
  withTimeout,
} from './sw-rate-limit';

export { ENTERPRISE_CS_ID, CONTENT_SCRIPT_JS };

/**
 * Stateless API context from RPC message (webHost from content page).
 * No process-global mutation — pass returned ctx into every PRTreeFetch call.
 */
export async function handleMessage(
  message: SwMessage,
  sender?: any
): Promise<unknown> {
  if (
    message.type !== MSG.PING &&
    message.type !== MSG.CANCEL_FETCH &&
    message.type !== MSG.DETAIL_CACHE_GET &&
    message.type !== MSG.DETAIL_CACHE_SET &&
    message.type !== MSG.DETAIL_CACHE_DELETE &&
    message.type !== MSG.DETAIL_CACHE_CLEAR
  ) {
    await bindGithubWebHost(message);
  }
  const pageApi = await handlePageApiMessage(message, sender);
  if (pageApi !== undefined) return pageApi;
  const cache = await handleDetailCacheMessage(message);
  if (cache !== undefined) return cache;
  const a = await handleMessagePartA(message);
  if (a !== undefined) return a;
  return handleMessagePartB(message);
}

/**
 * MV3 messaging: return a Promise so the channel stays open (Chrome 110+).
 * Lost during SW split — without this, popup/content get
 * "Receiving end does not exist" / Background worker offline.
 */
chrome.runtime.onMessage.addListener((message: any, sender: any) => {
  // Fire-and-forget broadcasts: content scripts listen; no reply expected.
  if (isSwMessage(message) && message.type === MSG.TOKEN_CHANGED) {
    return false;
  }

  if (!isSwMessage(message)) {
    return Promise.resolve({ ok: false, error: 'invalid message' });
  }

  /**
   * CANCEL_FETCH / PING: no long GitHub work — skip keep-alive timeout wrapper
   * so cancel is never delayed behind unrelated timers.
   */
  if (message.type === MSG.CANCEL_FETCH || message.type === MSG.PING) {
    return Promise.resolve()
      .then(() => handleMessage(message, sender))
      .catch((err) => ({
        ok: false,
        error: err?.message || String(err),
        status: err?.status,
      }));
  }

  // Stateless concurrent handlers: each message carries webHost → apiCtx.
  return withServiceWorkerKeepAlive(() =>
    withTimeout(
      handleMessage(message, sender),
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

try {
  chrome.runtime.onMessageExternal.addListener((message: any, sender: any) => {
    if (!allowExternalSender(sender)) {
      return Promise.resolve({ ok: false, error: 'not-allowlisted' });
    }
    if (!isSwMessage(message)) {
      return Promise.resolve({ ok: false, error: 'invalid message' });
    }
    return handleMessage(message, sender).catch((err) => ({
      ok: false,
      error: err?.message || String(err),
    }));
  });
} catch {
  /* tests / missing API */
}

