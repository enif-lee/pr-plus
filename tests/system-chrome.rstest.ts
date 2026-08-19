import { describe, expect, test } from '@rstest/core';
import { existsSync } from 'node:fs';
import { resolveSystemChrome } from '../scripts/system-chrome.mjs';

describe('system Chrome for browser tests', () => {
  test('resolves installed Google Chrome, not Chrome for Testing', () => {
    const exe = resolveSystemChrome();
    expect(exe).toBeTruthy();
    expect(existsSync(exe)).toBe(true);
    expect(exe).not.toMatch(/chrome for testing/i);
    expect(exe).not.toMatch(/chrome-headless-shell/i);
  });

  test('ignores AGENT_BROWSER_EXECUTABLE_PATH when it is Chrome for Testing', () => {
    const env = {
      ...process.env,
      AGENT_BROWSER_EXECUTABLE_PATH:
        '/Users/ed/.agent-browser/browsers/chrome-150.0.7871.24/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      PRP_CHROME_PATH: '',
    };
    delete env.PRP_CHROME_PATH;
    const exe = resolveSystemChrome(env);
    expect(exe).not.toMatch(/chrome for testing/i);
  });
});
