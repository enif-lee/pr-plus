const assert = require('node:assert/strict');
const {
  distinctStatuses,
  distinctCheckRuns,
  normalizeChecks,
  deriveChecksState,
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

console.log('checks.test.js: all assertions passed');
