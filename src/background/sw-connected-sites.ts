/** Connected-sites allowlist + partner content-script registration. */

import {
  PARTNER_CS_ISOLATED_JS,
  PARTNER_CS_MAIN_JS,
  PARTNER_HOST_JS,
  PARTNER_HOST_CSS,
} from '../content-scripts-list';

export const CONNECTED_SITES_KEY = 'connectedSites';
export const PARTNER_CS_ISOLATED_ID = 'prp-partner-prplus-isolated';
export const PARTNER_CS_MAIN_ID = 'prp-partner-prplus-main';
export const LINEAR_HOST_CS_ID = 'prp-linear-partner-host';

export const LINEAR_MATCHES = [
  'https://linear.app/*',
  'https://*.linear.app/*',
] as const;

export const JIRA_MATCHES = ['https://*.atlassian.net/*'] as const;

export const LOOPBACK_MATCHES = [
  'http://localhost/*',
  'http://127.0.0.1/*',
] as const;

export type ConnectedSitesState = {
  origins: string[];
};

export function isLinearMatch(pattern: string): boolean {
  return LINEAR_MATCHES.includes(pattern as (typeof LINEAR_MATCHES)[number]);
}

export function normalizeConnectedOrigins(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const origin = String(item || '').trim();
    if (!origin || seen.has(origin)) continue;
    if (origin === 'http://[::1]/*' || origin === 'http://*/*') continue;
    seen.add(origin);
    out.push(origin);
  }
  return out;
}

export async function getConnectedSites(): Promise<ConnectedSitesState> {
  const area = (globalThis as any).chrome?.storage?.local;
  if (!area) return { origins: [] };
  return new Promise((resolve) => {
    area.get([CONNECTED_SITES_KEY], (result: any) => {
      resolve({
        origins: normalizeConnectedOrigins(result?.[CONNECTED_SITES_KEY]?.origins),
      });
    });
  });
}

export async function setConnectedSites(
  origins: string[]
): Promise<ConnectedSitesState> {
  const area = (globalThis as any).chrome?.storage?.local;
  const next = { origins: normalizeConnectedOrigins(origins) };
  if (!area) return next;
  return new Promise((resolve, reject) => {
    area.set({ [CONNECTED_SITES_KEY]: next }, () => {
      const err = (globalThis as any).chrome?.runtime?.lastError;
      if (err) reject(err);
      else resolve(next);
    });
  });
}

export function partnerScriptEntries(origins: string[]) {
  const matches = normalizeConnectedOrigins(origins);
  if (!matches.length) return [];
  return [
    {
      id: PARTNER_CS_ISOLATED_ID,
      matches,
      js: [...PARTNER_CS_ISOLATED_JS],
      runAt: 'document_start' as const,
      persistAcrossSessions: true,
    },
    {
      id: PARTNER_CS_MAIN_ID,
      matches,
      js: [...PARTNER_CS_MAIN_JS],
      runAt: 'document_start' as const,
      world: 'MAIN' as const,
      persistAcrossSessions: true,
    },
  ];
}

export function linearHostScriptEntry(origins: string[]) {
  const matches = normalizeConnectedOrigins(origins).filter(isLinearMatch);
  if (!matches.length) return null;
  return {
    id: LINEAR_HOST_CS_ID,
    matches,
    js: [...PARTNER_HOST_JS],
    css: [...PARTNER_HOST_CSS],
    runAt: 'document_idle' as const,
    persistAcrossSessions: true,
  };
}

export function partnerScriptListsExcludeGithubStack(): boolean {
  const banned = [
    'src/content.js',
    'src/tree.js',
    'src/dom.js',
    'src/onboarding.js',
    'src/pr-list-focus.js',
    'src/pulls-palette.js',
    'src/content-bootstrap.js',
  ];
  const combined = [...PARTNER_CS_ISOLATED_JS, ...PARTNER_CS_MAIN_JS, ...PARTNER_HOST_JS];
  return banned.every((name) => !combined.includes(name as never));
}

let partnerCsSyncChain = Promise.resolve();

export async function syncPartnerContentScripts(origins?: string[]) {
  const run = async () => {
    const list =
      origins != null
        ? normalizeConnectedOrigins(origins)
        : (await getConnectedSites()).origins;
    if (!chrome.scripting?.registerContentScripts) {
      return { registered: false, origins: list };
    }
    const ids = [
      PARTNER_CS_ISOLATED_ID,
      PARTNER_CS_MAIN_ID,
      LINEAR_HOST_CS_ID,
    ];
    try {
      await chrome.scripting.unregisterContentScripts({ ids });
    } catch {
      /* not registered */
    }
    const scripts: any[] = partnerScriptEntries(list);
    const linear = linearHostScriptEntry(list);
    if (linear) scripts.push(linear);
    if (!scripts.length) return { registered: false, origins: list };
    await chrome.scripting.registerContentScripts(scripts);
    return { registered: true, origins: list, scripts: scripts.map((s) => s.id) };
  };
  const next = partnerCsSyncChain.then(run, run);
  partnerCsSyncChain = next.then(
    (): void => undefined,
    (): void => undefined
  );
  return next;
}

export async function injectPartnerScriptsIntoTab(tabId: number, url: string) {
  if (!chrome.scripting?.executeScript) return { ok: false };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false };
  }
  const originPattern = `${parsed.protocol}//${parsed.host}/*`;
  const sites = await getConnectedSites();
  const granted = sites.origins.some((p) => {
    if (p === originPattern) return true;
    if (p.startsWith('https://*.') && parsed.hostname.endsWith(p.slice('https://*.'.length, -2))) {
      return parsed.protocol === 'https:';
    }
    return false;
  });
  if (!granted) return { ok: false, reason: 'not-allowlisted' };
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [...PARTNER_CS_ISOLATED_JS],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [...PARTNER_CS_MAIN_JS],
      world: 'MAIN',
    });
    const isLinear =
      parsed.hostname === 'linear.app' || parsed.hostname.endsWith('.linear.app');
    if (isLinear) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [...PARTNER_HOST_JS],
      });
      if (chrome.scripting.insertCSS) {
        await chrome.scripting.insertCSS({
          target: { tabId },
          files: [...PARTNER_HOST_CSS],
        });
      }
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function requestConnectedSiteOrigins(
  origins: string[]
): Promise<{ granted: boolean; origins: string[]; error?: string }> {
  const list = normalizeConnectedOrigins(origins);
  if (!list.length) return { granted: true, origins: [] };
  if (!chrome.permissions?.request) {
    return { granted: false, error: 'permissions API unavailable', origins: list };
  }
  return new Promise((resolve) => {
    chrome.permissions.request({ origins: list }, (granted: boolean) => {
      const err = chrome.runtime.lastError;
      if (err) resolve({ granted: false, error: err.message, origins: list });
      else resolve({ granted: Boolean(granted), origins: list });
    });
  });
}


