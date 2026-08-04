/**
 * Opt peer gate: Opt+Shift product chords must fire while typing;
 * plain Opt must not (composer owns those).
 */
import { describe, expect, test } from '@rstest/core';
import {
  allowPrModalOptPeerWhileEditable,
  resolvePrModalOptAction,
} from '../src/modal/lib/command-palette-opt';

describe('allowPrModalOptPeerWhileEditable', () => {
  test('always allows when not editing', () => {
    expect(allowPrModalOptPeerWhileEditable({ editableTarget: false })).toBe(
      true
    );
    expect(
      allowPrModalOptPeerWhileEditable({ editableTarget: false, shift: true })
    ).toBe(true);
  });

  test('blocks plain Opt while typing', () => {
    expect(
      allowPrModalOptPeerWhileEditable({ editableTarget: true, shift: false })
    ).toBe(false);
  });

  test('allows Opt+Shift while typing (⌥⇧L labels, …)', () => {
    expect(
      allowPrModalOptPeerWhileEditable({ editableTarget: true, shift: true })
    ).toBe(true);
  });
});

describe('resolvePrModalOptAction ⌥⇧L', () => {
  test('KeyL + alt + shift → promptLabels', () => {
    const peer = resolvePrModalOptAction({
      alt: true,
      shift: true,
      mod: false,
      key: '¬', // macOS may report a glyph; code wins
      code: 'KeyL',
    });
    expect(peer?.action).toBe('promptLabels');
    expect(peer?.id).toBe('opt-labels');
  });

  test('KeyL + alt without shift is not labels', () => {
    const peer = resolvePrModalOptAction({
      alt: true,
      shift: false,
      mod: false,
      key: 'l',
      code: 'KeyL',
    });
    // plain ⌥L is not registered (reserved / unused)
    expect(peer?.action === 'promptLabels').toBe(false);
  });
});
