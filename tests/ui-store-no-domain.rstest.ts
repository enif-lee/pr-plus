/**
 * Phase 6: UiStore must not hold PrDetail / localDetail domain SoT.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';

const root = path.resolve(__dirname, '..');

describe('ui-store-no-domain', () => {
  test('modal-store / ui-store sources omit localDetail and PrDetail fields', () => {
    const modal = fs.readFileSync(
      path.join(root, 'src/modal/store/modal-store.ts'),
      'utf8'
    );
    const ui = fs.readFileSync(
      path.join(root, 'src/modal/store/ui-store.ts'),
      'utf8'
    );
    expect(modal).not.toMatch(/\blocalDetail\b/);
    expect(modal).not.toMatch(/\bsetLocalDetail\b/);
    // Type import of PrDetail only for hydrateLocalDetail no-op signature is ok;
    // field must not exist on state shape as domain SoT.
    expect(modal).not.toMatch(/localDetail\s*:/);
    expect(ui).toMatch(/useUiStore|useModalStore/);
    // Strip comments before forbidding domain mirror symbol in code.
    const uiCode = ui
      .split('\n')
      .filter((ln) => !/^\s*\/\//.test(ln) && !/^\s*\*/.test(ln))
      .join('\n');
    expect(uiCode).not.toMatch(/\blocalDetail\b/);
  });

  test('hydrateLocalDetail is a no-op (no domain mirror)', () => {
    // Dynamic import of store
    const { useModalStore } = require('../src/modal/store/modal-store') as typeof import('../src/modal/store/modal-store');
    const before = useModalStore.getState();
    useModalStore.getState().hydrateLocalDetail?.({
      owner: 'o',
      repo: 'r',
      number: 1,
      title: 'should not stick',
    } as any);
    const after = useModalStore.getState();
    expect((after as any).localDetail).toBeUndefined();
    expect((after as any).title).toBeUndefined();
    expect(before.actionBusy).toBe(after.actionBusy);
  });
});
