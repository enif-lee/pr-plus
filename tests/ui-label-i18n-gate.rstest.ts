/**
 * Touched conversation badges use t(...); Agents.md documents UI-label i18n rule.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@rstest/core';
import { formatMessage, getCatalog } from '../src/modal/lib/i18n';

const root = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('UI label i18n (touched surfaces + Agents policy)', () => {
  test('ConversationView badges / review-group narrative use t()', () => {
    const view = read('src/modal/views/conversation/ConversationView.tsx');
    expect(view).toMatch(/useT\s*\(/);
    expect(view).toMatch(/t\(['"]pending['"]\)/);
    expect(view).toMatch(/t\(['"]resolved['"]\)/);
    expect(view).toMatch(/t\(['"]outdated['"]\)/);
    expect(view).toMatch(/t\(['"]review_group_action_approved['"]\)/);
    expect(view).toMatch(/t\(['"]review_group_action_changes_requested['"]\)/);
    expect(view).toMatch(/t\(['"]review_group_action_commented['"]\)/);
    // No hard-coded badge English left in the group path-row badges
    expect(view).not.toMatch(
      /<Badge[^>]*>\s*Pending\s*<\/Badge>/
    );
    expect(view).not.toMatch(
      /<Badge[^>]*>\s*Outdated\s*<\/Badge>/
    );
    expect(view).not.toMatch(
      /<Badge[^>]*>\s*Resolved\s*<\/Badge>/
    );
  });

  test('catalogs ship outdated + review_group_action keys (en/ko)', () => {
    const en = getCatalog('en');
    const ko = getCatalog('ko');
    expect(en.outdated).toBeTruthy();
    expect(ko.outdated).toBeTruthy();
    expect(en.review_group_action_commented).toMatch(/comment/i);
    expect(ko.review_group_action_commented).toBeTruthy();
    expect(formatMessage('pending', 'en')).toBe('Pending');
    expect(formatMessage('pending', 'ko')).toBeTruthy();
  });

  test('Agents.md requires UI labels to use i18n', () => {
    const agents = read('Agents.md');
    expect(agents).toMatch(/UI labels \(i18n\)/i);
    expect(agents).toMatch(/useT\(\)/);
    expect(agents).toMatch(/must.*i18n|i18n.*must|must.*useT/i);
  });
});
