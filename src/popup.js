const tokenInput = document.getElementById('token');
const saveBtn = document.getElementById('save');
const clearBtn = document.getElementById('clear');
const statusEl = document.getElementById('status');
const tokenSavedEl = document.getElementById('token-saved');
const tokenMaskEl = document.getElementById('token-mask');

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

function send(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          const msg = err.message || String(err);
          // Common after extension reload when service worker failed to start
          if (/Receiving end does not exist|Could not establish connection/i.test(msg)) {
            reject(
              new Error(
                'Background worker offline. Open chrome://extensions, click Reload on pr+, then try again.'
              )
            );
            return;
          }
          reject(new Error(msg));
          return;
        }
        resolve(response);
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function load() {
  try {
    const status = await send({ type: 'PR_TREE_TOKEN_STATUS' });
    if (!status?.ok && status?.error) {
      throw new Error(status.error);
    }
    renderTokenStatus(status);
    if (!status?.configured) {
      setStatus('No token saved yet');
    }
  } catch (err) {
    setStatus(err.message || 'Failed to load status', true);
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

load();
