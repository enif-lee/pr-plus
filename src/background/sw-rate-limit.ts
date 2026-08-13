/** SW unit: sw-rate-limit.ts */
/* global PRTreeStorage, PRTreeFetch, PRModalCollapse, PRGithubEndpoints */

/**
 * In-memory rate-limit + pluginEnabled.
 * Always pin to globalThis so esbuild renames / split modules cannot leave
 * free `rlMem` bindings as ReferenceError in event handlers.
 */
type RlMem = {
  pluginEnabled: boolean;
  state: any;
  loaded: boolean;
  saveTimer: any;
};

function getRlMem(): RlMem {
  const g = globalThis as any;
  if (!g.__prpRlMem) {
    g.__prpRlMem = {
      pluginEnabled: true,
      state: null,
      loaded: false,
      saveTimer: null,
    };
  }
  return g.__prpRlMem as RlMem;
}

/** Live bag — reads/writes go to globalThis.__prpRlMem. */
export const rlMem: RlMem = new Proxy({} as RlMem, {
  get(_t, prop: string | symbol) {
    return (getRlMem() as any)[prop];
  },
  set(_t, prop: string | symbol, value) {
    (getRlMem() as any)[prop] = value;
    return true;
  },
});

/** In-flight GitHub fetches keyed by content-script requestId. */
export const activeFetchControllers = new Map();
/** requestIds cancelled before beginTrackedFetch ran. */
export const preCancelledFetchIds = new Set();

export function makeAbortError() {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}


/** Raw browser fetch (no rate-limit). Only used as the innermost base. */
export function rawBrowserFetch() {
  return globalThis.fetch.bind(globalThis);
}

export function rateLimitApi() {
  return (globalThis as any).PRModalRateLimit || null;
}

export async function ensureRateLimitMem() {
  if (rlMem.loaded) return rlMem;
  try {
    const prefs = await PRTreeStorage.getExtensionPrefs();
    rlMem.pluginEnabled = prefs?.pluginEnabled !== false;
  } catch {
    rlMem.pluginEnabled = true;
  }
  try {
    const st = await PRTreeStorage.getRateLimitState();
    const RL = rateLimitApi();
    rlMem.state =
      typeof RL?.clearExpiredRateDisables === 'function'
        ? RL.clearExpiredRateDisables(st, Date.now())
        : st;
  } catch {
    const RL = rateLimitApi();
    rlMem.state =
      typeof RL?.emptyRateLimitState === 'function'
        ? RL.emptyRateLimitState()
        : {
            disabledUntil: { core: 0, graphql: 0, search: 0 },
            snapshots: { core: null, graphql: null, search: null },
          };
  }
  rlMem.loaded = true;
  return rlMem;
}

export function schedulePersistRateLimitState() {
  if (rlMem.saveTimer) return;
  rlMem.saveTimer = setTimeout(() => {
    rlMem.saveTimer = null;
    const st = rlMem.state;
    if (!st) return;
    void PRTreeStorage.setRateLimitState(st)
      .then(() => {
        // Avoid importing broadcast (cycle); notify via runtime + tabs lightly.
        try {
          const msg = {
            type: 'PR_TREE_RATE_LIMIT_CHANGED',
            state: st,
            pluginEnabled: rlMem.pluginEnabled,
          };
          chrome.runtime.sendMessage(msg, () => {
            void chrome.runtime.lastError;
          });
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, 200);
}

export function makeRateLimitError(resource: string, untilMs: number, reason: string) {
  const until =
    untilMs > 0 ? new Date(untilMs).toISOString() : '';
  const err: any = new Error(
    reason === 'plugin-disabled'
      ? 'pr+ is disabled in settings'
      : `GitHub ${resource} rate limit — retry after ${until || 'reset'}`
  );
  err.name = 'RateLimitError';
  err.status = 429;
  err.rateLimitResource = resource;
  err.rateLimitUntil = untilMs;
  err.rateLimitReason = reason;
  return err;
}

export function assertGithubRequestAllowed(url: any) {
  const RL = rateLimitApi();
  const resource =
    typeof RL?.classifyGithubUrl === 'function'
      ? RL.classifyGithubUrl(url)
      : 'core';
  if (rlMem.pluginEnabled === false) {
    throw makeRateLimitError(resource, 0, 'plugin-disabled');
  }
  if (typeof RL?.shouldAllowGithubRequest === 'function') {
    const gate = RL.shouldAllowGithubRequest({
      pluginEnabled: rlMem.pluginEnabled,
      state: rlMem.state,
      resource,
      nowMs: Date.now(),
    });
    if (!gate.allow) {
      throw makeRateLimitError(
        resource,
        gate.disabledUntilMs || 0,
        gate.reason || 'rate-disabled'
      );
    }
  }
  return resource;
}

export function noteGithubResponse(res: any, url: any, resourceHint: any) {
  const RL = rateLimitApi();
  if (!RL || !res) return;
  const resource =
    resourceHint ||
    (typeof RL.classifyGithubUrl === 'function'
      ? RL.classifyGithubUrl(url)
      : 'core');
  const now = Date.now();
  try {
    let next = rlMem.state;
    if (res.status === 429) {
      if (typeof RL.withRateLimit429 === 'function') {
        next = RL.withRateLimit429(next, resource, res.headers, now);
      }
      // Per-resource disable only (withRateLimit429). Do NOT flip global
      // pluginEnabled off — a GraphQL 429 used to kill core REST too, so hard
      // reopen after meta write painted "No milestone" while GH still had it
      // (full e2e suite cascade: P2.1 threads=0 + MB3 hard miss).
    } else if (typeof RL.parseRateLimitHeaders === 'function') {
      const snap = RL.parseRateLimitHeaders(res.headers, {
        fallbackResource: resource,
        nowMs: now,
      });
      if (snap && typeof RL.withRateLimitSnapshot === 'function') {
        next = RL.withRateLimitSnapshot(next, snap);
      }
    }
    if (typeof RL.clearExpiredRateDisables === 'function') {
      next = RL.clearExpiredRateDisables(next, now);
    }
    rlMem.state = next;
    schedulePersistRateLimitState();
  } catch {
    /* ignore observe errors */
  }
}

/**
 * Rate-limit + pluginEnabled gate + header observation for every GitHub HTTP call.
 * Used by fetchImpl() so bare handlers and beginTrackedFetch share one path.
 */
export function wrapFetchWithRateLimit(baseFetch: any) {
  return async (url: any, init: any = {}) => {
    try {
      await ensureRateLimitMem();
    } catch {
      /* proceed if storage cold */
    }
    let resource = 'core';
    try {
      resource = assertGithubRequestAllowed(url);
    } catch (err) {
      return Promise.reject(err);
    }
    const res = await baseFetch(url, init);
    try {
      noteGithubResponse(res, url, resource);
    } catch {
      /* ignore */
    }
    return res;
  };
}

/**
 * Default fetch for ALL SW GitHub handlers (mutations + tracked reads).
 * Never return raw globalThis.fetch — that bypassed rate-limit gates.
 */
export function fetchImpl() {
  return wrapFetchWithRateLimit(rawBrowserFetch());
}

/** AbortSignal merge only; rate-limit is already on baseFetch from fetchImpl(). */
export function wrapFetchWithSignal(baseFetch: any, signal: any) {
  return async (url: any, init: any = {}) => {
    if (signal.aborted) return Promise.reject(makeAbortError());
    let nextSignal = signal;
    if (init.signal && init.signal !== signal) {
      if (
        typeof AbortSignal !== 'undefined' &&
        typeof AbortSignal.any === 'function'
      ) {
        nextSignal = AbortSignal.any([init.signal, signal]);
      }
    }
    return baseFetch(url, {
      ...(init as any),
      signal: nextSignal,
    });
  };
}

export function beginTrackedFetch(requestId: any) {
  // Always track: missing requestId still gets a synthetic id so cancelAll
  // can abort mid-flight work (list fetches, older call sites, etc.).
  const id =
    requestId != null && String(requestId)
      ? String(requestId)
      : `auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

  // Cancel arrived before this handler acquired the exclusive lock
  if (preCancelledFetchIds.has(id)) {
    preCancelledFetchIds.delete(id);
    const controller = new AbortController();
    try {
      controller.abort();
    } catch {
      /* ignore */
    }
    return {
      requestId: id,
      controller,
      fetch: wrapFetchWithSignal(fetchImpl(), controller.signal),
    };
  }

  // Supersede any prior controller for the same id
  const prev = activeFetchControllers.get(id);
  if (prev) {
    try {
      prev.abort();
    } catch {
      /* ignore */
    }
  }
  const controller = new AbortController();
  activeFetchControllers.set(id, controller);
  return {
    requestId: id,
    controller,
    fetch: wrapFetchWithSignal(fetchImpl(), controller.signal),
  };
}

export function endTrackedFetch(requestId: any) {
  const id = requestId != null ? String(requestId) : '';
  if (!id) return;
  activeFetchControllers.delete(id);
  preCancelledFetchIds.delete(id);
}

export function cancelTrackedFetch(requestId: any) {
  const id = requestId != null ? String(requestId) : '';
  if (!id) return false;
  // Mark pre-cancelled so a still-queued FETCH_* starts aborted
  preCancelledFetchIds.add(id);
  try {
    setTimeout(() => preCancelledFetchIds.delete(id), 60_000);
  } catch {
    /* ignore */
  }
  const ac = activeFetchControllers.get(id);
  if (ac) {
    try {
      ac.abort();
    } catch {
      /* ignore */
    }
    activeFetchControllers.delete(id);
  }
  return true;
}

export function cancelTrackedFetches(requestIds: any) {
  const ids = Array.isArray(requestIds) ? requestIds : [];
  let n = 0;
  for (const id of ids) {
    if (cancelTrackedFetch(id)) n += 1;
  }
  return n;
}

/** Abort every in-flight tracked GitHub fetch (sheet close belt-and-suspenders). */
export function cancelAllTrackedFetches() {
  const ids = [...activeFetchControllers.keys()];
  let n = 0;
  for (const id of ids) {
    if (cancelTrackedFetch(id)) n += 1;
  }
  return n;
}

export function isAbortError(err: any) {
  return (
    err?.name === 'AbortError' ||
    /aborted|AbortError/i.test(String(err?.message || err || ''))
  );
}

/**
 * Periodic chrome API call keeps the MV3 service worker alive during long
 * GitHub fetches (otherwise SW can suspend mid-handler and close the channel).
 */
export function withServiceWorkerKeepAlive(work: any) {
  let tick = 0;
  const id = setInterval(() => {
    tick += 1;
    try {
      chrome.runtime.getPlatformInfo(() => {
        void chrome.runtime.lastError;
      });
    } catch {
      /* ignore */
    }
    // Also touch storage lightly every other tick
    if (tick % 2 === 0) {
      try {
        chrome.storage.local.get('__prp_keepalive__', () => {
          void chrome.runtime.lastError;
        });
      } catch {
        /* ignore */
      }
    }
  }, 15_000);

  return Promise.resolve()
    .then(work)
    .finally(() => clearInterval(id));
}

export function withTimeout(promise: any, ms: any, label: any) {
  let timer: any;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(
        `${label || 'Request'} timed out after ${Math.round(ms / 1000)}s`
      );
      err.status = 408;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}



export function applyPrefsToRlMem(prefs: any) {
  rlMem.pluginEnabled = prefs?.pluginEnabled !== false;
  rlMem.loaded = true;
}

export function applyRateLimitStateToRlMem(raw: any) {
  try {
    const RL = rateLimitApi();
    rlMem.state =
      typeof RL?.normalizeRateLimitState === 'function'
        ? RL.normalizeRateLimitState(raw)
        : raw;
    rlMem.loaded = true;
  } catch {
    /* ignore */
  }
}
