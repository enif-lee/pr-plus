/**
 * github.com static content_scripts and Enterprise registration share one list.
 */
import { describe, expect, test } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import {
  CONTENT_SCRIPT_CSS,
  CONTENT_SCRIPT_JS,
} from '../src/content-scripts-list';

const root = path.join(__dirname, '..');

describe('content-script injection lists', () => {
  test('manifest content_scripts match the shared list', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')
    );
    const cs = manifest.content_scripts[0];
    expect(cs.js).toEqual([...CONTENT_SCRIPT_JS]);
    expect(cs.css).toEqual([...CONTENT_SCRIPT_CSS]);
  });

  test('shared list includes i18n / timeline / review-threads / modal CSS', () => {
    const js = [...CONTENT_SCRIPT_JS];
    for (const name of [
      'src/modal/pure/rate-limit.js',
      'src/modal/pure/graphql-cost-log.js',
      'src/modal/pure/open-pulls-lifecycle.js',
      'src/modal/pure/conversation-timeline.js',
      'src/modal/pure/review-threads.js',
      'src/modal/pure/locale-resolve.js',
      'src/modal/pure/i18n.js',
    ]) {
      expect(js).toContain(name);
    }
    expect([...CONTENT_SCRIPT_CSS]).toContain('src/modal/dist/pr-modal.css');
  });

  test('Enterprise SW registration imports the same lists', () => {
    const ent = fs.readFileSync(
      path.join(root, 'src/background/sw-enterprise.ts'),
      'utf8'
    );
    expect(ent).toMatch(/from ['\"]\.\.\/content-scripts-list['\"]/);
    expect(ent).toMatch(/CONTENT_SCRIPT_CSS/);
    expect(ent).not.toMatch(/css:\s*\[['\"]src\/styles\.css['\"]\]/);
  });

  test('WAR omits the already-injected modal bundle; optional HTTP host is gone', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')
    );
    const war = JSON.stringify(manifest.web_accessible_resources || []);
    expect(war).not.toMatch(/pr-modal\.bundle\.js/);
    expect(manifest.optional_host_permissions || []).not.toContain('http://*/*');
    expect(manifest.optional_host_permissions || []).toContain('https://*/*');
  });
});
