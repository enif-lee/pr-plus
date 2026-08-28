import { createTranslator, formatMessage } from './modal/lib/i18n';
import { parseCustomConnectedOrigins } from './background/sw-connected-sites';
import {
  normalizeUiLanguagePref,
  resolveEffectiveLocale,
  type AppLocale,
} from './modal/lib/locale-resolve';

const tokenInput = document.getElementById('token');
const saveBtn = document.getElementById('save');
const clearBtn = document.getElementById('clear');
const statusEl = document.getElementById('status');
const tokenSavedEl = document.getElementById('token-saved');
const tokenMaskEl = document.getElementById('token-mask');
const prefPluginEnabled = document.getElementById(
  'pref-plugin-enabled'
) as HTMLInputElement | null;
const prefAutoOpenEmbed = document.getElementById('pref-auto-open-embed');
const prefListOpenMode = document.getElementById(
  'pref-list-open-mode'
) as HTMLSelectElement | null;
const prefReverseComments = document.getElementById('pref-reverse-comments');
const prefSingleFileMode = document.getElementById('pref-single-file-mode');
const prefAutoExpandFileNav = document.getElementById(
  'pref-auto-expand-file-nav'
);
const prefTreeView = document.getElementById('pref-tree-view');
const prefShortcutMonitorSize = document.getElementById(
  'pref-shortcut-monitor-size'
) as HTMLSelectElement | null;
const prefUiLanguage = document.getElementById(
  'pref-ui-language'
) as HTMLSelectElement | null;
const rateLimitBarsEl = document.getElementById('rate-limit-bars');
const rateLimitStatusEl = document.getElementById('rate-limit-status');
const restartOnboardingBtn = document.getElementById('restart-onboarding');
const clearIdbBtn = document.getElementById('clear-idb');
const enterpriseHostInput = document.getElementById('enterprise-host');
const enterpriseTokenInput = document.getElementById('enterprise-token');
const addHostAccountBtn = document.getElementById('add-host-account');
const enterpriseStatusEl = document.getElementById('enterprise-status');
const endpointPreviewEl = document.getElementById('endpoint-preview');
const hostAccountsListEl = document.getElementById('host-accounts-list');
const hostAccountsEmptyEl = document.getElementById('host-accounts-empty');
const activeGithubHostEl = document.getElementById(
  'active-github-host'
) as HTMLSelectElement | null;
const connectLinearBtn = document.getElementById('connect-linear');
const connectJiraBtn = document.getElementById('connect-jira');
const connectLocalhostBtn = document.getElementById('connect-localhost');
const connectCustomBtn = document.getElementById('connect-custom');
const connectCustomHostEl = document.getElementById(
  'connect-custom-host'
) as HTMLInputElement | null;
const connectedSitesListEl = document.getElementById('connected-sites-list');

const MAX_HOST_ACCOUNTS = 3;

const DEFAULT_PREFS = {
  pluginEnabled: true,
  reverseComments: true,
  autoOpenEmbed: true,
  listOpenMode: 'modal',
  singleFileMode: false,
  autoExpandOnFileNav: false,
  treeView: true,
  shortcutMonitorSize: 'small',
  uiLanguage: 'auto',
  onboardingCompleted: false,
  timelineVisibility: {
    events: true,
    participants: true,
    comments: true,
    'review-threads': true,
  },
};

function normalizeListOpenMode(raw: unknown): 'modal' | 'page' {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (
    v === 'page' ||
    v === 'pr-page' ||
    v === 'pr_page' ||
    v === 'navigate' ||
    v === 'native' ||
    v === 'github'
  ) {
    return 'page';
  }
  return 'modal';
}

const prefTlAll = document.getElementById(
  'pref-tl-all'
) as HTMLInputElement | null;
const prefTlEvents = document.getElementById(
  'pref-tl-events'
) as HTMLInputElement | null;
const prefTlParticipants = document.getElementById(
  'pref-tl-participants'
) as HTMLInputElement | null;
const prefTlComments = document.getElementById(
  'pref-tl-comments'
) as HTMLInputElement | null;
const prefTlReviewThreads = document.getElementById(
  'pref-tl-review-threads'
) as HTMLInputElement | null;

/** Category keys in popup order (not All). */
const PREF_TL_CATEGORY_KEYS = [
  'events',
  'participants',
  'comments',
  'review-threads',
] as const;

/** Category checkboxes only (not All). */
const PREF_TL_CATEGORY_INPUTS = () =>
  [
    prefTlEvents,
    prefTlParticipants,
    prefTlComments,
    prefTlReviewThreads,
  ].filter(Boolean) as HTMLInputElement[];

function normalizeTimelineVisibilityPopup(raw: any) {
  const src = raw && typeof raw === 'object' ? raw : {};
  // Prefer new 4-key model; migrate legacy when needed.
  if (
    typeof src.events === 'boolean' ||
    typeof src.participants === 'boolean' ||
    typeof src['review-threads'] === 'boolean'
  ) {
    return {
      events: src.events !== false,
      participants: src.participants !== false,
      comments: src.comments !== false,
      'review-threads': src['review-threads'] !== false,
    };
  }
  const events =
    src.labels !== false ||
    src.title !== false ||
    src.milestone !== false ||
    src.referenced !== false;
  const participants =
    src.assignees !== false || src.reviewers !== false;
  return {
    events,
    participants,
    comments: src.comments !== false,
    'review-threads': true,
  };
}

/** Read category map from live checkbox DOM (authoritative for save). */
function readTimelineVisibilityFromDom(): Record<
  (typeof PREF_TL_CATEGORY_KEYS)[number],
  boolean
> {
  const byKey: Record<string, HTMLInputElement | null> = {
    events: prefTlEvents,
    participants: prefTlParticipants,
    comments: prefTlComments,
    'review-threads': prefTlReviewThreads,
  };
  const out: any = {};
  for (const k of PREF_TL_CATEGORY_KEYS) {
    const el = byKey[k];
    // Missing DOM → true (legacy); present → exact checked state (incl. false)
    out[k] = el ? Boolean(el.checked) : true;
  }
  return out;
}

function isTimelineVisibilityAllOnPopup(tl: {
  events: boolean;
  participants: boolean;
  comments: boolean;
  'review-threads': boolean;
}): boolean {
  return (
    tl.events &&
    tl.participants &&
    tl.comments &&
    tl['review-threads']
  );
}

/** Sync All checkbox from current category inputs (no save). */
function syncTimelineAllCheckboxFromCategories() {
  if (!prefTlAll) return;
  const cats = PREF_TL_CATEGORY_INPUTS();
  prefTlAll.checked =
    cats.length > 0 && cats.every((el) => Boolean(el.checked));
  prefTlAll.indeterminate = false;
}

function normalizeShortcutMonitorSize(raw: unknown): string {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (v === 'none' || v === 'off' || v === 'hidden') return 'none';
  if (v === 'medium' || v === 'md' || v === '2x') return 'medium';
  if (v === 'large' || v === 'lg' || v === '3x') return 'large';
  return 'small';
}

function normalizeUiLanguage(raw: unknown): string {
  return normalizeUiLanguagePref(
    raw == null ? undefined : String(raw)
  );
}

/** Active UI locale for the popup (after pref + browser detect). */
let popupLocale: AppLocale = 'en';
let t = createTranslator(popupLocale);

/**
 * Popup has no GitHub document: `auto` uses browser language, then English.
 * Custom pref always wins.
 */
function resolvePopupLocale(preferred: string | null | undefined): AppLocale {
  let navigatorLanguage: string | null = null;
  try {
    navigatorLanguage =
      (typeof navigator !== 'undefined' &&
        (navigator.language || (navigator as any).userLanguage)) ||
      null;
  } catch {
    navigatorLanguage = null;
  }
  // chrome.i18n UI language as extra signal when available
  try {
    const chromeApi = (globalThis as any).chrome;
    const ui =
      typeof chromeApi?.i18n?.getUILanguage === 'function'
        ? chromeApi.i18n.getUILanguage()
        : null;
    if (ui && !navigatorLanguage) navigatorLanguage = ui;
  } catch {
    /* ignore */
  }
  return resolveEffectiveLocale(preferred, { navigatorLanguage });
}

/**
 * Apply catalog strings to all [data-i18n*] nodes.
 * Chrome resets <select> to the first option when option label text is rewritten —
 * always restore language / monitor select values after applying labels.
 */
function applyPopupI18n(preferred: string | null | undefined) {
  const pref = normalizeUiLanguage(
    preferred != null && preferred !== ''
      ? preferred
      : prefUiLanguage?.value
  );
  // Snapshot before option textContent updates (can clobber selectedIndex → "auto")
  const prevLang =
    preferred != null && String(preferred).trim() !== ''
      ? normalizeUiLanguage(preferred)
      : normalizeUiLanguage(prefUiLanguage?.value);
  const prevMonitor = prefShortcutMonitorSize?.value;

  popupLocale = resolvePopupLocale(pref);
  t = createTranslator(popupLocale);
  try {
    document.documentElement.lang =
      popupLocale === 'zh_CN' ? 'zh-CN' : popupLocale;
  } catch {
    /* ignore */
  }
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    // Prefer option.label / text for <option>; value attribute must stay intact
    if (el instanceof HTMLOptionElement) {
      el.text = formatMessage(key, popupLocale);
    } else {
      el.textContent = formatMessage(key, popupLocale);
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (!key || !('placeholder' in el)) return;
    (el as HTMLInputElement).placeholder = formatMessage(key, popupLocale);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    if (!key) return;
    el.setAttribute('aria-label', formatMessage(key, popupLocale));
  });
  try {
    document.title = formatMessage('popup_title', popupLocale);
  } catch {
    /* ignore */
  }

  // Restore selects: value must be the *preference* (auto|en|ko|ja|zh_CN),
  // not the resolved display locale when pref is auto.
  if (prefUiLanguage) {
    prefUiLanguage.value = prevLang;
  }
  if (prefShortcutMonitorSize && prevMonitor) {
    prefShortcutMonitorSize.value = normalizeShortcutMonitorSize(prevMonitor);
  }
}

/** @type {{ host: string, mask: string }[]} */
let hostAccountsState: any[] = [];

function setStatus(text: any, isError: any = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('err', isError);
}

function renderTokenStatus(status: any) {
  if (status?.configured) {
    tokenSavedEl.hidden = false;
    tokenMaskEl.textContent = status.mask;
  // @ts-expect-error classic content-script dynamic shapes
    tokenInput.placeholder = t('popup_placeholder_token_replace');
  } else {
    tokenSavedEl.hidden = true;
    tokenMaskEl.textContent = '';
  // @ts-expect-error classic content-script dynamic shapes
    tokenInput.placeholder = t('popup_placeholder_token');
  }
}

function renderPrefs(prefs: any) {
  const p = prefs || DEFAULT_PREFS;
  if (prefPluginEnabled) {
    prefPluginEnabled.checked = p.pluginEnabled !== false;
  }
  // @ts-expect-error classic content-script dynamic shapes
  if (prefAutoOpenEmbed) prefAutoOpenEmbed.checked = p.autoOpenEmbed !== false;
  if (prefListOpenMode) {
    prefListOpenMode.value = normalizeListOpenMode(p.listOpenMode);
  }
  (prefReverseComments as HTMLInputElement).checked =
    p.reverseComments !== false;
  if (prefSingleFileMode) {
    (prefSingleFileMode as HTMLInputElement).checked =
      p.singleFileMode === true;
  }
  if (prefAutoExpandFileNav) {
    (prefAutoExpandFileNav as HTMLInputElement).checked =
      p.autoExpandOnFileNav === true;
  }
  if (prefTreeView) {
    (prefTreeView as HTMLInputElement).checked = p.treeView !== false;
  }
  if (prefShortcutMonitorSize) {
    prefShortcutMonitorSize.value = normalizeShortcutMonitorSize(
      p.shortcutMonitorSize
    );
  }
  if (prefUiLanguage) {
    prefUiLanguage.value = normalizeUiLanguage(p.uiLanguage);
  }
  const tl = normalizeTimelineVisibilityPopup(p.timelineVisibility);
  if (prefTlEvents) prefTlEvents.checked = tl.events;
  if (prefTlParticipants) prefTlParticipants.checked = tl.participants;
  if (prefTlComments) prefTlComments.checked = tl.comments;
  if (prefTlReviewThreads) prefTlReviewThreads.checked = tl['review-threads'];
  if (prefTlAll) {
    prefTlAll.checked = isTimelineVisibilityAllOnPopup(tl);
    prefTlAll.indeterminate = false;
  }
}

function rateLimitBarPercent(snap: any): number {
  if (!snap) return 0;
  const limit = Number(snap.limit);
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  const remaining = Number(snap.remaining);
  if (Number.isFinite(remaining)) {
    return Math.max(0, Math.min(100, Math.round((remaining / limit) * 100)));
  }
  const used = Number(snap.used);
  if (Number.isFinite(used)) {
    return Math.max(
      0,
      Math.min(100, Math.round(((limit - used) / limit) * 100))
    );
  }
  return 0;
}

function formatReset(snap: any, nowMs = Date.now()): string {
  if (!snap?.reset) return '—';
  const ms = Number(snap.reset) * 1000;
  if (!Number.isFinite(ms)) return '—';
  if (ms <= nowMs) return 'now';
  try {
    return new Date(ms).toLocaleTimeString();
  } catch {
    return String(snap.reset);
  }
}

function renderRateLimitState(state: any, pluginEnabled = true) {
  const snaps = state?.snapshots || {};
  const disabled = state?.disabledUntil || {};
  const now = Date.now();
  const resources = ['core', 'graphql', 'search'] as const;
  let any = false;
  let blocked: string[] = [];
  for (const r of resources) {
    const row = rateLimitBarsEl?.querySelector?.(
      `[data-rl="${r}"]`
    ) as HTMLElement | null;
    if (!row) continue;
    const snap = snaps[r] || null;
    const meta = row.querySelector('[data-rl-meta]') as HTMLElement | null;
    const fill = row.querySelector('[data-rl-fill]') as HTMLElement | null;
    const bar = row.querySelector('[data-rl-bar]') as HTMLElement | null;
    if (snap) any = true;
    const pct = rateLimitBarPercent(snap);
    const rem = snap?.remaining != null ? snap.remaining : '—';
    const lim = snap?.limit != null ? snap.limit : '—';
    const used = snap?.used != null ? snap.used : '—';
    if (meta) {
      meta.textContent = t('popup_rl_meta', [
        String(rem),
        String(lim),
        String(used),
        formatReset(snap, now),
      ]);
    }
    if (fill) {
      fill.style.width = `${pct}%`;
      fill.classList.toggle('is-warn', pct > 0 && pct <= 25);
      fill.classList.toggle('is-crit', pct === 0 && snap != null);
    }
    if (bar) {
      bar.setAttribute('aria-valuenow', String(pct));
    }
    const until = Number(disabled[r]) || 0;
    if (until > now) blocked.push(r);
  }
  if (rateLimitStatusEl) {
    rateLimitStatusEl.classList.toggle('is-off', !pluginEnabled || blocked.length > 0);
    if (pluginEnabled === false) {
      rateLimitStatusEl.textContent =
        blocked.length > 0
          ? t('popup_rate_limit_blocked', [blocked.join(', ')])
          : t('popup_rate_limit_disabled');
    } else if (blocked.length > 0) {
      rateLimitStatusEl.textContent = t('popup_rate_limit_blocked', [
        blocked.join(', '),
      ]);
    } else if (!any) {
      rateLimitStatusEl.textContent = t('popup_rate_limit_empty');
    } else {
      rateLimitStatusEl.textContent = t('popup_rate_limit_healthy');
    }
  }
}

function normalizeHostInput(raw: any) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
}

function updateEndpointPreview(hostRaw: any) {
  if (!endpointPreviewEl) return;
  const webHost = normalizeHostInput(hostRaw) || 'github.com';
  let rest: any;
  let gql: any;
  if (webHost === 'github.com' || webHost === 'www.github.com') {
    rest = 'https://api.github.com';
    gql = 'https://api.github.com/graphql';
  } else if (webHost.endsWith('.ghe.com') || webHost === 'ghe.com') {
    const apiHost =
      webHost === 'ghe.com' || webHost.startsWith('api.')
        ? webHost === 'ghe.com'
          ? 'api.ghe.com'
          : webHost
        : `api.${webHost}`;
    rest = `https://${apiHost}`;
    gql = `https://${apiHost}/graphql`;
  } else {
    rest = `https://${webHost}/api/v3`;
    gql = `https://${webHost}/api/graphql`;
  }
  endpointPreviewEl.textContent = `Preview for ${webHost}: REST ${rest} · GraphQL ${gql}`;
}

function setEnterpriseStatus(text: any, isError: any = false) {
  if (!enterpriseStatusEl) return;
  enterpriseStatusEl.textContent = text || '';
  enterpriseStatusEl.style.color = isError ? '#cf222e' : '#656d76';
}

function renderHostAccounts(accounts: any) {
  hostAccountsState = Array.isArray(accounts) ? accounts.slice() : [];
  if (!hostAccountsListEl) return;
  hostAccountsListEl.innerHTML = '';
  for (const row of hostAccountsState) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'host-name';
    name.textContent = row.host;
    name.title = row.host;
    const mask = document.createElement('span');
    mask.className = 'host-mask';
    mask.textContent = row.mask || '••••';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = t('popup_btn_remove');
    removeBtn.dataset.host = row.host;
    removeBtn.addEventListener('click', () => void removeHostAccount(row.host));
    li.appendChild(name);
    li.appendChild(mask);
    li.appendChild(removeBtn);
    hostAccountsListEl.appendChild(li);
  }
  if (hostAccountsEmptyEl) {
    hostAccountsEmptyEl.hidden = hostAccountsState.length > 0;
  }
  updateAddHostButtonState();
  const previewHost =
  // @ts-expect-error classic content-script dynamic shapes
    normalizeHostInput(enterpriseHostInput?.value) ||
    hostAccountsState[0]?.host ||
    'github.com';
  updateEndpointPreview(previewHost);
  fillActiveHostSelect(hostAccountsState);
}

function fillActiveHostSelect(accounts: any[], selected?: string) {
  if (!activeGithubHostEl) return;
  const current = selected || activeGithubHostEl.value || 'github.com';
  const hosts = [
    'github.com',
    ...((Array.isArray(accounts) ? accounts : []).map((a: any) => a.host).filter(Boolean)),
  ];
  const uniq = [...new Set(hosts)];
  activeGithubHostEl.innerHTML = '';
  for (const h of uniq) {
    const opt = document.createElement('option');
    opt.value = h;
    opt.textContent = h;
    activeGithubHostEl.appendChild(opt);
  }
  activeGithubHostEl.value = uniq.includes(current) ? current : 'github.com';
}

function renderConnectedSites(origins: string[]) {
  if (!connectedSitesListEl) return;
  connectedSitesListEl.innerHTML = '';
  for (const origin of origins || []) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'host-name';
    name.textContent = origin;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = t('popup_btn_remove');
    removeBtn.addEventListener('click', () => {
      void send({ type: 'PR_TREE_CONNECTED_SITES_REMOVE', origins: [origin] }).then(
        (res) => {
          if (res?.ok) renderConnectedSites(res.origins || []);
        }
      );
    });
    li.appendChild(name);
    li.appendChild(removeBtn);
    connectedSitesListEl.appendChild(li);
  }
}

/**
 * At max hosts, still allow Add when the typed host already exists (PAT rotate).
 * Pure registerHostAccount allows update-in-place; the button must not block that.
 */
function updateAddHostButtonState() {
  if (!addHostAccountBtn) return;
  // @ts-expect-error classic content-script dynamic shapes
  const inputHost = normalizeHostInput(enterpriseHostInput?.value);
  const isUpdate = Boolean(
    inputHost && hostAccountsState.some((a) => a.host === inputHost)
  );
  const atMax = hostAccountsState.length >= MAX_HOST_ACCOUNTS;
  // Disabled only when full AND adding a brand-new host
  // @ts-expect-error classic content-script dynamic shapes
  addHostAccountBtn.disabled = atMax && !isUpdate;
  addHostAccountBtn.textContent = isUpdate
    ? t('popup_btn_update_host')
    : t('popup_btn_add_host');
  if (atMax && !isUpdate && !inputHost) {
    setEnterpriseStatus(
      `Maximum ${MAX_HOST_ACCOUNTS} hosts — remove one to add another, or type an existing host to rotate its PAT`
    );
  }
}

function sleep(ms: any) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientChannelError(msg: any) {
  return /message channel closed|Receiving end does not exist|asynchronous response|Could not establish connection|Extension context invalidated/i.test(
    String(msg || '')
  );
}

/** Promise-based messaging with retries while the SW wakes from idle. */
async function send(message: any, { retries = 4 } = {}) {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await chrome.runtime.sendMessage(message);
      return response;
    } catch (e) {
      const msg = e?.message || String(e);
      lastErr = new Error(msg);
      if (attempt < retries && isTransientChannelError(msg)) {
        try {
          await chrome.runtime.sendMessage({ type: 'PR_TREE_PING' });
        } catch {
          /* ignore */
        }
        await sleep(80 + attempt * 160);
        continue;
      }
      if (/Receiving end does not exist|Could not establish connection|Extension context invalidated/i.test(msg)) {
        throw new Error(
          'Background worker offline. Open chrome://extensions → pr+ → Reload, then reopen this popup.'
        );
      }
      throw lastErr;
    }
  }
  throw lastErr || new Error('Failed to message background worker');
}

/** Read extensionPrefs from chrome.storage.local (not SW — SW may drop new keys). */
function readLocalExtensionPrefs(): Promise<any> {
  return new Promise((resolve) => {
    try {
      const chromeApi = (globalThis as any).chrome;
      if (!chromeApi?.storage?.local?.get) {
        resolve({ ...DEFAULT_PREFS });
        return;
      }
      chromeApi.storage.local.get(['extensionPrefs'], (cur: any) => {
        const raw =
          cur?.extensionPrefs && typeof cur.extensionPrefs === 'object'
            ? cur.extensionPrefs
            : {};
        resolve({
          ...DEFAULT_PREFS,
          ...raw,
          pluginEnabled: raw.pluginEnabled !== false,
          reverseComments: raw.reverseComments !== false,
          autoOpenEmbed: raw.autoOpenEmbed !== false,
          listOpenMode: normalizeListOpenMode(raw.listOpenMode),
          singleFileMode: raw.singleFileMode === true,
          autoExpandOnFileNav: raw.autoExpandOnFileNav === true,
          treeView: raw.treeView !== false,
          shortcutMonitorSize: normalizeShortcutMonitorSize(
            raw.shortcutMonitorSize
          ),
          uiLanguage: normalizeUiLanguage(raw.uiLanguage),
          timelineVisibility: normalizeTimelineVisibilityPopup(
            raw.timelineVisibility
          ),
          onboardingCompleted: raw.onboardingCompleted === true,
        });
      });
    } catch {
      resolve({ ...DEFAULT_PREFS });
    }
  });
}

/** Persist full prefs object; never go through SW normalize (can strip keys). */
function writeLocalExtensionPrefs(prefs: any): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const chromeApi = (globalThis as any).chrome;
      if (!chromeApi?.storage?.local?.set) {
        reject(new Error('chrome.storage.local unavailable'));
        return;
      }
      chromeApi.storage.local.get(['extensionPrefs'], (cur: any) => {
        const prev =
          cur?.extensionPrefs && typeof cur.extensionPrefs === 'object'
            ? cur.extensionPrefs
            : {};
        const merged = {
          ...prev,
          ...prefs,
          // Always pin language last so it cannot be clobbered by prev merge
          uiLanguage: normalizeUiLanguage(prefs?.uiLanguage),
        };
        chromeApi.storage.local.set({ extensionPrefs: merged }, () => {
          const err = chromeApi.runtime?.lastError;
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function load() {
  try {
    // Prefs: storage.local is SoT (SW PREFS_GET can omit uiLanguage if SW stale)
    const [status, localPrefs, hostsRes, activeHost, sitesRes] = await Promise.all([
      send({ type: 'PR_TREE_TOKEN_STATUS' }),
      readLocalExtensionPrefs(),
      send({ type: 'PR_TREE_HOST_ACCOUNTS_LIST' }),
      send({ type: 'PR_TREE_ACTIVE_HOST_GET' }),
      send({ type: 'PR_TREE_CONNECTED_SITES_LIST' }),
    ]);
    if (!status?.ok && status?.error) {
      throw new Error(status.error);
    }
    const prefs = localPrefs || DEFAULT_PREFS;
    // Settings chrome first so titles match saved language on open
    applyPopupI18n(prefs.uiLanguage);
    renderTokenStatus(status);
    renderPrefs(prefs);
    renderRateLimitState(null, prefs?.pluginEnabled !== false);
    const accounts = hostsRes?.accounts || [];
    renderHostAccounts(accounts);
    fillActiveHostSelect(accounts, activeHost?.host);
    renderConnectedSites(sitesRes?.origins || []);
    if (!status?.configured && accounts.length === 0) {
      setStatus(t('popup_status_no_token'));
    }
    // Fresh rate-limit snapshot (auto-refresh from GET /rate_limit when empty)
    try {
      const rl = await send({
        type: 'PR_TREE_RATE_LIMIT_GET',
        refresh: true,
      });
      if (rl?.ok) {
        renderRateLimitState(rl.state, rl.pluginEnabled !== false);
      }
    } catch {
      /* ignore */
    }
  } catch (err) {
    applyPopupI18n(DEFAULT_PREFS.uiLanguage);
    setStatus(err.message || 'Failed to load status', true);
    renderPrefs(DEFAULT_PREFS);
    renderHostAccounts([]);
  }
}

async function savePrefs() {
  try {
    // Read form values *before* any i18n DOM rewrites
    const uiLanguage = normalizeUiLanguage(prefUiLanguage?.value);
    const shortcutMonitorSize = normalizeShortcutMonitorSize(
      prefShortcutMonitorSize?.value
    );
    const prefs = {
      pluginEnabled: prefPluginEnabled
        ? Boolean(prefPluginEnabled.checked)
        : true,
  // @ts-expect-error classic content-script dynamic shapes
      autoOpenEmbed: Boolean(prefAutoOpenEmbed?.checked),
      listOpenMode: normalizeListOpenMode(prefListOpenMode?.value),
  // @ts-expect-error classic content-script dynamic shapes
      reverseComments: Boolean(prefReverseComments.checked),
  // @ts-expect-error classic content-script dynamic shapes
      singleFileMode: Boolean(prefSingleFileMode?.checked),
  // @ts-expect-error classic content-script dynamic shapes
      autoExpandOnFileNav: Boolean(prefAutoExpandFileNav?.checked),
  // @ts-expect-error classic content-script dynamic shapes
      treeView: Boolean(prefTreeView?.checked),
      shortcutMonitorSize,
      uiLanguage,
      timelineVisibility: readTimelineVisibilityFromDom(),
    };
    // Storage.local is authoritative. Do NOT call PREFS_SET afterward —
    // a stale service worker re-normalizes and strips uiLanguage, which
    // made refresh always fall back to auto.
    await writeLocalExtensionPrefs(prefs);
    applyPopupI18n(uiLanguage);
    renderPrefs(prefs);
    if (hostAccountsState?.length) renderHostAccounts(hostAccountsState);
    setStatus(t('popup_status_options_saved'));
  } catch (err) {
    setStatus(err.message || 'Failed to save options', true);
  }
}

async function removeHostAccount(host: any) {
  setEnterpriseStatus('Removing…');
  try {
    const res = await send({ type: 'PR_TREE_HOST_ACCOUNT_REMOVE', host });
    if (!res?.ok && res?.error) throw new Error(res.error);
    renderHostAccounts(res.accounts || []);
    setEnterpriseStatus(`Removed ${host}`);
    setStatus(t('popup_status_enterprise_removed'));
  } catch (err) {
    setEnterpriseStatus(err.message || 'Remove failed', true);
  }
}

saveBtn.addEventListener('click', async () => {
  try {
  // @ts-expect-error classic content-script dynamic shapes
    const value = tokenInput.value;
    if (!String(value || '').trim()) {
      setStatus(t('popup_status_paste_pat'), true);
      return;
    }
    const status = await send({ type: 'PR_TREE_TOKEN_SET', token: value });
    if (!status?.ok && status?.error) {
      throw new Error(status.error);
    }
  // @ts-expect-error classic content-script dynamic shapes
    tokenInput.value = '';
    renderTokenStatus(status);
    setStatus(t('popup_status_pat_saved'));
  } catch (err) {
    setStatus(err.message || 'Save failed', true);
  }
});

clearBtn.addEventListener('click', async () => {
  try {
  // @ts-expect-error classic content-script dynamic shapes
    tokenInput.value = '';
    await send({ type: 'PR_TREE_TOKEN_CLEAR' });
    renderTokenStatus({ configured: false, mask: '' });
    setStatus(t('popup_status_pat_removed'));
  } catch (err) {
    setStatus(err.message || 'Clear failed', true);
  }
});

tokenInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveBtn.click();
});

prefPluginEnabled?.addEventListener('change', () => void savePrefs());
prefAutoOpenEmbed?.addEventListener('change', () => void savePrefs());
prefListOpenMode?.addEventListener('change', () => void savePrefs());
prefReverseComments.addEventListener('change', () => void savePrefs());
prefSingleFileMode?.addEventListener('change', () => void savePrefs());
prefAutoExpandFileNav?.addEventListener('change', () => void savePrefs());
prefTreeView?.addEventListener('change', () => void savePrefs());
prefShortcutMonitorSize?.addEventListener('change', () => void savePrefs());
prefUiLanguage?.addEventListener('change', () => {
  // Capture before label rewrite — Chrome may reset select to first option (auto).
  const chosen = normalizeUiLanguage(prefUiLanguage.value);
  applyPopupI18n(chosen);
  // Keep select on the chosen pref while save runs
  if (prefUiLanguage) prefUiLanguage.value = chosen;
  void savePrefs();
});
// All master: check → every category on; uncheck → every category off
prefTlAll?.addEventListener('change', () => {
  const on = Boolean(prefTlAll.checked);
  for (const el of PREF_TL_CATEGORY_INPUTS()) {
    el.checked = on;
  }
  prefTlAll.indeterminate = false;
  // Prevent double-fire if category change listeners also run
  void savePrefs();
});
// Category flips: keep All in sync, then save
for (const el of [
  prefTlEvents,
  prefTlParticipants,
  prefTlComments,
  prefTlReviewThreads,
]) {
  el?.addEventListener('change', (ev) => {
    // Stop bubbling so a parent "All" handler never re-applies defaults
    try {
      ev.stopPropagation();
    } catch {
      /* ignore */
    }
    syncTimelineAllCheckboxFromCategories();
    void savePrefs();
  });
}

enterpriseHostInput?.addEventListener('input', () => {
  // @ts-expect-error classic content-script dynamic shapes
  updateEndpointPreview(enterpriseHostInput.value);
  updateAddHostButtonState();
});

addHostAccountBtn?.addEventListener('click', async () => {
  // @ts-expect-error classic content-script dynamic shapes
  const host = normalizeHostInput(enterpriseHostInput?.value);
  // @ts-expect-error classic content-script dynamic shapes
  const token = String(enterpriseTokenInput?.value || '').trim();
  if (!host) {
    setEnterpriseStatus('Enter an enterprise web host', true);
    return;
  }
  if (host === 'github.com' || host === 'www.github.com') {
    setEnterpriseStatus('github.com uses the default PAT above', true);
    return;
  }
  if (!token) {
    setEnterpriseStatus('PAT is required with each host', true);
    return;
  }
  const isUpdate = hostAccountsState.some((a) => a.host === host);
  if (hostAccountsState.length >= MAX_HOST_ACCOUNTS && !isUpdate) {
    setEnterpriseStatus(`At most ${MAX_HOST_ACCOUNTS} enterprise hosts`, true);
    return;
  }

  // @ts-expect-error classic content-script dynamic shapes
  addHostAccountBtn.disabled = true;
  setEnterpriseStatus(isUpdate ? 'Updating PAT…' : 'Saving…');
  try {
    const res = await send({
      type: 'PR_TREE_HOST_ACCOUNT_ADD',
      host,
      token,
    });
    if (!res?.ok) {
      throw new Error(res?.error || 'Add host failed');
    }
  // @ts-expect-error classic content-script dynamic shapes
    enterpriseHostInput.value = '';
  // @ts-expect-error classic content-script dynamic shapes
    enterpriseTokenInput.value = '';
    renderHostAccounts(res.accounts || []);
    const perm = res.permission;
    const reg = res.contentScripts;
    if (perm && perm.granted === false) {
      setEnterpriseStatus(
        perm.error ||
          'Permission denied — grant access to the enterprise host when prompted.',
        true
      );
    } else {
      setEnterpriseStatus(
        `${isUpdate ? 'Updated' : 'Saved'} ${host}${
          reg?.registered ? ' · content scripts registered' : ''
        }`
      );
    }
    setStatus(
      isUpdate
        ? t('popup_status_enterprise_updated')
        : t('popup_status_enterprise_saved')
    );
    updateEndpointPreview(host);
  } catch (err) {
    setEnterpriseStatus(err.message || 'Save failed', true);
    setStatus(err.message || 'Enterprise save failed', true);
  } finally {
    updateAddHostButtonState();
  }
});

enterpriseTokenInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addHostAccountBtn?.click();
});

const INSTALL_PULLS_URL = 'https://github.com/enif-lee/pr-plus/pulls';
/** Same demo PR as onboarding (multi-file + review threads). */
const DEMO_PR_URL = 'https://github.com/enif-lee/pr-plus/pull/1';

restartOnboardingBtn?.addEventListener('click', async () => {
  // @ts-expect-error classic content-script dynamic shapes
  restartOnboardingBtn.disabled = true;
  try {
    // Clear one-shot flag (dedicated key + prefs mirror)
    const res = await send({
      type: 'PR_TREE_ONBOARDING_SET',
      completed: false,
    });
    if (!res?.ok && res?.error) {
      throw new Error(res.error);
    }
    // Also notify open GitHub tabs so an active tour can remount
    try {
      const tabs = await chrome.tabs.query({
        url: ['https://github.com/*', 'https://*.github.com/*'],
      });
      await Promise.all(
        (tabs || []).map((tab: any): any => {
          if (tab.id == null) return null;
          return chrome.tabs
            .sendMessage(tab.id, { type: 'PR_TREE_ONBOARDING_RESTART' })
            .catch((): any => null);
        })
      );
    } catch {
      /* optional */
    }
    // Open pulls so the tour can open demo PR #1 from the list
    try {
      await chrome.tabs.create({ url: INSTALL_PULLS_URL });
    } catch {
      chrome.tabs?.create?.({ url: INSTALL_PULLS_URL });
    }
    setStatus(t('popup_status_onboarding_started'));
  } catch (err) {
    setStatus(err.message || 'Could not restart onboarding', true);
  } finally {
    // @ts-expect-error classic content-script dynamic shapes
    restartOnboardingBtn.disabled = false;
  }
});

clearIdbBtn?.addEventListener('click', async () => {
  if (
    !window.confirm(
      'Clear all cached PR details (IndexedDB + memory) on open GitHub tabs?'
    )
  ) {
    return;
  }
  // @ts-expect-error classic content-script dynamic shapes
  clearIdbBtn.disabled = true;
  try {
    const res = await send({ type: 'PR_TREE_CLEAR_DETAIL_CACHE' });
    if (!res?.ok && res?.error) {
      throw new Error(res.error);
    }
    setStatus(t('popup_status_idb_cleared'));
  } catch (err) {
    setStatus(err.message || 'Clear cache failed', true);
  } finally {
  // @ts-expect-error classic content-script dynamic shapes
    clearIdbBtn.disabled = false;
  }
});

activeGithubHostEl?.addEventListener('change', () => {
  void send({
    type: 'PR_TREE_ACTIVE_HOST_SET',
    host: activeGithubHostEl.value,
  });
});

function requestOrigins(
  origins: string[]
): Promise<{ granted: boolean; error?: string }> {
  const chromeApi = (globalThis as any).chrome;
  if (!chromeApi?.permissions?.request) {
    return Promise.resolve({
      granted: false,
      error: 'permissions API unavailable',
    });
  }
  return new Promise((resolve) => {
    chromeApi.permissions.request({ origins }, (granted: boolean) => {
      const err = chromeApi.runtime?.lastError;
      if (err) resolve({ granted: false, error: err.message });
      else resolve({ granted: Boolean(granted) });
    });
  });
}

function addConnectedOrigins(origins: string[]) {
  // permissions.request must run in this click turn — SW cannot show the prompt.
  void requestOrigins(origins)
    .then((req) => {
      if (!req.granted) {
        setStatus(req.error || t('popup_status_site_denied'), true);
        return null;
      }
      return send({ type: 'PR_TREE_CONNECTED_SITES_ADD', origins });
    })
    .then((res) => {
      if (!res) return;
      if (res.ok) {
        renderConnectedSites(res.origins || []);
        setStatus(t('popup_status_site_added'));
      } else {
        setStatus(res.error || t('popup_status_site_denied'), true);
      }
    });
}

connectLinearBtn?.addEventListener('click', () => {
  addConnectedOrigins(['https://linear.app/*', 'https://*.linear.app/*']);
});
connectJiraBtn?.addEventListener('click', () => {
  addConnectedOrigins(['https://*.atlassian.net/*']);
});
connectLocalhostBtn?.addEventListener('click', () => {
  addConnectedOrigins(['http://localhost/*', 'http://127.0.0.1/*']);
});

function siteErrorMessage(code: string) {
  if (code === 'github') return t('popup_status_site_github');
  if (code === 'https-only') return t('popup_status_site_https_only');
  if (code === 'empty') return t('popup_status_site_invalid');
  return t('popup_status_site_invalid');
}

function addCustomConnectedSite() {
  const raw = String(connectCustomHostEl?.value || '');
  const parsed = parseCustomConnectedOrigins(raw);
  if (!parsed.ok) {
    setStatus(siteErrorMessage(parsed.error), true);
    return;
  }
  addConnectedOrigins(parsed.origins);
}

connectCustomBtn?.addEventListener('click', () => {
  addCustomConnectedSite();
});
connectCustomHostEl?.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    addCustomConnectedSite();
  }
});

// English shell until prefs load; load() re-applies preferred language.
applyPopupI18n('auto');
load();
