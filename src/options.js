const tokenInput = document.getElementById('token');
const saveBtn = document.getElementById('save');
const clearBtn = document.getElementById('clear');
const statusEl = document.getElementById('status');

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#cf222e' : '#656d76';
}

async function load() {
  const token = await globalThis.PRTreeStorage.getGithubToken();
  if (token) {
    tokenInput.placeholder = 'Token saved (enter new value to replace)';
  }
}

saveBtn.addEventListener('click', async () => {
  try {
    await globalThis.PRTreeStorage.setGithubToken(tokenInput.value);
    tokenInput.value = '';
    tokenInput.placeholder = 'Token saved (enter new value to replace)';
    setStatus('Saved. Refresh the pulls page to apply.');
  } catch (err) {
    setStatus(err.message || 'Failed to save', true);
  }
});

clearBtn.addEventListener('click', async () => {
  try {
    await globalThis.PRTreeStorage.setGithubToken('');
    tokenInput.value = '';
    tokenInput.placeholder = 'ghp_... 또는 github_pat_...';
    setStatus('Token removed.');
  } catch (err) {
    setStatus(err.message || 'Failed to clear', true);
  }
});

load();