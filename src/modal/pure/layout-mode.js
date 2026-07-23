/**
 * Pure layout mode helpers for the PR modal.
 * Modes: 'centered' | 'diff'
 */

const LAYOUT_CENTERED = 'centered';
const LAYOUT_DIFF = 'diff';

function isValidLayoutMode(mode) {
  return mode === LAYOUT_CENTERED || mode === LAYOUT_DIFF;
}

function toggleDiffLayout(mode) {
  return mode === LAYOUT_DIFF ? LAYOUT_CENTERED : LAYOUT_DIFF;
}

function openDiffLayout() {
  return LAYOUT_DIFF;
}

function closeDiffLayout() {
  return LAYOUT_CENTERED;
}

function layoutClassName(mode) {
  if (mode === LAYOUT_DIFF) {
    return 'prp-modal prp-modal--diff';
  }
  return 'prp-modal prp-modal--centered';
}

const api = {
  LAYOUT_CENTERED,
  LAYOUT_DIFF,
  isValidLayoutMode,
  toggleDiffLayout,
  openDiffLayout,
  closeDiffLayout,
  layoutClassName,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRModalLayout = api;
}
