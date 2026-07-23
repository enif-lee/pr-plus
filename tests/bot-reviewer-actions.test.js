/**
 * Bot reviewers/assignees: no re-request or remove actions.
 */
const assert = require('node:assert/strict');
const {
  isBotAccount,
  buildUnifiedReviewerRows,
} = require('../src/modal/lib/searchable-select.ts');
const { buildRerequestReviewerLogins } = require('../src/modal/lib/pr-edit-api.ts');
const { buildPaletteCommands } = require('../src/modal/lib/command-palette.ts');

assert.equal(isBotAccount('dependabot[bot]'), true);
assert.equal(isBotAccount('codecov[bot]'), true);
assert.equal(isBotAccount('alice'), false);
assert.equal(isBotAccount({ login: 'renovate', type: 'Bot' }), true);
assert.equal(isBotAccount({ login: 'bob', type: 'User' }), false);
assert.equal(
  isBotAccount('copilot', { actorIsBot: { copilot: true } }),
  true,
  'actorIsBot map from API type'
);

const detail = {
  author: 'owner',
  // dependabot still pending; alice already reviewed (not pending) → re-requestable
  requestedReviewers: ['dependabot[bot]'],
  reviews: [
    { author: 'alice', state: 'APPROVED' },
    { author: 'codecov[bot]', state: 'COMMENTED', isBot: true, type: 'Bot' },
  ],
  actorIsBot: { 'dependabot[bot]': true, 'codecov[bot]': true },
  assignees: ['bob', 'github-actions[bot]'],
};

const rows = buildUnifiedReviewerRows(detail);
const byLogin = Object.fromEntries(rows.map((r) => [r.login.toLowerCase(), r]));
assert.equal(byLogin.alice.isBot, false);
assert.equal(byLogin['dependabot[bot]'].isBot, true);
assert.equal(byLogin['codecov[bot]'].isBot, true);

// Author never appears as a reviewer even if in reviews/requested list
{
  const withAuthor = buildUnifiedReviewerRows({
    author: 'owner-user',
    requestedReviewers: ['owner-user', 'alice'],
    reviews: [
      { author: 'owner-user', state: 'COMMENTED' },
      { author: 'alice', state: 'APPROVED' },
    ],
  });
  assert.deepEqual(
    withAuthor.map((r) => r.login).sort(),
    ['alice'],
    'PR author excluded from reviewer rows'
  );
}

const rereq = buildRerequestReviewerLogins(detail);
assert.ok(rereq.includes('alice'));
assert.ok(!rereq.some((x) => /bot/i.test(x)), 'bots excluded from bulk re-request');

const cmds = buildPaletteCommands({
  ...detail,
  requestedReviewers: ['alice', 'dependabot[bot]'],
});
assert.ok(cmds.some((c) => c.id === 'rm-rev-alice'), 'human pending reviewer removable');
assert.ok(!cmds.some((c) => String(c.id).includes('dependabot')));
assert.ok(!cmds.some((c) => String(c.id).includes('github-actions')));

const fs = require('node:fs');
const path = require('node:path');
const meta = fs.readFileSync(
  path.join(__dirname, '../src/modal/views/conversation/MetaList.tsx'),
  'utf8'
);
assert.ok(meta.includes('canRemove'), 'MetaList supports canRemove');
assert.ok(meta.includes('isBot'), 'MetaList detects bots');
const conv = fs.readFileSync(
  path.join(__dirname, '../src/modal/views/conversation/ConversationView.tsx'),
  'utf8'
);
assert.ok(conv.includes('isBotAccount'), 'ConversationView uses isBotAccount');
assert.ok(conv.includes('canRemove: !bot'), 'bots cannot be removed');

console.log('bot-reviewer-actions.test.js: all assertions passed');
