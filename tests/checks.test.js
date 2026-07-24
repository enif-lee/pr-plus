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
  summarizeCheckCounts,
  formatChecksCountLabel,
  listCheckNamesByOutcome,
  formatCheckGroupTip,
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

// summarizeCheckCounts: success-only
{
  const s = summarizeCheckCounts({
    checkRuns: [
      { id: 1, name: 'a', status: 'completed', conclusion: 'success' },
      { id: 2, name: 'b', status: 'completed', conclusion: 'success' },
      { id: 3, name: 'c', status: 'completed', conclusion: 'skipped' },
    ],
    statuses: [],
  });
  assert.equal(s.total, 3);
  assert.equal(s.success, 2);
  assert.equal(s.failure, 0);
  assert.equal(s.pending, 0);
  assert.equal(s.skipped, 1);
  assert.equal(s.state, 'success');
  const label = formatChecksCountLabel(s);
  assert.match(label, /3 checks/);
  assert.match(label, /2 succeeded/);
  assert.match(label, /0 failed/);
  assert.match(label, /0 in progress/);
  assert.match(label, /1 skipped/);
}

// summarizeCheckCounts: mixed fail + pending
{
  const s = summarizeCheckCounts({
    statuses: [{ context: 'deploy', state: 'pending' }],
    checkRuns: [
      { id: 1, name: 'build', status: 'completed', conclusion: 'failure' },
      { id: 2, name: 'lint', status: 'in_progress', conclusion: '' },
      { id: 3, name: 'unit', status: 'completed', conclusion: 'success' },
    ],
  });
  assert.equal(s.total, 4);
  assert.equal(s.success, 1);
  assert.equal(s.failure, 1);
  assert.equal(s.pending, 2);
  assert.equal(s.state, 'failure');
  const label = formatChecksCountLabel(s);
  assert.match(label, /4 checks/);
  assert.match(label, /1 succeeded/);
  assert.match(label, /1 failed/);
  assert.match(label, /2 in progress/);
}

// summarizeCheckCounts: pending-only
{
  const s = summarizeCheckCounts({
    statuses: [{ context: 'ci', state: 'pending' }],
    checkRuns: [{ id: 9, name: 'job', status: 'queued', conclusion: null }],
  });
  assert.equal(s.total, 2);
  assert.equal(s.success, 0);
  assert.equal(s.failure, 0);
  assert.equal(s.pending, 2);
  assert.equal(s.state, 'pending');
}

// Empty combined status (GitHub default state:"pending", total_count:0) is not in-progress
{
  const n = normalizeChecks({
    state: 'pending',
    totalCount: 0,
    statuses: [],
    checkRuns: [],
  });
  assert.equal(n.state, 'unknown');
  assert.equal(n.totalCount, 0);
  assert.equal(deriveChecksState([], [], 'pending'), 'unknown');
  const s = summarizeCheckCounts({
    state: 'pending',
    totalCount: 0,
    statuses: [],
    checkRuns: [],
  });
  assert.equal(s.total, 0);
  assert.equal(s.state, 'unknown');
  assert.equal(formatChecksCountLabel(s), 'No checks');
}

// listCheckNamesByOutcome + group tip for stacked icons
{
  const by = listCheckNamesByOutcome({
    statuses: [{ context: 'deploy/prod', state: 'pending' }],
    checkRuns: [
      { id: 1, name: 'CI / test', status: 'completed', conclusion: 'failure' },
      { id: 2, name: 'lint', status: 'completed', conclusion: 'success' },
      { id: 3, name: 'docs', status: 'completed', conclusion: 'skipped' },
    ],
  });
  assert.deepEqual(by.failure, ['CI / test']);
  assert.deepEqual(by.pending, ['deploy/prod']);
  assert.deepEqual(by.success, ['lint']);
  assert.deepEqual(by.skipped, ['docs']);
  const tip = formatCheckGroupTip('failure', by.failure);
  assert.match(tip, /1 failed/);
  assert.match(tip, /CI \/ test/);
}

// UI wiring: details as icon, stacked group icons (static source)
{
  const fs = require('node:fs');
  const path = require('node:path');
  const panel = fs.readFileSync(
    path.join(__dirname, '../src/modal/views/conversation/ChecksPanel.tsx'),
    'utf8'
  );
  assert.ok(!/>\s*details\s*</.test(panel), 'ChecksPanel must not use details text link');
  assert.ok(panel.includes('IconLinkExternal'), 'ChecksPanel uses external-link icon');
  assert.ok(
    panel.includes('CheckOutcomeIcon') && !panel.includes('Badge'),
    'ChecksPanel uses outcome icons instead of success/skipped text badges'
  );
  // Expanded panel: no summary stack component usage (only icon import)
  assert.ok(
    !panel.includes('<ChecksSummary') && !panel.includes('jsx)(ChecksSummary'),
    'ChecksPanel does not render summary stack'
  );
  // Compact rail still shows the summary stack when collapsed
  const compact = fs.readFileSync(
    path.join(__dirname, '../src/modal/views/conversation/AsideCompactRail.tsx'),
    'utf8'
  );
  assert.ok(
    compact.includes('ChecksSummary'),
    'collapsed compact rail shows ChecksSummary stack'
  );
  const summaryUi = fs.readFileSync(
    path.join(__dirname, '../src/modal/views/conversation/ChecksSummary.tsx'),
    'utf8'
  );
  assert.ok(summaryUi.includes('TipPopover'), 'ChecksSummary has hover popover');
  assert.ok(summaryUi.includes('prp-checks-summary-stack'), 'stacked outcome icons');
  assert.ok(summaryUi.includes('listCheckNamesByOutcome'), 'names per outcome for tips');
  assert.ok(summaryUi.includes('formatCheckGroupTip'), 'group tip lists check names');
  assert.ok(summaryUi.includes('prp-checks-summary-icon--spin'), 'pending animates');
  const header = fs.readFileSync(
    path.join(__dirname, '../src/modal/views/chrome/Header.tsx'),
    'utf8'
  );
  assert.ok(!/checks:\s*\{/.test(header), 'Header must not print checks: {state}');
  assert.ok(header.includes('ChecksSummary'), 'Header uses ChecksSummary');
}

console.log('checks.test.js: all assertions passed');
console.log('checks-summary-counts=true');
