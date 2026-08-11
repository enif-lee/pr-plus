/**
 * PENDING review comments must edit via GraphQL (REST PATCH → 404).
 * Exercises shipped editReviewComment (not a reimplementation).
 */
import { describe, expect, test } from '@rstest/core';
import { editReviewComment } from '../src/fetch/mutations-meta';

describe('editReviewComment pending → GraphQL', () => {
  test('uses GraphQL when nodeId PRRC_ is provided (skips REST)', async () => {
    const calls: Array<{ url: string; body?: any }> = [];
    const fetchImpl = async (url: string, init: any = {}) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      calls.push({ url: String(url), body });
      // GraphQL endpoint
      if (String(url).includes('graphql')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              updatePullRequestReviewComment: {
                pullRequestReviewComment: {
                  databaseId: 3744455086,
                  body: 'edited via gql',
                  id: 'PRRC_kw_test',
                },
              },
            },
          }),
        };
      }
      // Should not hit REST when nodeId present
      return {
        ok: false,
        status: 404,
        json: async () => ({ message: 'Not Found' }),
      };
    };
    const result = await editReviewComment(
      'enif-lee',
      'pr-plus',
      3744455086,
      'edited via gql',
      fetchImpl,
      'token',
      null,
      { nodeId: 'PRRC_kw_test' }
    );
    expect(calls.length).toBe(1);
    expect(calls[0].url).toMatch(/graphql/i);
    expect(calls[0].body?.query || '').toMatch(/updatePullRequestReviewComment/i);
    expect(calls[0].body?.variables).toEqual({
      id: 'PRRC_kw_test',
      body: 'edited via gql',
    });
    expect(result.body).toBe('edited via gql');
    expect(Number(result.id)).toBe(3744455086);
  });

  test('REST 404 resolves node via pending review comments then GraphQL mutates', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string, init: any = {}) => {
      const u = String(url);
      calls.push(u);
      if (u.includes('graphql')) {
        const body = init?.body ? JSON.parse(init.body) : {};
        if (String(body.query || '').includes('updatePullRequestReviewComment')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                updatePullRequestReviewComment: {
                  pullRequestReviewComment: {
                    databaseId: 3744455086,
                    body: 'after-404',
                    id: 'PRRC_resolved',
                  },
                },
              },
            }),
          };
        }
        // resolve query — empty so REST path is used
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { repository: { pullRequest: { reviews: { nodes: [] } } } } }),
        };
      }
      // PATCH comment → 404
      if (u.includes('/pulls/comments/3744455086') && (init?.method || 'GET') === 'PATCH') {
        return {
          ok: false,
          status: 404,
          json: async () => ({ message: 'Not Found' }),
          text: async () => 'Not Found',
        };
      }
      // GET single comment → 404
      if (u.includes('/pulls/comments/3744455086')) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ message: 'Not Found' }),
          text: async () => 'Not Found',
        };
      }
      // List reviews
      if (/\/pulls\/19\/reviews(\?|$)/.test(u)) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 4891869485, state: 'PENDING', user: { login: 'enif-lee' } }],
        };
      }
      // Review comments with node_id
      if (u.includes('/reviews/4891869485/comments')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 3744455086,
              node_id: 'PRRC_resolved',
              body: 'pending',
            },
          ],
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ([]),
      };
    };
    const result = await editReviewComment(
      'enif-lee',
      'pr-plus',
      3744455086,
      'after-404',
      fetchImpl,
      'token',
      null,
      { pullNumber: 19 }
    );
    expect(result.body).toBe('after-404');
    expect(calls.some((u) => /graphql/i.test(u))).toBe(true);
    expect(
      calls.some((u) => /reviews\/4891869485\/comments/.test(u))
    ).toBe(true);
  });

  test('published REST edit path still works without nodeId', async () => {
    const calls: string[] = [];
    const fetchRest = async (url: string) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 1, body: 'rest-ok' }),
      };
    };
    const rest = await editReviewComment(
      'enif-lee',
      'pr-plus',
      1,
      'rest-ok',
      fetchRest,
      'token',
      null,
      null
    );
    expect(rest.body).toBe('rest-ok');
    expect(calls.some((u) => /pulls\/comments\/1/.test(u))).toBe(true);
  });

  test('domain-mutations passes nodeId into editReviewComment (structural)', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/modal/commands/domain-mutations.ts'),
      'utf8'
    );
    expect(src).toMatch(/editReviewComment\([\s\S]*nodeId/);
    expect(src).toMatch(/row\?\.nodeId|row\?\.node_id/);
  });
});
