const assert = require('node:assert/strict');
const {
  getGithubToken,
  getGithubTokenStatus,
  setGithubToken,
  watchGithubToken,
  maskGithubToken,
} = require('../src/storage.js');

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

async function main() {
  {
    const { area } = mockStorage();
    assert.equal(await getGithubToken(area), null);
    const sample = 'ghp_' + 'a'.repeat(36);
    await setGithubToken(sample, area);
    assert.equal(await getGithubToken(area), sample);
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

  console.log('storage.test.js: all assertions passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});