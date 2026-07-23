const tokenInput = document.getElementById('token');
const saveBtn = document.getElementById('save');
const clearBtn = document.getElementById('clear');
const statusEl = document.getElementById('status');
const tokenSavedEl = document.getElementById('token-saved');
const tokenMaskEl = document.getElementById('token-mask');
const prefFastReview = document.getElementById('pref-fast-review');
const prefReverseComments = document.getElementById('pref-reverse-comments');
const clearIdbBtn = document.getElementById('clear-idb');

const DEFAULT_PREFS = {
  fastReview: true,
  reverseComments: true,
};

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('err', isError);
}

function renderTokenStatus(status) {
  if (status?.configured) {
    tokenSavedEl.hidden = false;
    tokenMaskEl.textContent = status.mask;
    tokenInput.placeholder = 'Replace token…';
  } else {
    tokenSavedEl.hidden = true;
    tokenMaskEl.textContent = '';
    tokenInput.placeholder = 'ghp_… / github_pat_…';
  }
}

function renderPrefs(prefs) {
  const p = prefs || DEFAULT_PREFS;
  prefFastReview.checked = p.fastReview !== false;
  prefReverseComments.checked = p.reverseComments !== false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientChannelError(msg) {
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
    const [status, prefsRes] = await Promise.all([
      send({ type: 'PR_TREE_TOKEN_STATUS' }),
      send({ type: 'PR_TREE_PREFS_GET' }),
    ]);
    if (!status?.ok && status?.error) {
      throw new Error(status.error);
    }
    renderTokenStatus(status);
    renderPrefs(prefsRes?.prefs || DEFAULT_PREFS);
    if (!status?.configured) {
      setStatus('No token saved yet');
    }
  } catch (err) {
    setStatus(err.message || 'Failed to load status', true);
    renderPrefs(DEFAULT_PREFS);
  }
}

async function savePrefs() {
  try {
    const prefs = {
      fastReview: Boolean(prefFastReview.checked),
      reverseComments: Boolean(prefReverseComments.checked),
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

saveBtn.addEventListener('click', async () => {
  try {
    const value = tokenInput.value;
    if (!String(value || '').trim()) {
      setStatus('Paste a GitHub PAT first', true);
      return;
    }
    const status = await send({ type: 'PR_TREE_TOKEN_SET', token: value });
    if (!status?.ok && status?.error) {
      throw new Error(status.error);
    }
    // Only clear the input after a successful save
    tokenInput.value = '';
    renderTokenStatus(status);
    setStatus('Saved securely in extension storage');
  } catch (err) {
    setStatus(err.message || 'Save failed', true);
  }
});

clearBtn.addEventListener('click', async () => {
  try {
    tokenInput.value = '';
    await send({ type: 'PR_TREE_TOKEN_CLEAR' });
    renderTokenStatus({ configured: false, mask: '' });
    setStatus('Token removed');
  } catch (err) {
    setStatus(err.message || 'Clear failed', true);
  }
});

tokenInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveBtn.click();
});

prefFastReview.addEventListener('change', () => void savePrefs());
prefReverseComments.addEventListener('change', () => void savePrefs());

clearIdbBtn?.addEventListener('click', async () => {
  if (
    !window.confirm(
      'Clear all cached PR details (IndexedDB + memory) on open GitHub tabs?'
    )
  ) {
    return;
  }
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
        'No github.com tabs open — open GitHub, then clear again',
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
    clearIdbBtn.disabled = false;
  }
});

load();
