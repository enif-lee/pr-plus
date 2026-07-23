const assert = require('node:assert/strict');
const {
  distinctStatuses,
  distinctCheckRuns,
  normalizeChecks,
  deriveChecksState,
  classifyCheckOutcome,
  formatDurationMs,
  formatRelativeAgo,
  formatCheckSummary,
  buildMergeBoxCheckGroups,
  mergeBoxChecksHeadline,
} = require('../src/modal/pure/checks.js');

// Statuses: same context → keep latest updatedAt
{
  const out = distinctStatuses([
    {
      context: 'ci/travis',
      state: 'failure',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      context: 'ci/travis',
      state: 'success',
      updatedAt: '2024-01-02T00:00:00Z',
    },
    {
      context: 'coverage',
      state: 'success',
      updatedAt: '2024-01-01T12:00:00Z',
    },
  ]);
  assert.equal(out.length, 2);
  const travis = out.find((s) => s.context === 'ci/travis');
  assert.equal(travis.state, 'success');
}

// Check runs: same name → keep latest completedAt / higher id
{
  const out = distinctCheckRuns([
    {
      id: 1,
      name: 'build',
      status: 'completed',
      conclusion: 'failure',
      completedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 3,
      name: 'build',
      status: 'completed',
      conclusion: 'success',
      completedAt: '2024-01-03T00:00:00Z',
    },
    {
      id: 2,
      name: 'build',
      status: 'completed',
      conclusion: 'failure',
      completedAt: '2024-01-02T00:00:00Z',
    },
    {
      id: 10,
      name: 'lint',
      status: 'completed',
      conclusion: 'success',
      completedAt: '2024-01-01T00:00:00Z',
    },
  ]);
  assert.equal(out.length, 2);
  const build = out.find((r) => r.name === 'build');
  assert.equal(build.id, 3);
  assert.equal(build.conclusion, 'success');
}

// Same name from different apps stay separate
{
  const out = distinctCheckRuns([
    { id: 1, name: 'test', appSlug: 'github-actions', conclusion: 'success' },
    { id: 2, name: 'test', appSlug: 'circleci', conclusion: 'failure' },
  ]);
  assert.equal(out.length, 2);
}

// normalizeChecks rewrites totalCount + state from distinct lists
{
  const n = normalizeChecks({
    state: 'pending',
    totalCount: 99,
    statuses: [
      { context: 'a', state: 'success', updatedAt: '2024-01-02T00:00:00Z' },
      { context: 'a', state: 'failure', updatedAt: '2024-01-01T00:00:00Z' },
    ],
    checkRuns: [
      {
        id: 1,
        name: 'job',
        status: 'completed',
        conclusion: 'success',
        completedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 2,
        name: 'job',
        status: 'completed',
        conclusion: 'failure',
        completedAt: '2024-01-02T00:00:00Z',
      },
    ],
  });
  assert.equal(n.statuses.length, 1);
  assert.equal(n.statuses[0].state, 'success');
  assert.equal(n.checkRuns.length, 1);
  assert.equal(n.checkRuns[0].conclusion, 'failure');
  assert.equal(n.totalCount, 2);
  assert.equal(n.state, 'failure');
}

// deriveChecksState pending
assert.equal(
  deriveChecksState([], [{ name: 'x', status: 'in_progress', conclusion: '' }]),
  'pending'
);

// classify + duration helpers
assert.equal(classifyCheckOutcome({ kind: 'status', state: 'failure' }), 'failure');
assert.equal(classifyCheckOutcome({ conclusion: 'skipped' }), 'skipped');
assert.equal(classifyCheckOutcome({ conclusion: 'success' }), 'success');
assert.equal(classifyCheckOutcome({ status: 'in_progress', conclusion: '' }), 'pending');
assert.equal(formatDurationMs(9000), '9s');
assert.equal(formatDurationMs(9 * 60 * 1000), '9m');
assert.ok(/minute/.test(formatRelativeAgo(Date.now() - 20 * 60 * 1000, Date.now())));

// formatCheckSummary mirrors GitHub copy
assert.equal(
  formatCheckSummary({
    outcome: 'failure',
    startedAt: '2024-01-01T00:00:00Z',
    completedAt: '2024-01-01T00:09:00Z',
  }),
  'Failing after 9m'
);
assert.equal(
  formatCheckSummary({
    outcome: 'success',
    startedAt: '2024-01-01T00:00:00Z',
    completedAt: '2024-01-01T00:00:10Z',
  }),
  'Successful in 10s'
);
assert.ok(
  /Skipped/.test(
    formatCheckSummary(
      {
        outcome: 'skipped',
        completedAt: '2024-01-01T00:00:00Z',
      },
      Date.parse('2024-01-01T00:20:00Z')
    )
  )
);

// merge-box groups: failing → skipped → successful order
{
  const g = buildMergeBoxCheckGroups(
    {
      state: 'failure',
      statuses: [],
      checkRuns: [
        {
          id: 1,
          name: 'CI / test',
          status: 'completed',
          conclusion: 'failure',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:09:00Z',
        },
        {
          id: 2,
          name: 'CI / claude-review',
          status: 'completed',
          conclusion: 'skipped',
          completedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 3,
          name: 'CI / changes',
          status: 'completed',
          conclusion: 'success',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:00:10Z',
        },
        {
          id: 4,
          name: 'CI / check',
          status: 'completed',
          conclusion: 'success',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:00:22Z',
        },
        {
          id: 5,
          name: 'Push to Gitlab / gitlab-sync',
          status: 'completed',
          conclusion: 'success',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:00:13Z',
        },
      ],
    },
    { nowMs: Date.parse('2024-01-01T00:20:00Z') }
  );
  assert.equal(g.totalCount, 5);
  assert.deepEqual(
    g.groups.map((x) => x.key),
    ['failure', 'skipped', 'success']
  );
  assert.equal(g.groups[0].label, '1 failing check');
  assert.equal(g.groups[1].label, '1 skipped check');
  assert.equal(g.groups[2].label, '3 successful checks');
  assert.equal(g.groups[0].items[0].summary, 'Failing after 9m');
  assert.equal(g.groups[2].items[0].summary, 'Successful in 10s');
  assert.equal(mergeBoxChecksHeadline('failure', 5), 'Some checks were not successful');
  assert.equal(mergeBoxChecksHeadline('success', 3), 'All checks have passed');
}

console.log('checks.test.js: all assertions passed');
