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
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || String(err)));
        return;
      }
      resolve(response);
    });
  });
}

async function load() {
  try {
    const status = await send({ type: 'PR_TREE_TOKEN_STATUS' });
    renderTokenStatus(status);
  } catch (err) {
    setStatus(err.message || 'Failed to load status', true);
  }
}

saveBtn.addEventListener('click', async () => {
  try {
    const value = tokenInput.value;
    tokenInput.value = '';
    const status = await send({ type: 'PR_TREE_TOKEN_SET', token: value });
    if (!status?.ok && status?.error) {
      throw new Error(status.error);
    }
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
