/** @module modal/lib/layout-mode */
/**
 * Pure layout mode helpers for the PR modal.
 * Modes: 'centered' | 'diff'
 */

export const LAYOUT_CENTERED = 'centered';
export const LAYOUT_DIFF = 'diff';

export function isValidLayoutMode(mode: any) {
  return mode === LAYOUT_CENTERED || mode === LAYOUT_DIFF;
}

export function toggleDiffLayout(mode: any) {
  return mode === LAYOUT_DIFF ? LAYOUT_CENTERED : LAYOUT_DIFF;
}

export function openDiffLayout() {
  return LAYOUT_DIFF;
}

export function closeDiffLayout() {
  return LAYOUT_CENTERED;
}

export function layoutClassName(mode: any) {
  if (mode === LAYOUT_DIFF) {
    return 'prp-modal prp-modal--diff';
  }
  return 'prp-modal prp-modal--centered';
}

/**
 * True when Diff has nothing to show: PR meta is known and there are zero
 * file changes (empty-commit-only PR). Returns false when `changedFiles` is
 * still unknown/null so progressive load does not false-disable Diff.
 *
 * Prefer explicit `changedFiles === 0`. Fallback only when files array is
 * present and empty AND additions/deletions are both explicitly 0 (not null).
 *
 * @param {any} detail
 * @returns {boolean}
 */
export function isDiffUnavailable(detail: any) {
  if (!detail || typeof detail !== 'object') return false;
  const cf = detail.changedFiles;
  if (cf != null && cf !== '') {
    const n = Number(cf);
    if (Number.isFinite(n)) return n === 0;
  }
  // Unknown changedFiles: do not gate on empty files alone (may still be loading).
  // Only when both stats are known 0 and files list is an empty array.
  const files = detail.files;
  if (!Array.isArray(files) || files.length > 0) return false;
  const add = detail.additions;
  const del = detail.deletions;
  if (add == null || del == null || add === '' || del === '') return false;
  const a = Number(add);
  const d = Number(del);
  if (!Number.isFinite(a) || !Number.isFinite(d)) return false;
  return a === 0 && d === 0;
}
