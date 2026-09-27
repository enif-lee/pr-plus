/** SW unit: sw-enterprise.ts */
/* global PRTreeStorage, PRTreeFetch, PRModalCollapse, PRGithubEndpoints */

import {
  CONTENT_SCRIPT_CSS,
  CONTENT_SCRIPT_JS,
} from '../content-scripts-list';
import { MSG } from '../sw-messages';
import { syncPartnerContentScripts } from './sw-connected-sites';

export { CONTENT_SCRIPT_CSS, CONTENT_SCRIPT_JS };
export { MSG };
export type { SwMessage, SwMessageType } from '../sw-messages';

export const ENTERPRISE_CS_ID = 'prp-enterprise-hosts';

/**
 * Resolve the GitHub web host for PAT + API base.
 * Linear/Jira/localhost fall back to extension-owned activeGithubWebHost.
 */
export async function resolveGithubWebHostFromStorage(message: any) {
  const [registered, active] = await Promise.all([
    registeredEnterpriseHosts().catch((): any[] => []),
    typeof PRTreeStorage?.getActiveGithubWebHost === 'function'
      ? PRTreeStorage.getActiveGithubWebHost()
      : Promise.resolve('github.com'),
  ]);
  if (typeof PRGithubEndpoints?.resolveGithubWebHost === 'function') {
    return PRGithubEndpoints.resolveGithubWebHost(message, {
      registeredHosts: registered,
      activeGithubWebHost: active,
    });
  }
  return 'github.com';
}

export async function bindGithubWebHost(message: any) {
  const host = await resolveGithubWebHostFromStorage(message);
  if (message && typeof message === 'object') {
    message.githubWebHost = host;
  }
  return host;
}

/**
 * Stateless API context from RPC message.
 * Prefers already-resolved githubWebHost (see bindGithubWebHost).
 */
export function apiCtxFromMessage(message: any) {
  const webHost =
    message?.githubWebHost || message?.webHost || message?.webOrigin || 'github.com';
  if (typeof PRGithubEndpoints?.resolveGithubEndpoints === 'function') {
    return PRGithubEndpoints.resolveGithubEndpoints({ webHost });
  }
  if (typeof PRGithubEndpoints?.normalizeApiCtx === 'function') {
    return PRGithubEndpoints.normalizeApiCtx({ webHost });
  }
  return {
    kind: 'dotcom',
    webHost: 'github.com',
    webOrigin: 'https://github.com',
    restBase: 'https://api.github.com',
    graphqlUrl: 'https://api.github.com/graphql',
  };
}

/**
 * PAT for this message's resolved GitHub web host.
 * github.com → default token; registered enterprise → host pair; else null.
 */
export async function tokenForMessage(message: any) {
  const [registered, active, defaultToken, hostAccounts] = await Promise.all([
    registeredEnterpriseHosts().catch((): any[] => []),
    typeof PRTreeStorage?.getActiveGithubWebHost === 'function'
      ? PRTreeStorage.getActiveGithubWebHost()
      : Promise.resolve('github.com'),
    PRTreeStorage.getGithubToken(),
    PRTreeStorage.getHostAccounts(),
  ]);
  if (typeof PRGithubEndpoints?.selectTokenForMessage === 'function') {
    const sel = PRGithubEndpoints.selectTokenForMessage(message, {
      registeredHosts: registered,
      activeGithubWebHost: active,
      defaultToken,
      hostAccounts,
    });
    if (message && typeof message === 'object') {
      message.githubWebHost = sel.host;
    }
    return sel.token;
  }
  const webHost = await resolveGithubWebHostFromStorage(message);
  const sel = await PRTreeStorage.getTokenForWebHost(webHost);
  return sel.token;
}

/** Registered enterprise hostnames (no tokens) for tab query / content scripts. */
export async function registeredEnterpriseHosts() {
  return PRTreeStorage.getHostAccountHosts();
}

export function githubTabUrlPatterns(enterpriseHosts: any) {
  const patterns = ['https://github.com/*', 'https://*.github.com/*'];
  const hosts = PRGithubEndpoints.normalizeEnterpriseWebHosts(enterpriseHosts);
  for (const h of hosts) {
    patterns.push(`https://${h}/*`);
  }
  return patterns;
}

/**
 * Serialize enterprise content-script sync.
 * HOST_ACCOUNT_ADD and storage.onChanged both call this; parallel
 * registerContentScripts races cause:
 *   "Duplicate script ID 'prp-enterprise-hosts'"
 */
export let enterpriseCsSyncChain = Promise.resolve();

export async function syncEnterpriseContentScripts(enterpriseHosts: any) {
  const run = () => syncEnterpriseContentScriptsImpl(enterpriseHosts);
  // Always continue the chain even if a prior sync rejected
  const next = enterpriseCsSyncChain.then(run, run);
  enterpriseCsSyncChain = next.then(
    (): any => undefined,
    (): any => undefined
  );
  return next;
}

export async function syncEnterpriseContentScriptsImpl(enterpriseHosts: any) {
  if (!chrome.scripting?.registerContentScripts) {
    return { registered: false };
  }
  const matches =
    PRGithubEndpoints.contentScriptMatchesForHosts(enterpriseHosts);

  // Drop existing registration if present (id may already be live).
  try {
    if (typeof chrome.scripting.getRegisteredContentScripts === 'function') {
      const existing = await chrome.scripting.getRegisteredContentScripts({
        ids: [ENTERPRISE_CS_ID],
      });
      if (Array.isArray(existing) && existing.length > 0) {
        await chrome.scripting.unregisterContentScripts({
          ids: [ENTERPRISE_CS_ID],
        });
      }
    } else {
      await chrome.scripting.unregisterContentScripts({
        ids: [ENTERPRISE_CS_ID],
      });
    }
  } catch {
    /* not registered yet — fine */
  }

  if (!matches.length) return { registered: false, matches: [] };

  const script = {
    id: ENTERPRISE_CS_ID,
    matches,
    js: [...CONTENT_SCRIPT_JS],
    css: [...CONTENT_SCRIPT_CSS],
    runAt: 'document_idle',
    persistAcrossSessions: true,
  };

  // Prefer update when available (avoids delete/create race with other callers).
  if (typeof chrome.scripting.updateContentScripts === 'function') {
    try {
      await chrome.scripting.updateContentScripts([script]);
      return { registered: true, matches, updated: true };
    } catch {
      /* not registered — fall through to register */
    }
  }

  try {
    await chrome.scripting.registerContentScripts([script]);
  } catch (err) {
    // Last resort: if race left a registration, unregister + retry once.
    const msg = String(err?.message || err || '');
    if (/duplicate script id/i.test(msg)) {
      try {
        await chrome.scripting.unregisterContentScripts({
          ids: [ENTERPRISE_CS_ID],
        });
      } catch {
        /* ignore */
      }
      await chrome.scripting.registerContentScripts([script]);
    } else {
      throw err;
    }
  }
  return { registered: true, matches };
}

export async function requestEnterprisePermissions(enterpriseHosts: any) {
  if (!chrome.permissions?.request) {
    return { granted: false, error: 'permissions API unavailable' };
  }
  const origins = new Set();
  for (const h of PRGithubEndpoints.normalizeEnterpriseWebHosts(enterpriseHosts)) {
    origins.add(`https://${h}/*`);
    // GHE Cloud API lives on api.{webHost}
    if (h.endsWith('.ghe.com') && !h.startsWith('api.')) {
      origins.add(`https://api.${h}/*`);
    }
  }
  const list = [...(origins as any)];
  if (!list.length) return { granted: true, origins: [] };
  return new Promise((resolve) => {
    chrome.permissions.request({ origins: list }, (granted: any) => {
      const err = chrome.runtime.lastError;
      if (err) resolve({ granted: false, error: err.message, origins: list });
      else resolve({ granted: Boolean(granted), origins: list });
    });
  });
}

/** Max time for one SW message (GitHub multi-request detail can be slow). */
export const MESSAGE_TIMEOUT_MS = 120_000;

export async function rehydrateEnterpriseScripts() {
  try {
    const hosts = await registeredEnterpriseHosts();
    await syncEnterpriseContentScripts(hosts);
  } catch (err) {
    console.warn('[pr+] enterprise content scripts', err?.message || err);
  }
  try {
    await syncPartnerContentScripts();
  } catch (err: any) {
    console.warn('[pr+] partner content scripts', err?.message || err);
  }
}

/** First-run destination after Chrome Web Store / sideload install (onboarding uses PR #1). */
export const INSTALL_PULLS_URL = 'https://github.com/enif-lee/pr-plus/pulls';

try {
  chrome.runtime.onInstalled.addListener((details: any) => {
    void rehydrateEnterpriseScripts();
    // Fresh install only — not update / chrome.runtime.reload()
    if (details?.reason === 'install') {
      try {
        chrome.tabs.create({ url: INSTALL_PULLS_URL });
      } catch (err) {
        console.warn('[pr+] open install pulls tab failed', err?.message || err);
      }
    }
  });
  chrome.runtime.onStartup.addListener(() => {
    void rehydrateEnterpriseScripts();
  });
} catch {
  /* ignore */
}

// Cold SW wake: re-register enterprise hosts from storage
void rehydrateEnterpriseScripts();

