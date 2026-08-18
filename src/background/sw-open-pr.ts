/** OPEN_PR / CLOSE_PR / PR_STATUS + connected-sites RPC. */

import { MSG } from '../sw-messages';
import type { SwMessage } from '../sw-messages';
import { githubTabUrlPatterns, registeredEnterpriseHosts } from './sw-enterprise';
import {
  getConnectedSites,
  setConnectedSites,
  syncPartnerContentScripts,
  requestConnectedSiteOrigins,
  injectPartnerScriptsIntoTab,
  normalizeConnectedOrigins,
  LINEAR_MATCHES,
} from './sw-connected-sites';

export type LauncherSession = {
  renderTarget: 'extension-shell' | 'github-tab' | 'opener-embed';
  tabId: number;
  owner: string;
  repo: string;
  number: number;
  githubWebHost: string;
  callerOrigin: string;
  openedAt: number;
};

const launchers = new Map<string, LauncherSession>();
const shellPorts = new Map<number, { postMessage: (msg: object) => void }>();
const rateBuckets = new Map<string, { n: number; resetAt: number }>();

export function callerOriginFromSender(sender?: {
  origin?: string;
  url?: string;
  tab?: { id?: number; url?: string };
  id?: string;
}): string {
  const origin = String(sender?.origin || '');
  if (!origin || origin === 'null') return '';
  return origin;
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:') return false;
    return (
      u.hostname === 'localhost' ||
      u.hostname === '127.0.0.1' ||
      u.hostname === '[::1]' ||
      u.hostname === '::1'
    );
  } catch {
    return false;
  }
}

export function allowExternalSender(sender: {
  origin?: string;
  id?: string;
}): boolean {
  const extId = (globalThis as any).chrome?.runtime?.id;
  if (sender.id && sender.id !== extId) return false;
  return isLoopbackOrigin(String(sender.origin || ''));
}

function rateLimit(origin: string, op: string): boolean {
  const key = `${origin}|${op}`;
  const now = Date.now();
  const cur = rateBuckets.get(key);
  if (!cur || now >= cur.resetAt) {
    rateBuckets.set(key, { n: 1, resetAt: now + 60_000 });
    return false;
  }
  cur.n += 1;
  return cur.n > 10;
}

function launcherKey(origin: string): string {
  return origin || '';
}

function sessionForOrigin(origin: string): LauncherSession | null {
  return launchers.get(launcherKey(origin)) || null;
}

function putLauncher(session: LauncherSession) {
  launchers.set(launcherKey(session.callerOrigin), session);
}

function statusFromSession(
  session: LauncherSession | null,
  callerOrigin: string
): Record<string, unknown> {
  if (!session) {
    return {
      ready: true,
      open: false,
      owner: null,
      repo: null,
      number: null,
      page: null,
      presentation: null,
      githubHost: null,
      renderTarget: null,
      callerOrigin,
    };
  }
  return {
    ready: true,
    open: true,
    owner: session.owner,
    repo: session.repo,
    number: session.number,
    page: null,
    presentation: session.renderTarget === 'opener-embed' ? 'modal' : session.renderTarget,
    githubHost: session.githubWebHost,
    renderTarget: session.renderTarget,
    callerOrigin,
  };
}

function openArgsFromMessage(message: SwMessage) {
  return {
    owner: String(message.owner || ''),
    repo: String(message.repo || ''),
    number: Number(message.number),
    page: message.page ?? null,
    position: message.position ?? null,
    presentation: message.presentation ?? null,
    commitSha: message.commitSha ?? null,
    commitEndSha: message.commitEndSha ?? null,
    filePath: message.filePath ?? null,
    fileKey: message.fileKey ?? null,
    startLine: message.startLine ?? null,
    endLine: message.endLine ?? null,
    side: message.side ?? null,
    githubWebHost: String(message.githubWebHost || 'github.com'),
  };
}

function githubOriginForHost(host: string): string {
  const h = host === 'www.github.com' ? 'github.com' : host;
  return `https://${h}`;
}

async function queryGithubTabs(githubWebHost: string) {
  const extra = await registeredEnterpriseHosts().catch((): any[] => []);
  const patterns = githubTabUrlPatterns([githubWebHost, ...(extra || [])]);
  return new Promise<any[]>((resolve) => {
    try {
      chrome.tabs.query({ url: patterns }, (tabs: any) => {
        void chrome.runtime.lastError;
        resolve(Array.isArray(tabs) ? tabs : []);
      });
    } catch {
      resolve([]);
    }
  });
}

function tabMatchesHost(tab: any, githubWebHost: string): boolean {
  try {
    const host = new URL(String(tab.url || '')).hostname.toLowerCase();
    const want = githubWebHost.toLowerCase();
    if (want === 'github.com') {
      return host === 'github.com' || host === 'www.github.com';
    }
    return host === want;
  } catch {
    return false;
  }
}

function sendOpenPrToTab(tabId: number, args: ReturnType<typeof openArgsFromMessage>) {
  return new Promise<any>((resolve) => {
    try {
      chrome.tabs.sendMessage(
        tabId,
        { type: MSG.OPEN_PR, ...args, target: 'github-tab' },
        (res: any) => {
          const err = chrome.runtime.lastError;
          if (err) resolve({ ok: false, noReceiver: true, error: err.message });
          else resolve(res || { ok: false });
        }
      );
    } catch (err: any) {
      resolve({ ok: false, noReceiver: true, error: err?.message || String(err) });
    }
  });
}

async function retryOpenOnTab(
  tabId: number,
  args: ReturnType<typeof openArgsFromMessage>,
  ms = 8000
) {
  const start = Date.now();
  let last: any = { ok: false, noReceiver: true };
  while (Date.now() - start < ms) {
    last = await sendOpenPrToTab(tabId, args);
    if (last?.ok && last.ready === false) {
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }
    if (last?.noReceiver) {
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }
    if (last?.ok && last.ready && last.hostEnabled) return last;
    if (last?.hostEnabled === false) return last;
    if (last?.ok === false && last?.reason) return last;
    await new Promise((r) => setTimeout(r, 200));
  }
  return last;
}

function createGithubPrTab(args: ReturnType<typeof openArgsFromMessage>) {
  const url = `${githubOriginForHost(args.githubWebHost)}/${args.owner}/${args.repo}/pull/${args.number}`;
  return new Promise<any>((resolve, reject) => {
    chrome.tabs.create({ url }, (tab: any) => {
      const err = chrome.runtime.lastError;
      if (err || !tab) reject(new Error(err?.message || 'tabs.create failed'));
      else resolve(tab);
    });
  });
}

function shellUrl(args: ReturnType<typeof openArgsFromMessage>) {
  const u = new URL(chrome.runtime.getURL('src/shell/shell.html'));
  u.searchParams.set('owner', args.owner);
  u.searchParams.set('repo', args.repo);
  u.searchParams.set('number', String(args.number));
  u.searchParams.set('githubWebHost', args.githubWebHost);
  if (args.page) u.searchParams.set('page', String(args.page));
  if (args.filePath) u.searchParams.set('filePath', String(args.filePath));
  return u.toString();
}

function postToShell(tabId: number, payload: object): boolean {
  const port = shellPorts.get(tabId);
  if (!port) return false;
  try {
    port.postMessage(payload);
    return true;
  } catch {
    shellPorts.delete(tabId);
    return false;
  }
}

async function findShellTab(): Promise<any | null> {
  const url = chrome.runtime.getURL('src/shell/shell.html') + '*';
  return new Promise((resolve) => {
    try {
      chrome.tabs.query({ url }, (tabs: any) => {
        resolve(tabs?.[0] || null);
      });
    } catch {
      resolve(null);
    }
  });
}

async function openOnShell(
  args: ReturnType<typeof openArgsFromMessage>,
  callerOrigin: string
) {
  let tab = await findShellTab();
  if (tab?.id != null && postToShell(tab.id, { op: 'open', args })) {
    putLauncher({
      renderTarget: 'extension-shell',
      tabId: tab.id,
      owner: args.owner,
      repo: args.repo,
      number: args.number,
      githubWebHost: args.githubWebHost,
      callerOrigin,
      openedAt: Date.now(),
    });
    if (tab.id) chrome.tabs.update(tab.id, { active: true });
    return { ok: true, status: statusFromSession(sessionForOrigin(callerOrigin), callerOrigin) };
  }
  tab = await new Promise((resolve, reject) => {
    chrome.tabs.create({ url: shellUrl(args) }, (created: any) => {
      const err = chrome.runtime.lastError;
      if (err || !created) reject(new Error(err?.message || 'shell create failed'));
      else resolve(created);
    });
  });
  if (tab.id != null) {
    putLauncher({
      renderTarget: 'extension-shell',
      tabId: tab.id,
      owner: args.owner,
      repo: args.repo,
      number: args.number,
      githubWebHost: args.githubWebHost,
      callerOrigin,
      openedAt: Date.now(),
    });
  }
  return { ok: true, status: statusFromSession(sessionForOrigin(callerOrigin), callerOrigin) };
}

function senderIsLinear(sender?: any): boolean {
  try {
    const host = new URL(String(sender?.origin || sender?.url || '')).hostname;
    return host === 'linear.app' || host.endsWith('.linear.app');
  } catch {
    return false;
  }
}

function senderIsPartnerHostPage(sender?: any): boolean {
  return senderIsLinear(sender);
}

export async function handleOpenPr(message: SwMessage, sender?: any) {
  const callerOrigin = callerOriginFromSender(sender);
  if (rateLimit(callerOrigin || 'unknown', 'open')) {
    return { ok: false, error: 'rate-limited' };
  }
  const args = openArgsFromMessage(message);
  if (!args.owner || !args.repo || !Number.isFinite(args.number) || args.number <= 0) {
    return { ok: false, error: 'invalid-args' };
  }
  const target = String(message.target || 'auto');
  const source = String(message.source || '');

  if (source === 'local-host') {
    const tabId = sender?.tab?.id;
    if (tabId != null) {
      putLauncher({
        renderTarget: 'opener-embed',
        tabId,
        owner: args.owner,
        repo: args.repo,
        number: args.number,
        githubWebHost: args.githubWebHost,
        callerOrigin,
        openedAt: Date.now(),
      });
    }
    return { ok: true, status: statusFromSession(sessionForOrigin(callerOrigin), callerOrigin) };
  }

  if (target === 'opener-embed') {
    if (!senderIsPartnerHostPage(sender) || sender?.tab?.id == null) {
      return { ok: false, error: 'not-supported' };
    }
    const res = await retryOpenOnTab(sender.tab.id, args);
    if (res?.ok && res.ready && res.hostEnabled) {
      putLauncher({
        renderTarget: 'opener-embed',
        tabId: sender.tab.id,
        owner: args.owner,
        repo: args.repo,
        number: args.number,
        githubWebHost: args.githubWebHost,
        callerOrigin,
        openedAt: Date.now(),
      });
      return { ok: true, status: statusFromSession(sessionForOrigin(callerOrigin), callerOrigin) };
    }
    if (res?.ready === false || res?.noReceiver) {
      return { ok: false, error: 'bridge-timeout' };
    }
    return { ok: false, error: 'host-disabled' };
  }

  if (target === 'extension-shell') {
    try {
      return await openOnShell(args, callerOrigin);
    } catch {
      return { ok: false, error: 'no-host-tab' };
    }
  }

  const autoWantsOverlay =
    target === 'auto' && senderIsPartnerHostPage(sender) && sender?.tab?.id != null;
  if (autoWantsOverlay) {
    const res = await retryOpenOnTab(sender.tab.id, args);
    if (res?.ok && res.ready && res.hostEnabled) {
      putLauncher({
        renderTarget: 'opener-embed',
        tabId: sender.tab.id,
        owner: args.owner,
        repo: args.repo,
        number: args.number,
        githubWebHost: args.githubWebHost,
        callerOrigin,
        openedAt: Date.now(),
      });
      return { ok: true, status: statusFromSession(sessionForOrigin(callerOrigin), callerOrigin) };
    }
  }

  const tabs = (await queryGithubTabs(args.githubWebHost)).filter((t) =>
    tabMatchesHost(t, args.githubWebHost)
  );
  const existing = tabs.find((t) => t.id != null);
  if (existing?.id != null) {
    chrome.tabs.update(existing.id, { active: true });
    const res = await retryOpenOnTab(existing.id, args);
    if (res?.ok && res.ready && res.hostEnabled) {
      putLauncher({
        renderTarget: 'github-tab',
        tabId: existing.id,
        owner: args.owner,
        repo: args.repo,
        number: args.number,
        githubWebHost: args.githubWebHost,
        callerOrigin,
        openedAt: Date.now(),
      });
      return { ok: true, status: statusFromSession(sessionForOrigin(callerOrigin), callerOrigin) };
    }
    if (res?.hostEnabled === false) return { ok: false, error: 'host-disabled' };
    return { ok: false, error: 'host-timeout' };
  }

  if (target === 'auto') {
    try {
      return await openOnShell(args, callerOrigin);
    } catch {
      /* fall through to GH URL */
    }
  }

  try {
    const created = await createGithubPrTab(args);
    if (created.id == null) return { ok: false, error: 'no-host-tab' };
    const res = await retryOpenOnTab(created.id, args);
    if (res?.ok && res.ready && res.hostEnabled) {
      putLauncher({
        renderTarget: 'github-tab',
        tabId: created.id,
        owner: args.owner,
        repo: args.repo,
        number: args.number,
        githubWebHost: args.githubWebHost,
        callerOrigin,
        openedAt: Date.now(),
      });
      return { ok: true, status: statusFromSession(sessionForOrigin(callerOrigin), callerOrigin) };
    }
    if (res?.hostEnabled === false) return { ok: false, error: 'host-disabled' };
    return { ok: false, error: 'host-timeout' };
  } catch {
    return { ok: false, error: 'no-host-tab' };
  }
}

export async function handlePageApiMessage(
  message: SwMessage,
  sender?: any
): Promise<unknown> {
  switch (message.type) {
    case MSG.OPEN_PR:
      return handleOpenPr(message, sender);
    case MSG.CLOSE_PR: {
      const origin = callerOriginFromSender(sender);
      if (rateLimit(origin || 'unknown', 'close')) {
        return { ok: false, error: 'rate-limited' };
      }
      const session = sessionForOrigin(origin);
      if (!session) return { ok: true };
      if (session.renderTarget === 'extension-shell') {
        postToShell(session.tabId, { op: 'close' });
      } else {
        try {
          chrome.tabs.sendMessage(session.tabId, { type: MSG.CLOSE_PR });
        } catch {
          /* ignore */
        }
      }
      launchers.delete(launcherKey(origin));
      return { ok: true };
    }
    case MSG.PR_STATUS: {
      const origin = callerOriginFromSender(sender);
      if (rateLimit(origin || 'unknown', 'status')) {
        return { ok: false, error: 'rate-limited' };
      }
      return {
        ok: true,
        status: statusFromSession(sessionForOrigin(origin), origin),
      };
    }
    case MSG.CONNECTED_SITES_LIST: {
      const sites = await getConnectedSites();
      return { ok: true, ...sites, linearMatches: [...LINEAR_MATCHES] };
    }
    case MSG.CONNECTED_SITES_ADD: {
      const add = normalizeConnectedOrigins(message.origins);
      const req = await requestConnectedSiteOrigins(add);
      if (!req.granted) {
        return { ok: false, error: req.error || 'not-allowlisted', origins: add };
      }
      const cur = await getConnectedSites();
      const next = [...new Set([...cur.origins, ...add])];
      const saved = await setConnectedSites(next);
      await syncPartnerContentScripts(saved.origins);
      const tabId = sender?.tab?.id;
      const tabUrl = sender?.tab?.url || sender?.url;
      if (tabId != null && tabUrl) {
        await injectPartnerScriptsIntoTab(tabId, tabUrl);
      }
      return { ok: true, ...saved };
    }
    case MSG.CONNECTED_SITES_REMOVE: {
      const remove = new Set(normalizeConnectedOrigins(message.origins));
      const cur = await getConnectedSites();
      const next = cur.origins.filter((o) => !remove.has(o));
      const saved = await setConnectedSites(next);
      if (chrome.permissions?.remove && remove.size) {
        try {
          await new Promise((resolve) => {
            chrome.permissions.remove({ origins: [...remove] }, () => resolve(null));
          });
        } catch {
          /* ignore */
        }
      }
      await syncPartnerContentScripts(saved.origins);
      return { ok: true, ...saved };
    }
    default:
      return undefined;
  }
}

try {
  chrome.runtime.onConnect.addListener((port: any) => {
    if (port.name !== 'prp-shell') return;
    const tabId = port.sender?.tab?.id;
    if (tabId == null) return;
    shellPorts.set(tabId, port);
    port.onDisconnect.addListener(() => {
      if (shellPorts.get(tabId) === port) shellPorts.delete(tabId);
    });
  });
} catch {
  /* tests */
}


