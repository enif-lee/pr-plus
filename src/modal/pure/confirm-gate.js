/**
 * Pure helpers for in-app confirmation (no browser dialog).
 */

function buildMergeConfirmRequest(method, number) {
  const m = ['merge', 'squash', 'rebase'].includes(String(method))
    ? String(method)
    : 'merge';
  const label =
    m === 'squash'
      ? 'Squash and merge'
      : m === 'rebase'
        ? 'Rebase and merge'
        : 'Merge';
  return {
    title: `${label}?`,
    message: `${label} pull request #${number}? This cannot be undone from pr+.`,
    confirmLabel: label,
    cancelLabel: 'Cancel',
    tone: 'danger',
  };
}

function confirmGateProceed(confirmed) {
  return confirmed === true;
}

const api = {
  buildMergeConfirmRequest,
  confirmGateProceed,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalConfirmGate = api;
}
