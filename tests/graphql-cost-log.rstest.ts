/**
 * GraphQL cost observation helpers — drive shipped pure module.
 */
import { describe, expect, test } from '@rstest/core';
import {
  injectRateLimitCostField,
  labelGraphqlOperation,
  sanitizeGraphqlVariables,
  summarizeGraphqlCostEntries,
} from '../src/modal/lib/graphql-cost-log.ts';

describe('injectRateLimitCostField (shipped pure)', () => {
  test('injects rateLimit cost field once', () => {
    const q = `query($owner:String!){\n  repository(owner:$owner){ id }\n}`;
    const out = injectRateLimitCostField(q);
    expect(out).toMatch(/rateLimit\s*\{\s*cost/);
    expect(out).toMatch(/repository/);
    // idempotent
    expect(injectRateLimitCostField(out)).toBe(out);
  });

  test('does not inject rateLimit into mutations (Query-only field)', () => {
    const mut = `mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread { id isResolved } } }`;
    expect(injectRateLimitCostField(mut)).toBe(mut);
    const mut2 = `mutation Unresolve($id:ID!){\n  unresolveReviewThread(input:{threadId:$id}){ thread { id } }\n}`;
    expect(injectRateLimitCostField(mut2)).toBe(mut2);
  });
});

describe('labelGraphqlOperation (shipped pure)', () => {
  test('names and heuristics', () => {
    expect(
      labelGraphqlOperation(`query ViewerViewedFiles { repository { id } }`)
    ).toBe('ViewerViewedFiles');
    // Shell window (no nested comments) vs legacy full window
    expect(
      labelGraphqlOperation(`query {
      repository { pullRequest { reviewThreads(last:10) { nodes { id } } } }
    }`)
    ).toBe('reviewThreads.last.shell');
    expect(
      labelGraphqlOperation(`query {
      repository { pullRequest { reviewThreads(last:10) { nodes { id comments(first:100){ nodes { id } } } } } }
    }`)
    ).toBe('reviewThreads.last');
    expect(
      labelGraphqlOperation(`query {
      nodes(ids:$ids) { ... on PullRequestReviewThread { id } }
    }`)
    ).toBe('reviewThreads.byIds');
    expect(
      labelGraphqlOperation(`query { projectItems(first:20) { nodes { id } } }`)
    ).toMatch(/sidebarMeta|projectItems/);
  });
});

describe('summarizeGraphqlCostEntries (shipped pure)', () => {
  test('aggregates by op and ranks by cost', () => {
    const sum = summarizeGraphqlCostEntries([
      { op: 'reviewThreads.last', cost: 100, ms: 200 },
      { op: 'reviewThreads.last', cost: 50, ms: 100 },
      { op: 'subscription.read', cost: 1, ms: 40 },
      { op: 'viewerViewedFiles', cost: 2, ms: 80 },
      { op: 'viewerViewedFiles', cost: 2, ms: 90 },
      { op: 'broken', cost: null, ms: 10 },
    ]);
    expect(sum.totalCalls).toBe(6);
    expect(sum.totalCost).toBe(155);
    expect(sum.unknownCostCalls).toBe(1);
    expect(sum.byOp[0].op).toBe('reviewThreads.last');
    expect(sum.byOp[0].cost).toBe(150);
    expect(sum.byOp[0].calls).toBe(2);
    expect(sum.byOp[0].maxCost).toBe(100);
  });
});

describe('sanitizeGraphqlVariables', () => {
  test('keeps ids count not full list', () => {
    const s = sanitizeGraphqlVariables({
      owner: 'enif-lee',
      number: 7,
      ids: ['PRRT_a', 'PRRT_b', 'PRRT_c', 'PRRT_d'],
      body: 'secret',
    });
    expect(s.owner).toBe('enif-lee');
    expect(s.number).toBe(7);
    expect(s.idsCount).toBe(4);
    expect(s.body).toBeUndefined();
  });
});
