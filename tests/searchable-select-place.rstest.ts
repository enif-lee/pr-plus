import { describe, expect, test } from '@rstest/core';
import { placeSearchableSelectPanel } from '../src/modal/lib/searchable-select';

const viewport = { width: 1200, height: 800 };

describe('placeSearchableSelectPanel', () => {
  test('returns null for an empty / unlaid-out anchor', () => {
    expect(
      placeSearchableSelectPanel({
        anchor: { top: 0, left: 0, bottom: 0, width: 0, height: 0 },
        viewport,
      })
    ).toBe(null);
  });

  test('aligns left with the trigger and does not default to 0', () => {
    const pos = placeSearchableSelectPanel({
      anchor: { top: 200, left: 640, bottom: 228, width: 80, height: 28 },
      viewport,
      placement: 'bottom',
    });
    expect(pos).toMatchObject({ left: 640, top: 234, width: 220 });
  });

  test('clamps left so a wide panel stays in the viewport', () => {
    const pos = placeSearchableSelectPanel({
      anchor: { top: 40, left: 1100, bottom: 68, width: 40, height: 28 },
      viewport,
      minWidth: 220,
      maxWidth: 320,
    });
    expect(pos).toBeTruthy();
    expect(pos!.left + pos!.width).toBeLessThanOrEqual(1200 - 8);
    expect(pos!.left).toBeGreaterThan(8);
  });

  test('opens below when there is room (placement bottom)', () => {
    const pos = placeSearchableSelectPanel({
      anchor: { top: 100, left: 200, bottom: 128, width: 120, height: 28 },
      viewport,
      panelHeight: 240,
      placement: 'bottom',
    });
    expect(pos!.top).toBe(134);
  });

  test('flips above when the preferred below side cannot fit', () => {
    const pos = placeSearchableSelectPanel({
      anchor: { top: 700, left: 200, bottom: 728, width: 120, height: 28 },
      viewport,
      panelHeight: 240,
      placement: 'bottom',
    });
    expect(pos!.top).toBe(700 - 240 - 6);
  });
});
