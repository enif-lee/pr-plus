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
  const people = ss.buildPeopleOptions(
    ['alice', 'Bob', 'alice'],
    { alice: 'APPROVED' },
    { alice: 'https://example.com/a.png' }
  );
  assert.equal(people.length, 2);
  assert.equal(people[0].meta.status, 'APPROVED');
  assert.equal(people[0].meta.kind, 'user');
  assert.equal(people[0].meta.avatarUrl, 'https://example.com/a.png');
  assert.equal(people[1].meta.kind, 'user');
  ok('buildPeopleOptions');
}

{
  const labels = ss.buildLabelOptions([{ name: 'bug', color: 'f00' }, 'enhancement', 'bug']);
  assert.equal(labels.length, 2);
  assert.equal(labels[0].id, 'bug');
  assert.equal(labels[0].meta.kind, 'label');
  assert.equal(labels[0].meta.color, 'f00');
  // Default GH color when only the name is known
  assert.equal(labels[1].id, 'enhancement');
  assert.equal(labels[1].meta.color, 'a2eeef');
  assert.equal(ss.labelColorCss('f00'), '#f00');
  assert.equal(ss.labelColorCss('#a2eeef'), '#a2eeef');
  assert.equal(ss.labelColorCss('', 'bug'), '#d73a4a');
  assert.equal(ss.labelColorCss(''), '');
  // Colorless first entry is upgraded by a later colored entry
  const upgraded = ss.buildLabelOptions([
    'bug',
    { name: 'bug', color: 'd73a4a' },
  ]);
  assert.equal(upgraded.length, 1);
  assert.equal(upgraded[0].meta.color, 'd73a4a');
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
  const milestones = ss.buildMilestoneOptions([
    { number: 2, title: 'Sprint 2', state: 'open' },
    { number: 1, title: 'Sprint 1', state: 'closed' },
    { number: 2, title: 'Sprint 2 dupe' },
  ]);
  assert.equal(milestones.length, 2);
  assert.equal(milestones[0].id, '2'); // sorted desc by number
  assert.equal(milestones[0].meta.kind, 'milestone');
  // later same-number entry wins
  assert.equal(milestones[0].meta.title, 'Sprint 2 dupe');
  assert.equal(ss.queryMatchesOption(milestones, 'Sprint 2 dupe'), true);
  assert.equal(ss.queryMatchesOption(milestones, 'brand-new'), false);
  assert.equal(ss.queryMatchesOption(milestones, '2'), true);
  ok('buildMilestoneOptions + queryMatchesOption');
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
