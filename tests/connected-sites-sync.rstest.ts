/**
 * Re-syncing partner content scripts must replace live registrations.
 * Chrome's unregisterContentScripts rejects the whole call (removing nothing)
 * if any id is missing — passing the legacy Linear id broke every re-sync
 * with "Duplicate script ID" once a site was connected.
 */
import { afterEach, describe, expect, test } from '@rstest/core';
import { syncPartnerContentScripts } from '../src/background/sw-connected-sites';

function fakeScripting() {
  const live = new Map<string, any>();
  return {
    live,
    async getRegisteredContentScripts(filter?: { ids?: string[] }) {
      const all = [...live.values()];
      return filter?.ids ? all.filter((s) => filter.ids!.includes(s.id)) : all;
    },
    async unregisterContentScripts(filter: { ids: string[] }) {
      const missing = filter.ids.find((id) => !live.has(id));
      if (missing) throw new Error(`Nonexistent script ID '${missing}'`);
      for (const id of filter.ids) live.delete(id);
    },
    async registerContentScripts(scripts: any[]) {
      const dup = scripts.find((s) => live.has(s.id));
      if (dup) throw new Error(`Duplicate script ID '${dup.id}'`);
      for (const s of scripts) live.set(s.id, s);
    },
  };
}

describe('syncPartnerContentScripts', () => {
  const g = globalThis as any;
  afterEach(() => {
    delete g.chrome;
  });

  test('adding a second site replaces the live registration', async () => {
    const scripting = fakeScripting();
    g.chrome = { scripting };
    await syncPartnerContentScripts(['https://linear.app/*']);
    const r = await syncPartnerContentScripts([
      'https://linear.app/*',
      'https://getbootstrap.com/*',
    ]);
    expect(r.registered).toBe(true);
    for (const s of scripting.live.values()) {
      expect(s.matches).toEqual(['https://linear.app/*', 'https://getbootstrap.com/*']);
    }
  });

  test('removing the last site clears registrations', async () => {
    const scripting = fakeScripting();
    g.chrome = { scripting };
    await syncPartnerContentScripts(['https://linear.app/*']);
    await syncPartnerContentScripts([]);
    expect(scripting.live.size).toBe(0);
  });
});
