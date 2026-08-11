/**
 * Embed GH SPA keyboard isolation — host wiring + pure event list.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PAGE_EMBED_KEY_SHIELD_EVENTS,
} from '../src/modal/lib/page-embed';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('PAGE_EMBED_KEY_SHIELD_EVENTS', () => {
  test('covers keydown/keyup/keypress', () => {
    expect(PAGE_EMBED_KEY_SHIELD_EVENTS).toContain('keydown');
    expect(PAGE_EMBED_KEY_SHIELD_EVENTS).toContain('keyup');
    expect(PAGE_EMBED_KEY_SHIELD_EVENTS).toContain('keypress');
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
  });

  test('shipped pure exports PAGE_EMBED_KEY_SHIELD_EVENTS', () => {
    const pure = fs.readFileSync(
      path.join(root, 'src/modal/pure/page-embed.js'),
      'utf8'
    );
    expect(pure).toMatch(/PAGE_EMBED_KEY_SHIELD_EVENTS/);
  });
});
