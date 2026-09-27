/**
 * Partner iframe + loopback + detail-cache host gates (shipped SW modules).
 */
import { afterEach, describe, expect, test } from '@rstest/core';
import {
  allowExternalSenderConnected,
  frameEmbedAllowed,
  shellLaunchAllowed,
} from '../src/background/sw-open-pr';
import { hostScopedDetailKey } from '../src/background/sw-detail-cache';
import { MSG } from '../src/sw-messages';

const EXT = 'chrome-extension://abcdefghijklmnop/';

function fakeChrome(origins: string[], session: Record<string, any> = {}) {
  return {
    runtime: { id: 'abcdefghijklmnop', getURL: (p: string) => EXT + p },
    storage: {
      local: {
        get: (_keys: any, cb: any) => cb({ connectedSites: { origins } }),
      },
      session: {
        get: (_keys: any, cb: any) => cb(session),
        set: (v: any, cb: any) => {
          Object.assign(session, v);
          cb?.();
        },
      },
    },
  };
}

const g = globalThis as any;
afterEach(() => {
  delete g.chrome;
});

describe('frameEmbedAllowed', () => {
  const shell = `${EXT}src/shell/shell.html?owner=o&repo=r&number=1`;
  const msg = (origin: string) => ({ type: MSG.FRAME_ALLOWED, origin }) as any;

  test('allows the shell framed by its own top-level Connected site', async () => {
    g.chrome = fakeChrome(['https://linear.app/*']);
    const sender = { url: shell, frameId: 3, tab: { url: 'https://linear.app/team/issue/X-1' } };
    expect(await frameEmbedAllowed(msg('https://linear.app'), sender)).toBe(true);
  });

  test('rejects unconnected sites, spoofed embedders, top frames, other pages', async () => {
    g.chrome = fakeChrome(['https://linear.app/*']);
    const evil = { url: shell, frameId: 3, tab: { url: 'https://evil.example/' } };
    expect(await frameEmbedAllowed(msg('https://evil.example'), evil)).toBe(false);
    // Embedder must be the tab's own origin (no nested third-party frame).
    const nested = { url: shell, frameId: 3, tab: { url: 'https://linear.app/x' } };
    expect(await frameEmbedAllowed(msg('https://ads.example'), nested)).toBe(false);
    const top = { url: shell, frameId: 0, tab: { url: 'https://linear.app/x' } };
    expect(await frameEmbedAllowed(msg('https://linear.app'), top)).toBe(false);
    const notShell = { url: `${EXT}src/popup.html`, frameId: 3, tab: { url: 'https://linear.app/x' } };
    expect(await frameEmbedAllowed(msg('https://linear.app'), notShell)).toBe(false);
  });
});

describe('allowExternalSenderConnected', () => {
  test('loopback pages need Localhost in Connected sites', async () => {
    g.chrome = fakeChrome([]);
    expect(await allowExternalSenderConnected({ origin: 'http://localhost:3000' })).toBe(false);
    g.chrome = fakeChrome(['http://localhost/*', 'http://127.0.0.1/*']);
    expect(await allowExternalSenderConnected({ origin: 'http://localhost:3000' })).toBe(true);
    expect(await allowExternalSenderConnected({ origin: 'https://linear.app' })).toBe(false);
  });
});

describe('hostScopedDetailKey', () => {
  test('github.com keeps bare keys; other hosts are prefixed', () => {
    const key = 'acme/api#12';
    expect(hostScopedDetailKey({ type: MSG.DETAIL_CACHE_GET, key, githubWebHost: 'github.com' } as any)).toBe(key);
    expect(hostScopedDetailKey({ type: MSG.DETAIL_CACHE_GET, key, githubWebHost: 'ghe.corp' } as any)).toBe(
      `ghe.corp|${key}`
    );
  });
});

describe('shellLaunchAllowed', () => {
  const shell = `${EXT}src/shell/shell.html?owner=o&repo=r&number=1&launch=t1`;
  test('only SW-minted tokens, bound to the first tab that presents them', async () => {
    const session: Record<string, any> = {
      prpShellLaunches: { t1: { at: Date.now(), tabId: null } },
    };
    g.chrome = fakeChrome([], session);
    const tab7 = { url: shell, frameId: 0, tab: { id: 7 } };
    expect(await shellLaunchAllowed({ type: MSG.SHELL_LAUNCH_CHECK, launch: 'nope' } as any, tab7)).toBe(false);
    expect(await shellLaunchAllowed({ type: MSG.SHELL_LAUNCH_CHECK, launch: 't1' } as any, tab7)).toBe(true);
    // Reload of the same tab keeps working; another tab cannot replay it.
    expect(await shellLaunchAllowed({ type: MSG.SHELL_LAUNCH_CHECK, launch: 't1' } as any, tab7)).toBe(true);
    const tab8 = { url: shell, frameId: 0, tab: { id: 8 } };
    expect(await shellLaunchAllowed({ type: MSG.SHELL_LAUNCH_CHECK, launch: 't1' } as any, tab8)).toBe(false);
    // Framed shells never auto-open from the query.
    const framed = { url: shell, frameId: 2, tab: { id: 7 } };
    expect(await shellLaunchAllowed({ type: MSG.SHELL_LAUNCH_CHECK, launch: 't1' } as any, framed)).toBe(false);
  });
});
