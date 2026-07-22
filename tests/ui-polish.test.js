const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCRATCH =
  process.env.PRP_SCRATCH ||
  require('node:os').tmpdir() + '/pr-plus-test-scratch';
fs.mkdirSync(SCRATCH, { recursive: true });

const polish = require('../src/modal/lib/ui-polish.ts');

const log = [];
function ok(name) {
  log.push(`ok - ${name}`);
  console.log(`ok - ${name}`);
}

// unique logins
{
  assert.deepEqual(
    polish.uniqueLogins(['Alice', 'alice', 'bob', 'Bob', '', null, 'carol']),
    ['Alice', 'bob', 'carol']
  );
  ok('uniqueLogins case-insensitive');
}

// unique reviews
{
  const revs = polish.uniqueReviewsByAuthor([
    { author: 'alice', state: 'COMMENTED', id: 1 },
    { author: 'Alice', state: 'APPROVED', id: 2 },
    { author: 'bob', state: 'CHANGES_REQUESTED', id: 3 },
  ]);
  assert.equal(revs.length, 2);
  assert.equal(revs.find((r) => r.author.toLowerCase() === 'alice').state, 'APPROVED');
  ok('uniqueReviewsByAuthor last-wins');
}

// URLs
{
  assert.equal(polish.githubUserUrl('@octocat'), 'https://github.com/octocat');
  assert.match(polish.githubLabelUrl('o', 'r', 'bug'), /labels\/bug$/);
  assert.match(polish.githubIssueUrl('o', 'r', 12), /issues\/12$/);
  assert.equal(
    polish.githubTreeUrl('acme', 'app', 'feature/modal-pr-view'),
    'https://github.com/acme/app/tree/feature/modal-pr-view'
  );
  assert.equal(
    polish.githubCommitUrl('acme', 'app', 'abc123def'),
    'https://github.com/acme/app/commit/abc123def'
  );
  assert.equal(polish.githubTreeUrl('acme', 'app', ''), '');
  assert.equal(polish.encodeGitRefPath('a/b c'), 'a/b%20c');
  ok('github entity URLs');
}

// linkify mentions / issues
{
  const html = polish.linkifyMentionsAndIssues('Hi @octocat see #42 please', {
    owner: 'acme',
    repo: 'app',
  });
  assert.match(html, /href="https:\/\/github\.com\/octocat"/);
  assert.match(html, /href="https:\/\/github\.com\/acme\/app\/issues\/42"/);
  ok('linkifyMentionsAndIssues');
}

// magic links
{
  const html = polish.applyMagicLinksToHtml('Ticket ENG-7 and ENG-7 again', [
    { key: 'ENG-7', url: 'https://linear.app/t/ENG-7' },
  ]);
  assert.match(html, /href="https:\/\/linear\.app\/t\/ENG-7"/);
  assert.ok((html.match(/linear\.app/g) || []).length >= 1);
  ok('applyMagicLinksToHtml');
}

// enhance pipeline
{
  const out = polish.enhanceMarkdownHtml('<p>@dev fixed JIRA-9</p>', {
    owner: 'o',
    repo: 'r',
    magicLinks: [{ key: 'JIRA-9', url: 'https://jira.example/JIRA-9' }],
  });
  assert.match(out, /@dev/);
  assert.match(out, /jira\.example/);
  ok('enhanceMarkdownHtml');
}

// stack strip 3-deep
{
  const prs = [
    { number: 10, title: 'Base', headRef: 'feat-a', baseRef: 'main', htmlUrl: 'u10' },
    { number: 11, title: 'Mid', headRef: 'feat-b', baseRef: 'feat-a', htmlUrl: 'u11' },
    { number: 12, title: 'Top', headRef: 'feat-c', baseRef: 'feat-b', htmlUrl: 'u12' },
    { number: 99, title: 'Other', headRef: 'other', baseRef: 'main', htmlUrl: 'u99' },
  ];
  const strip = polish.buildStackStrip(prs, 11);
  assert.deepEqual(
    strip.map((s) => s.number),
    [10, 11, 12]
  );
  assert.equal(strip[1].current, true);
  assert.equal(strip[0].current, false);
  assert.equal(strip[2].depth, 2);
  ok('buildStackStrip 3-deep through mid');
}

// stack strip only current when no neighbors
{
  const strip = polish.buildStackStrip(
    [{ number: 5, title: 'Solo', headRef: 'solo', baseRef: 'main' }],
    5
  );
  assert.equal(strip.length, 1);
  assert.equal(strip[0].current, true);
  ok('buildStackStrip solo');
}

// stack path with fork (degree ≥ 2) — select first branch by default
{
  const prs = [
    { number: 1, title: 'Root', headRef: 'a', baseRef: 'main' },
    { number: 2, title: 'Left', headRef: 'b1', baseRef: 'a' },
    { number: 3, title: 'Right', headRef: 'b2', baseRef: 'a' },
    { number: 4, title: 'L2', headRef: 'c1', baseRef: 'b1' },
    { number: 5, title: 'R2', headRef: 'c2', baseRef: 'b2' },
  ];
  const model = polish.buildStackPathModel(prs, 1, {});
  assert.ok(model.branches.some((b) => b.options.length === 2));
  const viaRight = polish.buildStackPathModel(prs, 1, { a: 3 });
  assert.deepEqual(
    viaRight.items.map((i) => i.number),
    [1, 3, 5]
  );
  const viaLeft = polish.buildStackPathModel(prs, 1, { a: 2 });
  assert.deepEqual(
    viaLeft.items.map((i) => i.number),
    [1, 2, 4]
  );
  ok('buildStackPathModel path select');
}

// stack path hover helpers
{
  assert.equal(polish.STACK_PATH_HOVER_MS > 0, true);
  const branch = {
    parentHeadRef: 'a',
    selectedNumber: 3,
    options: [
      { number: 2, title: 'Left', headRef: 'b1' },
      { number: 3, title: 'Right', headRef: 'b2' },
    ],
  };
  assert.equal(polish.stackBranchHasPathPicker(branch), true);
  const opts = polish.buildStackBranchSelectOptions(branch);
  assert.equal(opts.length, 2);
  assert.match(opts[0].label, /^#/);
  let h = polish.reduceStackPathHover({ openKey: null, armedKey: null }, { type: 'enter', key: 'a' });
  assert.equal(h.scheduleOpen, true);
  h = polish.reduceStackPathHover({ openKey: null, armedKey: 'a' }, { type: 'timer-fire', key: 'a' });
  assert.equal(h.openKey, 'a');
  ok('stack path hover helpers');
}

const out = log.join('\n') + '\n';
fs.writeFileSync(path.join(SCRATCH, 'ui-polish-unit.log'), out);
console.log(`\nWrote ${path.join(SCRATCH, 'ui-polish-unit.log')}`);
