/** OPEN_PR / CLOSE_PR / PR_STATUS + connected-sites RPC. */

import { MSG } from '../sw-messages';
import type { SwMessage } from '../sw-messages';
import { githubTabUrlPatterns, registeredEnterpriseHosts } from './sw-enterprise';
import {
  getConnectedSites,
  setConnectedSites,
  syncPartnerContentScripts,
  requestConnectedSiteOrigins,
  injectPartnerScriptsIntoMatchingTabs,
  normalizeConnectedOrigins,
  urlMatchesConnectedOrigins,
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

const LAUNCHERS_KEY = 'prpLaunchers';
const launchers = new Map<string, LauncherSession>();
let launchersHydrated: Promise<void> | null = null;
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

/**
 * Loopback pages may drive pr+ only after the user connected Localhost in the
 * popup (Connected sites) — `externally_connectable` alone is always on.
 */
export async function allowExternalSenderConnected(sender: {
  origin?: string;
  id?: string;
}): Promise<boolean> {
  if (!allowExternalSender(sender)) return false;
  const sites = await getConnectedSites();
  return urlMatchesConnectedOrigins(`${String(sender.origin)}/`, sites.origins);
}

/** `onMessageExternal` (loopback web) may only drive open / close / status. */
export const EXTERNAL_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  MSG.PING,
  MSG.OPEN_PR,
  MSG.CLOSE_PR,
  MSG.PR_STATUS,
]);

/** Per origin per minute. `status` is read-only and polled by integrators. */
const RATE_LIMIT_PER_MIN: Record<string, number> = { open: 10, close: 10, status: 120 };

function rateLimit(origin: string, op: string): boolean {
  const key = `${origin}|${op}`;
  const now = Date.now();
  const cur = rateBuckets.get(key);
  if (!cur || now >= cur.resetAt) {
    rateBuckets.set(key, { n: 1, resetAt: now + 60_000 });
    return false;
  }
  cur.n += 1;
  return cur.n > (RATE_LIMIT_PER_MIN[op] ?? 10);
}

function launcherKey(origin: string): string {
  return origin || '';
}

function sessionArea(): any {
  return (globalThis as any).chrome?.storage?.session || null;
}

/** MV3 SW is evicted after idle; registry lives in storage.session. */
function hydrateLaunchers(): Promise<void> {
  if (launchersHydrated) return launchersHydrated;
  launchersHydrated = new Promise<void>((resolve) => {
    const area = sessionArea();
    if (!area) return resolve();
    try {
      area.get([LAUNCHERS_KEY], (result: any) => {
        const saved = result?.[LAUNCHERS_KEY];
        if (saved && typeof saved === 'object') {
          for (const [k, v] of Object.entries(saved)) {
            if (!launchers.has(k)) launchers.set(k, v as LauncherSession);
          }
        }
        resolve();
      });
    } catch {
      resolve();
    }
  });
  return launchersHydrated;
}

function persistLaunchers(): Promise<void> {
  const area = sessionArea();
  if (!area) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      area.set({ [LAUNCHERS_KEY]: Object.fromEntries(launchers) }, () => resolve());
    } catch {
      resolve();
    }
  });
}

async function sessionForOrigin(origin: string): Promise<LauncherSession | null> {
  await hydrateLaunchers();
  return launchers.get(launcherKey(origin)) || null;
}

async function putLauncher(session: LauncherSession) {
  await hydrateLaunchers();
  launchers.set(launcherKey(session.callerOrigin), session);
  await persistLaunchers();
}

async function deleteLauncher(origin: string) {
  await hydrateLaunchers();
  if (launchers.delete(launcherKey(origin))) await persistLaunchers();
}

function queryTabPrStatus(tabId: number): Promise<any | null> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: MSG.PR_STATUS }, (res: any) => {
        void chrome.runtime.lastError;
        resolve(res && typeof res === 'object' ? res : null);
      });
    } catch {
      resolve(null);
    }
  });
}

function tabExists(tabId: number): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.get(tabId, (tab: any) => {
        void chrome.runtime.lastError;
        resolve(Boolean(tab));
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Registry entry only while the render target still shows that PR.
 * Esc / close button / navigation never reach the SW, so ask the tab.
 */
async function liveSessionForOrigin(origin: string): Promise<LauncherSession | null> {
  const session = await sessionForOrigin(origin);
  if (!session) return null;
  let alive = false;
  if (session.renderTarget === 'extension-shell') {
    alive = await tabExists(session.tabId);
  } else {
    const res = await queryTabPrStatus(session.tabId);
    alive = Boolean(
      res?.open &&
        String(res.owner || '').toLowerCase() === session.owner.toLowerCase() &&
        String(res.repo || '').toLowerCase() === session.repo.toLowerCase() &&
        Number(res.number) === session.number
    );
  }
  if (alive) return session;
  await deleteLauncher(origin);
  return null;
}

async function okStatus(callerOrigin: string) {
  return {
    ok: true,
    status: statusFromSession(await sessionForOrigin(callerOrigin), callerOrigin),
  };
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

/**
 * Partner iframe (shell.html framed by a Connected site). The shell reports
 * its direct embedder (location.ancestorOrigins[0]); it must be the tab's own
 * top-level Connected-site page, so other sites cannot frame pr+.
 */
export async function frameEmbedAllowed(message: SwMessage, sender?: any): Promise<boolean> {
  const shellUrl = chrome.runtime.getURL('src/shell/shell.html');
  if (!String(sender?.url || '').startsWith(shellUrl)) return false;
  if (!(Number(sender?.frameId) > 0)) return false;
  const origin = String(message.origin || '');
  const tabUrl = String(sender?.tab?.url || '');
  let tabOrigin = '';
  try {
    tabOrigin = new URL(tabUrl).origin;
  } catch {
    return false;
  }
  if (!origin || origin !== tabOrigin) return false;
  const sites = await getConnectedSites();
  return urlMatchesConnectedOrigins(tabUrl, sites.origins);
}

/** Only GitHub hosts (dotcom, *.ghe.com, registered GHES) get a PR tab. */
async function isKnownGithubWebHost(host: string): Promise<boolean> {
  const h = String(host || '').toLowerCase();
  if (h === 'github.com' || h === 'www.github.com' || h.endsWith('.ghe.com')) return true;
  const extra = await registeredEnterpriseHosts().catch((): any[] => []);
  return (extra || []).some((e: any) => String(e || '').toLowerCase() === h);
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

/**
 * shell.html is web-accessible (partner iframe), so any site could navigate a
 * tab to it with a PR of its choosing. Tab mode only auto-opens query args that
 * carry a token minted here (storage.session: survives SW restarts, bound to
 * the first tab that presents it so a reload still works).
 */
const SHELL_LAUNCH_KEY = 'prpShellLaunches';
const SHELL_LAUNCH_TTL_MS = 12 * 60 * 60 * 1000;

function readShellLaunches(): Promise<Record<string, { at: number; tabId: number | null }>> {
  const area = sessionArea();
  if (!area) return Promise.resolve({});
  return new Promise((resolve) => {
    try {
      area.get([SHELL_LAUNCH_KEY], (r: any) => resolve(r?.[SHELL_LAUNCH_KEY] || {}));
    } catch {
      resolve({});
    }
  });
}

function writeShellLaunches(v: Record<string, unknown>): Promise<void> {
  const area = sessionArea();
  if (!area) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      area.set({ [SHELL_LAUNCH_KEY]: v }, () => resolve());
    } catch {
      resolve();
    }
  });
}

async function mintShellLaunch(): Promise<string> {
  const token = (globalThis as any).crypto.randomUUID();
  const now = Date.now();
  const all = await readShellLaunches();
  for (const [k, v] of Object.entries(all)) if (now - v.at > SHELL_LAUNCH_TTL_MS) delete all[k];
  all[token] = { at: now, tabId: null };
  await writeShellLaunches(all);
  return token;
}

export async function shellLaunchAllowed(message: SwMessage, sender?: any): Promise<boolean> {
  const shell = chrome.runtime.getURL('src/shell/shell.html');
  if (!String(sender?.url || '').startsWith(shell) || sender?.frameId !== 0) return false;
  const tabId = sender?.tab?.id;
  const token = String(message.launch || '');
  if (!token || tabId == null) return false;
  const all = await readShellLaunches();
  const row = all[token];
  if (!row || Date.now() - row.at > SHELL_LAUNCH_TTL_MS) return false;
  if (row.tabId != null) return row.tabId === tabId;
  row.tabId = tabId;
  await writeShellLaunches(all);
  return true;
}

async function shellUrl(args: ReturnType<typeof openArgsFromMessage>) {
  const u = new URL(chrome.runtime.getURL('src/shell/shell.html'));
  u.searchParams.set('owner', args.owner);
  u.searchParams.set('repo', args.repo);
  u.searchParams.set('number', String(args.number));
  u.searchParams.set('githubWebHost', args.githubWebHost);
  for (const k of [
    'page',
    'position',
    'commitSha',
    'commitEndSha',
    'filePath',
    'fileKey',
    'startLine',
    'endLine',
    'side',
  ] as const) {
    const v = (args as any)[k];
    if (v != null && v !== '') u.searchParams.set(k, String(v));
  }
  u.searchParams.set('launch', await mintShellLaunch());
  return u.toString();
}

/** Shell tabs listen for SHELL_CMD addressed to their own tab id. */
function postToShell(tabId: number, payload: object): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: MSG.SHELL_CMD, tabId, ...payload }, (res: any) => {
        void chrome.runtime.lastError;
        resolve(Boolean(res?.ok));
      });
    } catch {
      resolve(false);
    }
  });
}

async function findShellTab(): Promise<any | null> {
  // chrome-extension:// is not a match-pattern scheme, so tabs.query({ url })
  // never matches our own pages — filter by prefix instead.
  const prefix = chrome.runtime.getURL('src/shell/shell.html');
  return new Promise((resolve) => {
    try {
      chrome.tabs.query({}, (tabs: any) => {
        resolve(
          (tabs || []).find((t: any) => String(t?.url || '').startsWith(prefix)) || null
        );
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
  if (tab?.id != null && (await postToShell(tab.id, { op: 'open', args }))) {
    await putLauncher({
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
    return okStatus(callerOrigin);
  }
  const url = await shellUrl(args);
  tab = await new Promise((resolve, reject) => {
    chrome.tabs.create({ url }, (created: any) => {
      const err = chrome.runtime.lastError;
      if (err || !created) reject(new Error(err?.message || 'shell create failed'));
      else resolve(created);
    });
  });
  if (tab.id != null) {
    await putLauncher({
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
  return okStatus(callerOrigin);
}

async function senderIsPartnerHostPage(sender?: any): Promise<boolean> {
  const url = String(sender?.tab?.url || sender?.url || '');
  if (!url) return false;
  const sites = await getConnectedSites();
  return urlMatchesConnectedOrigins(url, sites.origins);
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
      await putLauncher({
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
    return okStatus(callerOrigin);
  }

  if (target === 'opener-embed') {
    if (!(await senderIsPartnerHostPage(sender)) || sender?.tab?.id == null) {
      return { ok: false, error: 'not-supported' };
    }
    const res = await retryOpenOnTab(sender.tab.id, args);
    if (res?.ok && res.ready && res.hostEnabled) {
      await putLauncher({
        renderTarget: 'opener-embed',
        tabId: sender.tab.id,
        owner: args.owner,
        repo: args.repo,
        number: args.number,
        githubWebHost: args.githubWebHost,
        callerOrigin,
        openedAt: Date.now(),
      });
      return okStatus(callerOrigin);
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
    target === 'auto' &&
    (await senderIsPartnerHostPage(sender)) &&
    sender?.tab?.id != null;
  if (autoWantsOverlay) {
    const res = await retryOpenOnTab(sender.tab.id, args);
    if (res?.ok && res.ready && res.hostEnabled) {
      await putLauncher({
        renderTarget: 'opener-embed',
        tabId: sender.tab.id,
        owner: args.owner,
        repo: args.repo,
        number: args.number,
        githubWebHost: args.githubWebHost,
        callerOrigin,
        openedAt: Date.now(),
      });
      return okStatus(callerOrigin);
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
      await putLauncher({
        renderTarget: 'github-tab',
        tabId: existing.id,
        owner: args.owner,
        repo: args.repo,
        number: args.number,
        githubWebHost: args.githubWebHost,
        callerOrigin,
        openedAt: Date.now(),
      });
      return okStatus(callerOrigin);
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

  if (!(await isKnownGithubWebHost(args.githubWebHost))) {
    return { ok: false, error: 'invalid-args' };
  }
  try {
    const created = await createGithubPrTab(args);
    if (created.id == null) return { ok: false, error: 'no-host-tab' };
    const res = await retryOpenOnTab(created.id, args);
    if (res?.ok && res.ready && res.hostEnabled) {
      await putLauncher({
        renderTarget: 'github-tab',
        tabId: created.id,
        owner: args.owner,
        repo: args.repo,
        number: args.number,
        githubWebHost: args.githubWebHost,
        callerOrigin,
        openedAt: Date.now(),
      });
      return okStatus(callerOrigin);
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
      const session = await sessionForOrigin(origin);
      if (!session) return { ok: true };
      if (session.renderTarget === 'extension-shell') {
        await postToShell(session.tabId, { op: 'close' });
      } else {
        try {
          chrome.tabs.sendMessage(session.tabId, { type: MSG.CLOSE_PR });
        } catch {
          /* ignore */
        }
      }
      await deleteLauncher(origin);
      return { ok: true };
    }
    case MSG.PR_STATUS: {
      const origin = callerOriginFromSender(sender);
      if (rateLimit(origin || 'unknown', 'status')) {
        return { ok: false, error: 'rate-limited' };
      }
      return {
        ok: true,
        status: statusFromSession(await liveSessionForOrigin(origin), origin),
      };
    }
    case MSG.FRAME_ALLOWED:
      return { ok: true, allowed: await frameEmbedAllowed(message, sender) };
    case MSG.SHELL_LAUNCH_CHECK:
      return { ok: true, allowed: await shellLaunchAllowed(message, sender) };
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
      await injectPartnerScriptsIntoMatchingTabs();
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
  chrome.tabs.onRemoved.addListener((tabId: number) => {
    void hydrateLaunchers().then(() => {
      let changed = false;
      for (const [k, v] of launchers) {
        if (v.tabId === tabId) {
          launchers.delete(k);
          changed = true;
        }
      }
      if (changed) void persistLaunchers();
    });
  });
} catch {
  /* tests */
}



