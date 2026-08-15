/**
 * Embed GH SPA keyboard isolation — host wiring + pure event list.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PAGE_EMBED_BUBBLE_SHIELD_EVENTS,
  PAGE_EMBED_KEY_SHIELD_EVENTS,
} from '../src/modal/lib/page-embed';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('PAGE_EMBED_KEY_SHIELD_EVENTS', () => {
  test('covers keydown/keyup/keypress', () => {
    expect(PAGE_EMBED_KEY_SHIELD_EVENTS).toContain('keydown');
    expect(PAGE_EMBED_KEY_SHIELD_EVENTS).toContain('keyup');
    expect(PAGE_EMBED_KEY_SHIELD_EVENTS).toContain('keypress');
  });

  test('stops pointer/form events before GitHub document delegates', () => {
    expect(PAGE_EMBED_BUBBLE_SHIELD_EVENTS).toContain('click');
    expect(PAGE_EMBED_BUBBLE_SHIELD_EVENTS).toContain('pointermove');
    expect(PAGE_EMBED_BUBBLE_SHIELD_EVENTS).toContain('submit');
  });
});

describe('host embed key shield wiring', () => {
  test('host-core installs window capture shield on embed open', () => {
    const src = fs.readFileSync(
      path.join(root, 'src/host/modules/host-core-timeline-a.ts'),
      'utf8'
    );
    expect(src).toMatch(/ensureEmbedKeyShield/);
    expect(src).toMatch(/onEmbedKeyShield/);
    expect(src).toMatch(/stopPropagation/);
    expect(src).toMatch(/window\.addEventListener\(type,\s*onEmbedKeyShield,\s*true\)/);
    // Invoked from ensureEmbedHost path
    expect(src).toMatch(/ensureEmbedKeyShield\(\)/);
    expect(src).toMatch(/ensureEmbedBubbleShield\(host\)/);
    expect(src).toMatch(/host\.addEventListener\(type,[\s\S]*stopPropagation/);
  });

  test('shipped pure exports PAGE_EMBED_KEY_SHIELD_EVENTS', () => {
    const pure = fs.readFileSync(
      path.join(root, 'src/modal/pure/page-embed.js'),
      'utf8'
    );
    expect(pure).toMatch(/PAGE_EMBED_KEY_SHIELD_EVENTS/);
    expect(pure).toMatch(/PAGE_EMBED_BUBBLE_SHIELD_EVENTS/);
  });

  test('GitHub-only observers ignore embed/pr+ React commits', () => {
    const content = fs.readFileSync(
      path.join(root, 'src/content-bootstrap.ts'),
      'utf8'
    );
    const host = fs.readFileSync(
      path.join(root, 'src/host/modules/list-row-lifecycle.ts'),
      'utf8'
    );
    const hotkeys = fs.readFileSync(
      path.join(root, 'src/modal/hooks/usePrModalHotkeys.ts'),
      'utf8'
    );
    expect(content).toMatch(/if \(!currentPullsContext\(\)\) return/);
    expect(host).toMatch(/classList\.contains\('prp-embed-active'\)/);
    expect(hotkeys).toMatch(/if \(!open \|\| isEmbed\) return undefined/);
  });

  test('native PR toggle reattaches after GitHub replaces header actions', () => {
    const host = fs.readFileSync(
      path.join(root, 'src/host/modules/host-core-timeline-b.ts'),
      'utf8'
    );
    expect(host).toMatch(/btn\.onclick\s*=\s*\(e\)\s*=>/);
    expect(host).not.toMatch(/btn\.addEventListener\('click'/);
  });
});
