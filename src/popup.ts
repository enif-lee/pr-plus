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
const prefReverseComments = document.getElementById('pref-reverse-comments');
const prefSingleFileMode = document.getElementById('pref-single-file-mode');
const prefAutoExpandFileNav = document.getElementById(
  'pref-auto-expand-file-nav'
);
const prefTreeView = document.getElementById('pref-tree-view');
const prefShortcutMonitorSize = document.getElementById(
  'pref-shortcut-monitor-size'
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

const MAX_HOST_ACCOUNTS = 3;

const DEFAULT_PREFS = {
  pluginEnabled: true,
  reverseComments: true,
  autoOpenEmbed: true,
  singleFileMode: false,
  autoExpandOnFileNav: false,
  treeView: true,
  shortcutMonitorSize: 'small',
  onboardingCompleted: false,
  timelineVisibility: {
    events: true,
    participants: true,
    comments: true,
    'review-threads': true,
  },
};

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

/** @type {{ host: string, mask: string }[]} */
let hostAccountsState = [];

function setStatus(text: any, isError: any = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('err', isError);
}

function renderTokenStatus(status: any) {
  if (status?.configured) {
    tokenSavedEl.hidden = false;
    tokenMaskEl.textContent = status.mask;
  // @ts-expect-error classic content-script dynamic shapes
    tokenInput.placeholder = 'Replace github.com token…';
  } else {
    tokenSavedEl.hidden = true;
    tokenMaskEl.textContent = '';
  // @ts-expect-error classic content-script dynamic shapes
    tokenInput.placeholder = 'ghp_… / github_pat_…';
  }
}

function renderPrefs(prefs: any) {
  const p = prefs || DEFAULT_PREFS;
  if (prefPluginEnabled) {
    prefPluginEnabled.checked = p.pluginEnabled !== false;
  }
  // @ts-expect-error classic content-script dynamic shapes
  if (prefAutoOpenEmbed) prefAutoOpenEmbed.checked = p.autoOpenEmbed !== false;
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
      meta.textContent = `${rem} / ${lim} left · used ${used} · reset ${formatReset(snap, now)}`;
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
          ? `pr+ disabled (rate limit: ${blocked.join(', ')}). Re-enable after reset or use the toggle.`
          : 'pr+ is disabled in settings.';
    } else if (blocked.length > 0) {
      rateLimitStatusEl.textContent = `Blocked resources until reset: ${blocked.join(', ')}.`;
    } else if (!any) {
      rateLimitStatusEl.textContent =
        'Rate limit 정보가 아직 없습니다. GitHub에서 PR을 한 번 열어 주세요.';
    } else {
      rateLimitStatusEl.textContent = 'API rate limits look healthy.';
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
  let rest;
  let gql;
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
    removeBtn.textContent = 'Remove';
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
    ? 'Update PAT & grant access'
    : 'Add host & grant access';
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
async function send(message, { retries = 4 } = {}) {
  let lastErr;
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

async function load() {
  try {
    const [status, prefsRes, hostsRes] = await Promise.all([
      send({ type: 'PR_TREE_TOKEN_STATUS' }),
      send({ type: 'PR_TREE_PREFS_GET' }),
      send({ type: 'PR_TREE_HOST_ACCOUNTS_LIST' }),
    ]);
    if (!status?.ok && status?.error) {
      throw new Error(status.error);
    }
    renderTokenStatus(status);
    renderPrefs(prefsRes?.prefs || DEFAULT_PREFS);
    renderRateLimitState(
      prefsRes?.rateLimit || null,
      prefsRes?.prefs?.pluginEnabled !== false
    );
    const accounts =
      hostsRes?.accounts ||
      prefsRes?.hostAccounts ||
      [];
    renderHostAccounts(accounts);
    if (!status?.configured && accounts.length === 0) {
      setStatus('No github.com token saved yet');
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
    setStatus(err.message || 'Failed to load status', true);
    renderPrefs(DEFAULT_PREFS);
    renderHostAccounts([]);
  }
}

async function savePrefs() {
  try {
    const prefs = {
      pluginEnabled: prefPluginEnabled
        ? Boolean(prefPluginEnabled.checked)
        : true,
  // @ts-expect-error classic content-script dynamic shapes
      autoOpenEmbed: Boolean(prefAutoOpenEmbed?.checked),
  // @ts-expect-error classic content-script dynamic shapes
      reverseComments: Boolean(prefReverseComments.checked),
  // @ts-expect-error classic content-script dynamic shapes
      singleFileMode: Boolean(prefSingleFileMode?.checked),
  // @ts-expect-error classic content-script dynamic shapes
      autoExpandOnFileNav: Boolean(prefAutoExpandFileNav?.checked),
  // @ts-expect-error classic content-script dynamic shapes
      treeView: Boolean(prefTreeView?.checked),
      shortcutMonitorSize: normalizeShortcutMonitorSize(
        prefShortcutMonitorSize?.value
      ),
      timelineVisibility: readTimelineVisibilityFromDom(),
    };
    const res = await send({ type: 'PR_TREE_PREFS_SET', prefs });
    if (!res?.ok && res?.error) {
      throw new Error(res.error);
    }
    renderPrefs(res.prefs || prefs);
    if (res.rateLimit) {
      renderRateLimitState(
        res.rateLimit,
        (res.prefs || prefs)?.pluginEnabled !== false
      );
    }
    setStatus('Options saved');
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
    setStatus('Enterprise host removed');
  } catch (err) {
    setEnterpriseStatus(err.message || 'Remove failed', true);
  }
}

saveBtn.addEventListener('click', async () => {
  try {
  // @ts-expect-error classic content-script dynamic shapes
    const value = tokenInput.value;
    if (!String(value || '').trim()) {
      setStatus('Paste a GitHub PAT first', true);
      return;
    }
    const status = await send({ type: 'PR_TREE_TOKEN_SET', token: value });
    if (!status?.ok && status?.error) {
      throw new Error(status.error);
    }
  // @ts-expect-error classic content-script dynamic shapes
    tokenInput.value = '';
    renderTokenStatus(status);
    setStatus('github.com PAT saved');
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
    setStatus('github.com token removed');
  } catch (err) {
    setStatus(err.message || 'Clear failed', true);
  }
});

tokenInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveBtn.click();
});

prefPluginEnabled?.addEventListener('change', () => void savePrefs());
prefAutoOpenEmbed?.addEventListener('change', () => void savePrefs());
prefReverseComments.addEventListener('change', () => void savePrefs());
prefSingleFileMode?.addEventListener('change', () => void savePrefs());
prefAutoExpandFileNav?.addEventListener('change', () => void savePrefs());
prefTreeView?.addEventListener('change', () => void savePrefs());
prefShortcutMonitorSize?.addEventListener('change', () => void savePrefs());
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
    setStatus(isUpdate ? 'Enterprise PAT updated' : 'Enterprise host saved');
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
        (tabs || []).map(
          (tab) =>
            tab.id != null &&
            chrome.tabs
              .sendMessage(tab.id, { type: 'PR_TREE_ONBOARDING_RESTART' })
              .catch(() => null)
        )
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
    setStatus(
      `Onboarding restarted — use demo PR #1 (${DEMO_PR_URL.split('/').slice(-2).join('/')})`
    );
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
    const tabs = Number(res?.tabs) || 0;
    const cleared = Number(res?.cleared) || 0;
    if (tabs === 0) {
      setStatus(
        'No GitHub tabs open — open github.com or your enterprise host, then clear again',
        true
      );
    } else if (cleared === 0) {
      setStatus(
        `No content scripts responded (${tabs} tab${tabs === 1 ? '' : 's'}). Reload the GitHub tab and retry.`,
        true
      );
    } else {
      setStatus(
        `Cleared cache on ${cleared} tab${cleared === 1 ? '' : 's'}${
          tabs > cleared ? ` (${tabs - cleared} skipped)` : ''
        }`
      );
    }
  } catch (err) {
    setStatus(err.message || 'Clear cache failed', true);
  } finally {
  // @ts-expect-error classic content-script dynamic shapes
    clearIdbBtn.disabled = false;
  }
});

load();
