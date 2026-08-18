/**
 * Bridge + SW share one MSG module; page-send types are not independent literals.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { MSG, isSwMessage } from '../src/sw-messages';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('shared SW message contract', () => {
  test('MSG is the single imported contract', () => {
    expect(MSG.FETCH_REVIEW_THREADS_PAGE).toBe(
      'PR_TREE_FETCH_REVIEW_THREADS_PAGE'
    );
    expect(MSG.PING).toBe('PR_TREE_PING');
    const ent = read('src/background/sw-enterprise.ts');
    const handle = read('src/background/sw-handle-message.ts');
    const partA = read('src/content-bridge/bridge-fetch-part-a.ts');
    const partB = read('src/content-bridge/bridge-fetch-part-b.ts');
    const channel = read('src/content-bridge/bridge-channel.ts');
    expect(ent).toMatch(/from ['\"]\.\.\/sw-messages['\"]/);
    expect(handle).toMatch(/from ['\"]\.\.\/sw-messages['\"]/);
    expect(handle).toMatch(/handleMessage\(\s*message: SwMessage/);
    expect(handle).not.toMatch(/handleMessage\(message:\s*any\)/);
    expect(partA).toMatch(/from ['\"]\.\.\/sw-messages['\"]/);
    expect(partB).toMatch(/from ['\"]\.\.\/sw-messages['\"]/);
    expect(channel).toMatch(/from ['\"]\.\.\/sw-messages['\"]/);
    expect(partA).toMatch(/type:\s*MSG\.FETCH_REVIEW_THREADS_PAGE/);
    expect(partA).not.toMatch(/type:\s*['\"]PR_TREE_FETCH_REVIEW_THREADS_PAGE['\"]/);
  });

  test('isSwMessage rejects untyped bags', () => {
    expect(isSwMessage(null)).toBe(false);
    expect(isSwMessage({ type: 'PR_TREE_PING' })).toBe(true);
    expect(isSwMessage({ foo: 1 })).toBe(false);
  });
});
