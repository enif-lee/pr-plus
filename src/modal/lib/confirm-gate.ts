/** @module modal/lib/confirm-gate */
/**
 * Pure helpers for in-app confirmation (no browser dialog).
 * App injects a real ConfirmDialog; these helpers only shape options / merge labels.
 */

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warn' | 'default';
};

/**
 * Build merge confirmation copy. Does not perform merge.
 * @param {'merge'|'squash'|'rebase'|string} method
 * @param {number|string} number
 */
export function buildMergeConfirmRequest(
  method: string,
  number: number | string
): ConfirmRequest {
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

/**
 * Gate: if `confirmed` is false, treat as cancel (caller must not run side effect).
 */
export function confirmGateProceed(confirmed: unknown): boolean {
  return confirmed === true;
}
