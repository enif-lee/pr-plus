/**
 * Selection jump settle: busy attr + delayed floatbar constants.
 */
import { describe, expect, test } from '@rstest/core';
import {
  SELECTION_ACTIONS_REVEAL_MS,
  SELECTION_NAV_BUSY_ATTR,
  shouldShowSelectionActionGroup,
} from '../src/modal/lib/line-selection';

describe('SELECTION_NAV_BUSY_ATTR / REVEAL_MS', () => {
  test('attr name is stable for CSS + OptBtnHint', () => {
    expect(SELECTION_NAV_BUSY_ATTR).toBe('data-prp-selection-nav');
  });

  test('reveal delay is long enough to outlast key-repeat settle', () => {
    expect(SELECTION_ACTIONS_REVEAL_MS).toBeGreaterThanOrEqual(400);
  });
});

describe('floatbar delayed by selectionNavBusy', () => {
  test('Opt alone shows after busy clears', () => {
    expect(
      shouldShowSelectionActionGroup({
        hasLineOrFileSelection: true,
        optHeld: true,
        selectionNavBusy: false,
        phase: 'actions',
      })
    ).toBe(true);
  });

  test('busy suppresses Opt reveal', () => {
    expect(
      shouldShowSelectionActionGroup({
        hasLineOrFileSelection: true,
        optHeld: true,
        hoverReveal: true,
        selectionNavBusy: true,
        phase: 'actions',
      })
    ).toBe(false);
  });
});
