/**
 * Document scroll lock must not make <body> a scroll container: GitHub's new
 * pulls list sidebar is position:sticky and jumps by scrollY when body clips.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';
import { JSDOM } from 'jsdom';
import {
  applyScrollLock,
  restoreScrollLock,
  SCROLL_LOCK_CLASS,
} from '../src/modal/lib/scroll-lock';

describe('scroll lock', () => {
  test('locks <html> only and restores it', () => {
    const doc = new JSDOM('<!doctype html><html><body></body></html>').window.document;
    doc.body.style.overflow = 'auto';
    const snap = applyScrollLock(doc, { scrollbarWidth: 15 });
    expect(doc.documentElement.style.overflow).toBe('hidden');
    expect(doc.body.style.overflow).toBe('auto');
    expect(doc.body.style.paddingRight).toBe('15px');
    expect(doc.documentElement.classList.contains(SCROLL_LOCK_CLASS)).toBe(true);

    restoreScrollLock(doc, snap);
    expect(doc.documentElement.style.overflow).toBe('');
    expect(doc.body.style.paddingRight).toBe('');
    expect(doc.documentElement.classList.contains(SCROLL_LOCK_CLASS)).toBe(false);
  });

  test('CSS lock rule does not target body', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../src/modal/styles/tokens.css'),
      'utf8'
    );
    expect(css).toMatch(/html\.prp-scroll-lock\s*\{/);
    expect(css).not.toMatch(/html\.prp-scroll-lock\s+body/);
  });
});
