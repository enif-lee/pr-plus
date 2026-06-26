const tokenInput = document.getElementById('token');
const saveBtn = document.getElementById('save');
const clearBtn = document.getElementById('clear');
const statusEl = document.getElementById('status');
const tokenSavedEl = document.getElementById('token-saved');
const tokenMaskEl = document.getElementById('token-mask');

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#cf222e' : '#656d76';
}

function renderTokenStatus(status) {
  if (status.configured) {
    tokenSavedEl.hidden = false;
    tokenMaskEl.textContent = status.mask;
    tokenInput.placeholder = '새 토큰 입력 시 교체됩니다';
  } else {
    tokenSavedEl.hidden = true;
    tokenMaskEl.textContent = '';
    tokenInput.placeholder = 'ghp_... 또는 github_pat_...';
  }
}

async function load() {
  const status = await globalThis.PRTreeStorage.getGithubTokenStatus();
  renderTokenStatus(status);
}

saveBtn.addEventListener('click', async () => {
  try {
    await globalThis.PRTreeStorage.setGithubToken(tokenInput.value);
    tokenInput.value = '';
    const status = await globalThis.PRTreeStorage.getGithubTokenStatus();
    renderTokenStatus(status);
    setStatus('Saved. Refresh the pulls page to apply.');
  } catch (err) {
    setStatus(err.message || 'Failed to save', true);
  }
});

clearBtn.addEventListener('click', async () => {
  try {
    await globalThis.PRTreeStorage.setGithubToken('');
    tokenInput.value = '';
    renderTokenStatus({ configured: false, mask: '' });
    setStatus('Token removed.');
  } catch (err) {
    setStatus(err.message || 'Failed to clear', true);
  }
});

load();