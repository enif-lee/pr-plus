/**
 * SearchableSelect popover layout: no unpositioned first paint, no L→R jump.
 * Drives shipped layoutSselectPopover.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';
import { layoutSselectPopover } from '../src/modal/lib/searchable-select';

const root = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('layoutSselectPopover (shipped)', () => {
  test('right-rail add button: start-align then clamp, never left=0', () => {
    const box = layoutSselectPopover({
      anchor: { top: 120, left: 900, right: 924, bottom: 144, width: 24, height: 24 },
      viewport: { width: 1000, height: 800 },
      panelHeight: 200,
      minWidth: 220,
      maxWidth: 320,
      placement: 'bottom',
    });
    expect(box.width).toBe(220);
    expect(box.left).toBeGreaterThan(8);
    // Overflow: flip to the anchor's right edge (924-220=704) then on-screen.
    expect(box.left).toBe(Math.max(8, 924 - 220));
    expect(box.left + box.width).toBeLessThanOrEqual(1000 - 8);
    expect(box.top).toBe(144 + 6);
  });

  test('left-side anchor keeps start alignment', () => {
    const box = layoutSselectPopover({
      anchor: { top: 80, left: 40, right: 80, bottom: 104, width: 40, height: 24 },
      viewport: { width: 1200, height: 800 },
      minWidth: 220,
      maxWidth: 320,
      placement: 'bottom',
    });
    expect(box.left).toBe(40);
    expect(box.top).toBe(110);
  });

  test('option-list height only flips vertical, not left', () => {
    const anchor = {
      top: 600,
      left: 200,
      right: 224,
      bottom: 624,
      width: 24,
      height: 24,
    };
    const viewport = { width: 1000, height: 700 };
    const short = layoutSselectPopover({
      anchor,
      viewport,
      panelHeight: 40,
      minWidth: 220,
      maxWidth: 320,
    });
    const tall = layoutSselectPopover({
      anchor,
      viewport,
      panelHeight: 280,
      minWidth: 220,
      maxWidth: 320,
    });
    expect(tall.left).toBe(short.left);
    expect(tall.top).toBeLessThan(short.top);
  });
});

describe('SearchableSelect never paints anchored panel in-flow', () => {
  test('anchored path stays position:fixed and hides until placed', () => {
    const ui = read('src/modal/components/common/SearchableSelect.tsx');
    expect(ui).toMatch(/layoutSselectPopover/);
    expect(ui).toMatch(/data-prp-sselect-placed/);
    expect(ui).toMatch(/visibility:\s*'hidden'/);
    expect(ui).toMatch(/!anchored && !placed/);
    expect(ui).not.toMatch(
      /className=\{`prp-sselect-panel prp-sselect-panel--popover\$\{pos \? '' : ' prp-sselect-panel--center'\}/
    );
    // query / options length must not re-run placement (directory fill L→R)
    const effect = ui.slice(
      ui.indexOf('useLayoutEffect(() => {'),
      ui.indexOf('const filteredLive')
    );
    expect(effect).not.toMatch(/options\?\.length/);
    expect(effect).not.toMatch(/\bquery\b/);
  });
});
