'use strict';

const assert = require('assert');
const ss = require('../src/modal/lib/searchable-select.ts');

function ok(msg) {
  console.log('ok -', msg);
}

{
  const opts = [
    { id: 'main', label: 'main' },
    { id: 'develop', label: 'develop', keywords: ['dev'] },
    { id: 'feature/x', label: 'feature/x', disabled: true },
  ];
  assert.equal(ss.filterSelectOptions(opts, '').length, 2);
  assert.equal(ss.filterSelectOptions(opts, 'dev')[0].id, 'develop');
  assert.equal(ss.filterSelectOptions(opts, 'feature').length, 0);
  ok('filterSelectOptions');
}

{
  const people = ss.buildPeopleOptions(['alice', 'Bob', 'alice'], {
    alice: 'APPROVED',
  });
  assert.equal(people.length, 2);
  assert.equal(people[0].meta.status, 'APPROVED');
  ok('buildPeopleOptions');
}

{
  const labels = ss.buildLabelOptions([{ name: 'bug', color: 'f00' }, 'enhancement', 'bug']);
  assert.equal(labels.length, 2);
  assert.equal(labels[0].id, 'bug');
  ok('buildLabelOptions');
}

{
  const branches = ss.buildBranchOptions(
    [{ headRef: 'feature/a', baseRef: 'main' }],
    { headRef: 'feature/b', extra: ['release'] }
  );
  const ids = branches.map((b) => b.id);
  assert.ok(ids.includes('main'));
  assert.ok(ids.includes('feature/a'));
  assert.ok(ids.includes('feature/b'));
  assert.ok(ids.includes('release'));
  ok('buildBranchOptions');
}

{
  const rows = ss.buildUnifiedReviewerRows({
    requestedReviewers: ['alice', 'bob'],
    reviews: [
      { author: 'alice', state: 'APPROVED' },
      { author: 'carol', state: 'CHANGES_REQUESTED' },
      { author: 'alice', state: 'COMMENTED' },
    ],
  });
  const by = Object.fromEntries(rows.map((r) => [r.login.toLowerCase(), r.status]));
  assert.equal(by.alice, 'COMMENTED');
  assert.equal(by.bob, 'PENDING');
  assert.equal(by.carol, 'CHANGES_REQUESTED');
  ok('buildUnifiedReviewerRows');
}

console.log('searchable-select tests passed');
