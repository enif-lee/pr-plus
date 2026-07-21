/** @module modal/lib/layout-mode */
/**
 * Pure layout mode helpers for the PR modal.
 * Modes: 'centered' | 'diff'
 */

export const LAYOUT_CENTERED = 'centered';
export const LAYOUT_DIFF = 'diff';

export function isValidLayoutMode(mode) {
  return mode === LAYOUT_CENTERED || mode === LAYOUT_DIFF;
}

export function toggleDiffLayout(mode) {
  return mode === LAYOUT_DIFF ? LAYOUT_CENTERED : LAYOUT_DIFF;
}

export function openDiffLayout() {
  return LAYOUT_DIFF;
}

export function closeDiffLayout() {
  return LAYOUT_CENTERED;
}

export function layoutClassName(mode) {
  if (mode === LAYOUT_DIFF) {
    return 'prp-modal prp-modal--diff';
  }
  return 'prp-modal prp-modal--centered';
}
