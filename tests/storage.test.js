const assert = require('node:assert/strict');
const {
  getGithubToken,
  getGithubTokenStatus,
  setGithubToken,
  watchGithubToken,
  maskGithubToken,
  getExtensionPrefs,
  setExtensionPrefs,
  normalizePrefs,
  DEFAULT_PREFS,
  PREFS_KEY,
  HOST_ACCOUNTS_KEY,
  getHostAccounts,
  getHostAccountHosts,
  getHostAccountsPublic,
  registerHostAccount,
  unregisterHostAccount,
  getTokenForWebHost,
  setHostAccounts,
} = require('../src/storage.js');

// Pure selection helpers (same module used by SW)
const {
  selectTokenForWebHost,
  registerHostAccount: pureRegister,
  MAX_HOST_ACCOUNTS,
} = require('../src/github-endpoints.js');

function mockStorage(initial = {}) {
  const data = { ...initial };
  const listeners = [];

  return {
    area: {
      get(keys, cb) {
        const result = {};
        for (const key of keys) {
          if (key in data) result[key] = data[key];
        }
        cb(result);
      },
      set(items, cb) {
        Object.assign(data, items);
        cb();
      },
      remove(keys, cb) {
        for (const key of keys) delete data[key];
        cb();
      },
    },
    api: {
      onChanged: {
        addListener(fn) {
          listeners.push(fn);
        },
        removeListener(fn) {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        },
      },
      _emit(change) {
        for (const fn of listeners) fn(change, 'local');
      },
    },
    data,
  };
}

const PAT_A = 'ghp_' + 'a'.repeat(36);
const PAT_B = 'ghp_' + 'b'.repeat(36);
const PAT_C = 'ghp_' + 'c'.repeat(36);
const PAT_D = 'ghp_' + 'd'.repeat(36);
const PAT_DEFAULT = 'ghp_' + 'z'.repeat(36);

async function main() {
  {
    const { area } = mockStorage();
    assert.equal(await getGithubToken(area), null);
    await setGithubToken(PAT_A, area);
    assert.equal(await getGithubToken(area), PAT_A);
    await setGithubToken('', area);
    assert.equal(await getGithubToken(area), null);
  }

  {
    assert.equal(maskGithubToken('ghp_abcdefghijklmnop'), '••••••••mnop');
    assert.equal(maskGithubToken(''), '');
    assert.ok(!maskGithubToken('ghp_abcdefghijklmnop').includes('ghp_abc'));
  }

  {
    const { area } = mockStorage({ githubToken: 'ghp_' + 'x'.repeat(32) + '1234' });
    const status = await getGithubTokenStatus(area);
    assert.equal(status.configured, true);
    assert.match(status.mask, /••••/);
    assert.match(status.mask, /1234$/);
  }

  {
    const { area } = mockStorage();
    await assert.rejects(
      () => setGithubToken('not-a-token', area),
      /Invalid token format/
    );
  }

  {
    const { api } = mockStorage();
    let seen = null;
    const unwatch = watchGithubToken((token) => {
      seen = token;
    }, api);

    api._emit({ githubToken: { newValue: 'ghp_abc' } });
    assert.equal(seen, 'ghp_abc');
    unwatch();
  }

  {
    assert.equal(DEFAULT_PREFS.fastReview, true);
    assert.equal(DEFAULT_PREFS.reverseComments, true);
    assert.equal('enterpriseWebHosts' in DEFAULT_PREFS, false);
    assert.deepEqual(normalizePrefs(null), DEFAULT_PREFS);
    assert.deepEqual(normalizePrefs({ fastReview: false }), {
      fastReview: false,
      reverseComments: true,
    });
    // Legacy hosts-only list is dropped (re-register with PAT required)
    const legacy = normalizePrefs({
      enterpriseWebHosts: ['ghe.corp.io'],
      reverseComments: false,
    });
    assert.equal(legacy.reverseComments, false);
    assert.equal('enterpriseWebHosts' in legacy, false);
  }

  {
    const { area, data } = mockStorage();
    const defaults = await getExtensionPrefs(area);
    assert.equal(defaults.fastReview, true);
    assert.equal(defaults.reverseComments, true);

    const next = await setExtensionPrefs({ reverseComments: false }, area);
    assert.equal(next.fastReview, true);
    assert.equal(next.reverseComments, false);
    assert.ok(data[PREFS_KEY]);
    assert.equal(data[PREFS_KEY].reverseComments, false);

    const again = await setExtensionPrefs({ fastReview: false }, area);
    assert.equal(again.fastReview, false);
    assert.equal(again.reverseComments, false);
  }

  // --- Multi-account: pure selectTokenForWebHost ---
  {
    const defaultTok = PAT_DEFAULT;
    const accounts = [
      { host: 'ghe.corp.io', token: PAT_A },
      { host: 'octo.ghe.com', token: PAT_B },
    ];

    // (a) github.com → default PAT only
    const cloud = selectTokenForWebHost('github.com', {
      defaultToken: defaultTok,
      hostAccounts: accounts,
    });
    assert.equal(cloud.token, defaultTok);
    assert.equal(cloud.source, 'default');

    // (b) registered enterprise → that host's PAT (not default)
    const reg = selectTokenForWebHost('ghe.corp.io', {
      defaultToken: defaultTok,
      hostAccounts: accounts,
    });
    assert.equal(reg.token, PAT_A);
    assert.equal(reg.source, 'host');

    const gheCloud = selectTokenForWebHost('octo.ghe.com', {
      defaultToken: defaultTok,
      hostAccounts: accounts,
    });
    assert.equal(gheCloud.token, PAT_B);
    assert.equal(gheCloud.source, 'host');

    // (c) unregistered *.ghe.com → no token (default PAT must NOT apply)
    const unreg = selectTokenForWebHost('unknown.ghe.com', {
      defaultToken: defaultTok,
      hostAccounts: accounts,
    });
    assert.equal(unreg.token, null);
    assert.equal(unreg.source, null);

    const unregGhes = selectTokenForWebHost('other.corp.io', {
      defaultToken: defaultTok,
      hostAccounts: accounts,
    });
    assert.equal(unregGhes.token, null);
  }

  // (d) 4th host rejected
  {
    let accounts = [];
    for (const [h, t] of [
      ['a.example.com', PAT_A],
      ['b.example.com', PAT_B],
      ['c.example.com', PAT_C],
    ]) {
      const r = pureRegister(accounts, h, t);
      assert.equal(r.ok, true);
      accounts = r.accounts;
    }
    assert.equal(accounts.length, MAX_HOST_ACCOUNTS);
    const fourth = pureRegister(accounts, 'd.example.com', PAT_D);
    assert.equal(fourth.ok, false);
    assert.match(fourth.error, /at most 3/i);
    assert.equal(fourth.accounts.length, 3);

    // Updating an existing host does not count as 4th
    const update = pureRegister(accounts, 'a.example.com', PAT_D);
    assert.equal(update.ok, true);
    assert.equal(update.accounts.find((x) => x.host === 'a.example.com').token, PAT_D);
  }

  // Storage I/O for host accounts + getTokenForWebHost
  {
    const { area, data } = mockStorage({ githubToken: PAT_DEFAULT });
    assert.deepEqual(await getHostAccounts(area), []);

    const add1 = await registerHostAccount('ghe.corp.io', PAT_A, area);
    assert.equal(add1.ok, true);
    assert.equal(add1.accounts.length, 1);
    assert.ok(data[HOST_ACCOUNTS_KEY]);

    const publicList = await getHostAccountsPublic(area);
    assert.equal(publicList.length, 1);
    assert.equal(publicList[0].host, 'ghe.corp.io');
    assert.match(publicList[0].mask, /••••/);
    assert.ok(!JSON.stringify(publicList).includes(PAT_A));

    const hosts = await getHostAccountHosts(area);
    assert.deepEqual(hosts, ['ghe.corp.io']);

    // github.com uses default
    const selDot = await getTokenForWebHost('github.com', area);
    assert.equal(selDot.token, PAT_DEFAULT);
    assert.equal(selDot.source, 'default');

    // registered host uses pair
    const selHost = await getTokenForWebHost('ghe.corp.io', area);
    assert.equal(selHost.token, PAT_A);
    assert.equal(selHost.source, 'host');

    // unregistered ghe.com → null
    const selGhe = await getTokenForWebHost('acme.ghe.com', area);
    assert.equal(selGhe.token, null);

    await registerHostAccount('h2.example.com', PAT_B, area);
    await registerHostAccount('h3.example.com', PAT_C, area);
    const fourth = await registerHostAccount('h4.example.com', PAT_D, area);
    assert.equal(fourth.ok, false);
    assert.match(fourth.error, /at most 3/i);

    const removed = await unregisterHostAccount('ghe.corp.io', area);
    assert.equal(removed.ok, true);
    assert.equal(removed.accounts.length, 2);
    assert.ok(!removed.accounts.some((a) => a.host === 'ghe.corp.io'));
  }

  // Invalid PAT on host register rejected
  {
    const { area } = mockStorage();
    const bad = await registerHostAccount('ghe.corp.io', 'not-a-token', area);
    assert.equal(bad.ok, false);
    assert.match(bad.error, /Invalid token format/i);
  }

  // At max 3, rotating PAT on an existing host still succeeds (popup update path)
  {
    const { area } = mockStorage();
    await registerHostAccount('a.example.com', PAT_A, area);
    await registerHostAccount('b.example.com', PAT_B, area);
    await registerHostAccount('c.example.com', PAT_C, area);
    const rotated = await registerHostAccount('a.example.com', PAT_D, area);
    assert.equal(rotated.ok, true);
    assert.equal(rotated.accounts.length, 3);
    assert.equal(
      rotated.accounts.find((x) => x.host === 'a.example.com').token,
      PAT_D
    );
    const sel = await getTokenForWebHost('a.example.com', area);
    assert.equal(sel.token, PAT_D);
  }

  // setHostAccounts normalizes
  {
    const { area } = mockStorage();
    const saved = await setHostAccounts(
      [
        { host: 'https://GHE.Example.com/foo', token: PAT_A },
        { host: 'github.com', token: PAT_B }, // dropped
      ],
      area
    );
    assert.deepEqual(saved, [{ host: 'ghe.example.com', token: PAT_A }]);
  }

  console.log('storage.test.js: all assertions passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
