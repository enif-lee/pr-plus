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

  test('unregistered GHES page falls back to active host', () => {
    expect(
      api.resolveGithubWebHost(
        { webHost: 'ghe.unknown' },
        { registeredHosts: [], activeGithubWebHost: 'github.com' }
      )
    ).toBe('github.com');
  });
});
