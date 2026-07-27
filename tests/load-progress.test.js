/**
 * Percent-based load stages + animated counter helpers.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  percentFromStageProgress,
  easeCounter,
  tweenCounterSamples,
  completedWeightForPhase,
  finishedWeightAfterPhase,
  totalLoadWeight,
  clampPercent,
  LOAD_STAGE_WEIGHTS,
  FETCH_UNIT_WEIGHTS,
  OPEN_PROGRESS_KEYS,
  createWeightProgress,
} = require('../src/modal/pure/load-progress.js');

const SCRATCH =
  process.env.PRP_SCRATCH ||
  path.join(require('node:os').tmpdir(), 'pr-plus-test-scratch');

function log(line) {
  try {
    fs.mkdirSync(SCRATCH, { recursive: true });
    fs.appendFileSync(path.join(SCRATCH, 'load-percent-anim.log'), line + '\n');
  } catch {
    /* ignore */
  }
  console.log(line);
}

assert.equal(totalLoadWeight(), 100);
assert.equal(clampPercent(150), 100);
assert.equal(clampPercent(-3), 0);

// Open-path unit weights must sum to 100
{
  const sum = OPEN_PROGRESS_KEYS.reduce(
    (acc, k) => acc + Number(FETCH_UNIT_WEIGHTS[k] || 0),
    0
  );
  assert.equal(
    sum,
    100,
    `OPEN_PROGRESS_KEYS weights sum to ${sum}, want 100`
  );
  for (const k of [
    'files',
    'comments',
    'reviews',
    'commits',
    'checks',
    'development',
  ]) {
    assert.ok(
      FETCH_UNIT_WEIGHTS[k] > 0,
      `side unit ${k} must have positive weight`
    );
  }
}

// Stage progress advances with weight
assert.ok(completedWeightForPhase('core') < finishedWeightAfterPhase('core'));
assert.ok(finishedWeightAfterPhase('threads') > finishedWeightAfterPhase('core'));

const pCore = percentFromStageProgress({ phase: 'core', busy: true });
const pThreads = percentFromStageProgress({ phase: 'threads', busy: true });
const pDone = percentFromStageProgress({ phase: 'done', busy: false });
assert.ok(pCore >= 5 && pCore < 50, `core busy percent got ${pCore}`);
assert.ok(pThreads > pCore, `threads ${pThreads} > core ${pCore}`);
assert.equal(pDone, 100);

// Absolute completed weight
assert.equal(
  percentFromStageProgress({ completedWeight: LOAD_STAGE_WEIGHTS.start }),
  5
);

// Counter tween produces intermediates and ends at target
const samples = tweenCounterSamples(10, 40, 6);
assert.equal(samples[0], 10);
assert.equal(samples[samples.length - 1], 40);
assert.ok(samples.length >= 3);
const mids = samples.slice(1, -1);
assert.ok(
  mids.some((v) => v > 10 && v < 40),
  'tween has intermediate values'
);
assert.equal(easeCounter(0, 100, 0), 0);
assert.equal(easeCounter(0, 100, 1), 100);
assert.ok(easeCounter(0, 100, 0.5) > 40 && easeCounter(0, 100, 0.5) < 100);

// Order-independent fetch unit progress including side panels
{
  const a = createWeightProgress({ total: 100, initial: 0 });
  a.complete('start', FETCH_UNIT_WEIGHTS.start);
  // sides can land before core
  a.complete('files', FETCH_UNIT_WEIGHTS.files);
  a.complete('comments', FETCH_UNIT_WEIGHTS.comments);
  const mid = a.percent();
  assert.ok(mid > 5 && mid < 50, `partial sides percent ${mid}`);
  a.complete('threadsNewest', FETCH_UNIT_WEIGHTS.threadsNewest);
  a.complete('core', FETCH_UNIT_WEIGHTS.core);
  a.complete('reviews', FETCH_UNIT_WEIGHTS.reviews);
  a.complete('commits', FETCH_UNIT_WEIGHTS.commits);
  a.complete('checks', FETCH_UNIT_WEIGHTS.checks);
  a.complete('development', FETCH_UNIT_WEIGHTS.development);
  a.complete('threadsFollow', FETCH_UNIT_WEIGHTS.threadsFollow);
  assert.equal(a.percent(), 100, 'full open path reaches 100');
  // idempotent
  const again = a.complete('core', FETCH_UNIT_WEIGHTS.core);
  assert.equal(again.added, false);
  assert.equal(a.percent(), 100);

  // reverse order yields same total
  const b = createWeightProgress({ total: 100 });
  for (const k of OPEN_PROGRESS_KEYS) {
    b.complete(k, FETCH_UNIT_WEIGHTS[k]);
  }
  assert.equal(b.percent(), 100);
  log(
    `weight-progress ok full-open=${b.percent()} mid-sides=${mid} samples=${samples.join(',')}`
  );
}

// Host wires side-fetch marks + tryFinish
{
  const host = fs.readFileSync(
    path.join(__dirname, '../src/pr-modal-host.js'),
    'utf8'
  );
  assert.ok(host.includes('markSideProgress'), 'host markSideProgress');
  assert.ok(host.includes('tryFinishOpenProgress'), 'host tryFinishOpenProgress');
  assert.ok(host.includes('OPEN_PROGRESS_KEYS') || host.includes('openProgressKeys'));
  assert.ok(
    host.includes("markSideProgress(key)") || host.includes('markSideProgress(key)'),
    'settle credits side progress'
  );
}

log(
  `load-progress.test.js ok pCore=${pCore} pThreads=${pThreads} samples=${samples.join(',')}`
);
console.log('load-progress.test.js: all assertions passed');
