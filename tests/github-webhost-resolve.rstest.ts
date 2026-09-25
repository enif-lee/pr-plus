/**
 * Shipped host-resolution + token selection (not a reimplementation).
 */
import { describe, expect, test } from '@rstest/core';
import '../src/github-endpoints';

const api = (globalThis as any).PRGithubEndpoints;

describe('resolveGithubWebHost + selectTokenForMessage', () => {
  test('exposes shipped helpers', () => {
    expect(typeof api.resolveGithubWebHost).toBe('function');
    expect(typeof api.selectTokenForWebHost).toBe('function');
    expect(typeof api.selectTokenForMessage).toBe('function');
  });

  test('linear.app uses extension active host, not the page hostname', () => {
    const host = api.resolveGithubWebHost(
      { webHost: 'linear.app' },
      { activeGithubWebHost: 'github.com', registeredHosts: [] }
    );
    expect(host).toBe('github.com');
    const sel = api.selectTokenForMessage(
      { webHost: 'linear.app' },
      {
        activeGithubWebHost: 'github.com',
        registeredHosts: [],
        defaultToken: 'ghp_defaulttokenvalue0001',
        hostAccounts: [],
      }
    );
    expect(sel.host).toBe('github.com');
    expect(sel.token).toBe('ghp_defaulttokenvalue0001');
    expect(sel.source).toBe('default');
    expect(
      api.selectTokenForWebHost('linear.app', {
        defaultToken: 'ghp_defaulttokenvalue0001',
        hostAccounts: [],
      }).token
    ).toBe(null);
  });

  test('github.com tab still uses page host', () => {
    expect(
      api.resolveGithubWebHost(
        { webHost: 'github.com' },
        { activeGithubWebHost: 'ghe.example', registeredHosts: ['ghe.example'] }
      )
    ).toBe('github.com');
  });

  test('registered GHES page uses that host', () => {
    expect(
      api.resolveGithubWebHost(
        { webHost: 'ghe.example' },
        { registeredHosts: ['ghe.example'], activeGithubWebHost: 'github.com' }
      )
    ).toBe('ghe.example');
    const sel = api.selectTokenForMessage(
      { webHost: 'ghe.example' },
      {
        registeredHosts: ['ghe.example'],
        activeGithubWebHost: 'github.com',
        defaultToken: 'ghp_defaulttokenvalue0001',
        hostAccounts: [{ host: 'ghe.example', token: 'ghp_ghehosttokenvalue0002' }],
      }
    );
    expect(sel.host).toBe('ghe.example');
    expect(sel.token).toBe('ghp_ghehosttokenvalue0002');
    expect(sel.source).toBe('host');
  });

  test('explicit githubHost / githubWebHost wins over Linear page', () => {
    expect(
      api.resolveGithubWebHost(
        { webHost: 'linear.app', githubHost: 'ghe.example' },
        { registeredHosts: ['ghe.example'], activeGithubWebHost: 'github.com' }
      )
    ).toBe('ghe.example');
  });

  test('api.github.com is not treated as a web host', () => {
    expect(
      api.resolveGithubWebHost(
        { githubWebHost: 'api.github.com' },
        { activeGithubWebHost: 'github.com' }
      )
    ).toBe('github.com');
  });

  test('api.*.ghe.com is rewritten; api.corp.example is kept', () => {
    expect(
      api.resolveGithubWebHost(
        { githubWebHost: 'api.acme.ghe.com' },
        { activeGithubWebHost: 'github.com' }
      )
    ).toBe('github.com');
    expect(
      api.resolveGithubWebHost(
        { githubWebHost: 'api.corp.example' },
        {
          registeredHosts: ['api.corp.example'],
          activeGithubWebHost: 'github.com',
        }
      )
    ).toBe('api.corp.example');
  });

  test('parseGithubPullUrl reads Linear-linked github.com PR hrefs', () => {
    expect(typeof api.parseGithubPullUrl).toBe('function');
    expect(
      api.parseGithubPullUrl('https://github.com/enif-lee/pr-plus/pull/19')
    ).toEqual({
      owner: 'enif-lee',
      repo: 'pr-plus',
      number: 19,
      githubWebHost: 'github.com',
    });
    expect(
      api.parseGithubPullUrl('https://github.com/rtzr/iac/pull/1911')
    ).toMatchObject({ owner: 'rtzr', repo: 'iac', number: 1911 });
    expect(
      api.parseGithubPullUrl('/acme/widgets/pull/7/files', 'https://github.com')
    ).toMatchObject({ owner: 'acme', repo: 'widgets', number: 7 });
    expect(api.parseGithubPullUrl('https://linear.app/mornica/issue/PRP-2')).toBe(
      null
    );
  });

  test('parseLinearReviewPath reads workspace review slugs', () => {
    expect(api.isLinearIssuePath('/mornica/issue/PRP-2/demo')).toBe(true);
    expect(api.isLinearReviewPath('/mornica/review/demo-g-c27ffba33fcd')).toBe(
      true
    );
    expect(api.isLinearReviewPath('/mornica/reviews')).toBe(false);
    expect(
      api.parseLinearReviewPath(
        '/mornica/review/demo-g-stack-root-demo-300-e2e-title-chip-c27ffba33fcd/changes',
        'https://linear.app'
      )
    ).toMatchObject({
      workspace: 'mornica',
      slugId: 'c27ffba33fcd',
      tab: 'changes',
      path: '/mornica/review/demo-g-stack-root-demo-300-e2e-title-chip-c27ffba33fcd',
    });
    expect(
      api.parseLinearReviewPath('https://linear.app/mornica/issue/PRP-2')
    ).toBe(null);
  });

  test('findGithubPullFromClickPath ignores chrome clicks inside pr+ overlay', () => {
    const prLink = {
      tagName: 'A',
      id: '',
      href: 'https://github.com/rtzr/iac/pull/1911',
      getAttribute: (k: string) =>
        k === 'href' ? 'https://github.com/rtzr/iac/pull/1911' : null,
      closest(sel: string) {
        if (sel.startsWith('a')) return this;
        if (String(sel).includes('prp-overlay') || String(sel).includes('prp-modal-host')) {
          return overlay;
        }
        return null;
      },
    };
    const closeBtn: any = {
      tagName: 'BUTTON',
      id: '',
      getAttribute: () => null,
      closest(sel: string) {
        if (String(sel).includes('prp-overlay') || String(sel).includes('prp-modal-host')) {
          return overlay;
        }
        return null;
      },
    };
    const overlay: any = {
      tagName: 'DIV',
      id: 'prp-modal-host',
      classList: { contains: (c: string) => c === 'prp-overlay' },
      getAttribute: () => null,
      closest: () => null,
      parentElement: { tagName: 'BODY' },
      querySelectorAll: (sel: string) => (String(sel).startsWith('a') ? [prLink] : []),
    };
    closeBtn.parentElement = overlay;
    expect(
      api.findGithubPullFromClickPath([closeBtn, overlay], {
        base: 'https://linear.app/',
      })
    ).toBe(null);
    expect(
      api.findGithubPullFromClickPath([prLink, overlay], {
        base: 'https://linear.app/',
      })
    ).toBe(null);
  });

  test('findGithubPullFromClickPath resolves Linear chip wrappers', () => {
    const inner = {
      tagName: 'A',
      href: 'https://github.com/rtzr/iac/pull/1911',
      getAttribute: (k: string) =>
        k === 'href' ? 'https://github.com/rtzr/iac/pull/1911' : null,
      closest(sel: string) {
        return sel.startsWith('a') ? this : null;
      },
    };
    const chip = {
      tagName: 'DIV',
      getAttribute: () => null,
      closest: () => null,
      parentElement: { tagName: 'BODY' },
      querySelectorAll: (sel: string) => (sel.startsWith('a') ? [inner] : []),
    };
    expect(
      api.findGithubPullFromClickPath([chip], { base: 'https://linear.app/' })
    ).toEqual({
      owner: 'rtzr',
      repo: 'iac',
      number: 1911,
      githubWebHost: 'github.com',
    });
  });

  test('findGithubPullFromClickPath does not treat Linear review chrome as a PR chip', () => {
    const prLink = {
      tagName: 'A',
      href: 'https://github.com/enif-lee/pr-plus/pull/19',
      getAttribute: (k: string) =>
        k === 'href' ? 'https://github.com/enif-lee/pr-plus/pull/19' : null,
      closest: () => null,
    };
    const header = {
      tagName: 'DIV',
      childElementCount: 20,
      getAttribute: () => null,
      closest: () => null,
      parentElement: { tagName: 'BODY' },
      querySelectorAll: (sel: string) =>
        String(sel).startsWith('a') ? [prLink] : [],
    };
    const mergeBtn: any = {
      tagName: 'BUTTON',
      getAttribute: () => null,
      closest: () => null,
      parentElement: header,
    };
    expect(
      api.findGithubPullFromClickPath([mergeBtn, header], {
        base: 'https://linear.app/mornica/review/demo-g-c27ffba33fcd',
      })
    ).toBe(null);
  });

  test('findLinearReviewHrefFromClickPath reads issue Diffs cards', () => {
    const card = {
      tagName: 'A',
      href: '/mornica/review/largest-pr-test-10c61e25f2c2',
      getAttribute: (k: string) =>
        k === 'href' ? '/mornica/review/largest-pr-test-10c61e25f2c2' : null,
      closest(sel: string) {
        return sel.startsWith('a') ? this : null;
      },
    };
    expect(
      api.findLinearReviewHrefFromClickPath([card], {
        base: 'https://linear.app/mornica/issue/PRP-2',
      })
    ).toBe('https://linear.app/mornica/review/largest-pr-test-10c61e25f2c2');
  });

  test('unregistered GHES page falls back to active host', () => {
    expect(
      api.resolveGithubWebHost(
        { webHost: 'ghe.unknown' },
        { registeredHosts: [], activeGithubWebHost: 'github.com' }
      )
    ).toBe('github.com');
  });
});
