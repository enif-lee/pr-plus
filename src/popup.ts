const tokenInput = document.getElementById('token');
const saveBtn = document.getElementById('save');
const clearBtn = document.getElementById('clear');
const statusEl = document.getElementById('status');
const tokenSavedEl = document.getElementById('token-saved');
const tokenMaskEl = document.getElementById('token-mask');
const prefAutoOpenEmbed = document.getElementById('pref-auto-open-embed');
const prefFastReview = document.getElementById('pref-fast-review');
const prefReverseComments = document.getElementById('pref-reverse-comments');
const prefSingleFileMode = document.getElementById('pref-single-file-mode');
const prefTreeView = document.getElementById('pref-tree-view');
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
  fastReview: true,
  reverseComments: true,
  autoOpenEmbed: true,
  singleFileMode: false,
  treeView: true,
  onboardingCompleted: false,
};

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
  // @ts-expect-error classic content-script dynamic shapes
  if (prefAutoOpenEmbed) prefAutoOpenEmbed.checked = p.autoOpenEmbed !== false;
  // @ts-expect-error classic content-script dynamic shapes
  prefFastReview.checked = p.fastReview !== false;
  // @ts-expect-error classic content-script dynamic shapes
  prefReverseComments.checked = p.reverseComments !== false;
  // @ts-expect-error classic content-script dynamic shapes
  if (prefSingleFileMode) prefSingleFileMode.checked = p.singleFileMode === true;
  // @ts-expect-error classic content-script dynamic shapes
  if (prefTreeView) prefTreeView.checked = p.treeView !== false;
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
    const accounts =
      hostsRes?.accounts ||
      prefsRes?.hostAccounts ||
      [];
    renderHostAccounts(accounts);
    if (!status?.configured && accounts.length === 0) {
      setStatus('No github.com token saved yet');
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
  // @ts-expect-error classic content-script dynamic shapes
      autoOpenEmbed: Boolean(prefAutoOpenEmbed?.checked),
  // @ts-expect-error classic content-script dynamic shapes
      fastReview: Boolean(prefFastReview.checked),
  // @ts-expect-error classic content-script dynamic shapes
      reverseComments: Boolean(prefReverseComments.checked),
  // @ts-expect-error classic content-script dynamic shapes
      singleFileMode: Boolean(prefSingleFileMode?.checked),
  // @ts-expect-error classic content-script dynamic shapes
      treeView: Boolean(prefTreeView?.checked),
    };
    const res = await send({ type: 'PR_TREE_PREFS_SET', prefs });
    if (!res?.ok && res?.error) {
      throw new Error(res.error);
    }
    renderPrefs(res.prefs || prefs);
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

prefAutoOpenEmbed?.addEventListener('change', () => void savePrefs());
prefFastReview.addEventListener('change', () => void savePrefs());
prefReverseComments.addEventListener('change', () => void savePrefs());
prefSingleFileMode?.addEventListener('change', () => void savePrefs());
prefTreeView?.addEventListener('change', () => void savePrefs());

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
