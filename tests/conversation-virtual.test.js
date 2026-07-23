/**
 * Full left-panel conversation virtualization helpers.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildConversationVirtualRows,
  estimateConversationRowHeight,
  conversationRowHeight,
  conversationRowOffsets,
  indexForConversationAnchor,
  CONV_EST_GAP,
  CONV_EST_COLLAPSED_THREAD,
  CONV_EST_DESCRIPTION,
  CONV_EST_COMPOSER,
  CONV_ROW_GAP,
} = require('../src/modal/lib/conversation-virtual.ts');

// Full panel order: reverseComments=true
{
  const rows = buildConversationVirtualRows(
    {
      items: [
        { id: 1, kind: 'issue-comment', body: 'a' },
        { id: 2, kind: 'review-thread', body: 't', resolved: false },
      ],
      bottomItems: [{ id: 9, kind: 'issue-comment', body: 'old' }],
      showThreadGap: true,
      hiddenCount: 12,
      totalPages: 1,
    },
    {
      reverseComments: true,
      canLoadMore: true,
      hasMoreThreads: true,
      showPagination: false,
    }
  );
  assert.deepEqual(
    rows.map((r) => r.type),
    ['description', 'composer', 'merge', 'item', 'item', 'gap', 'item']
  );
  assert.equal(rows[0].key, 'description');
  assert.equal(rows[3].key, 'item:1');
  assert.equal(rows[5].type, 'gap');
  assert.equal(rows[6].keyPrefix, 'old-');
}

// Normal order: description → timeline → merge → composer (no client pagination)
{
  const rows = buildConversationVirtualRows(
    { items: [{ id: 1, kind: 'issue-comment' }], bottomItems: [] },
    { reverseComments: false }
  );
  assert.deepEqual(
    rows.map((r) => r.type),
    ['description', 'item', 'merge', 'composer']
  );
}

// Gap fold restored: Load more / Load all mid-timeline
{
  const rows = buildConversationVirtualRows(
    {
      items: [{ id: 1, kind: 'review-thread' }],
      bottomItems: [{ id: 9, kind: 'review-thread' }],
      showThreadGap: true,
      hiddenCount: 40,
    },
    { reverseComments: true, canLoadMore: true, hasMoreThreads: true }
  );
  assert.ok(rows.some((r) => r.type === 'gap'), 'timeline-gap row present');
  const gap = rows.find((r) => r.type === 'gap');
  assert.equal(gap.hiddenCount, 40);
}

// Empty timeline still has chrome + empty placeholder
{
  const rows = buildConversationVirtualRows(
    { items: [], bottomItems: [] },
    { reverseComments: true, showPagination: false }
  );
  assert.ok(rows.some((r) => r.type === 'empty'));
  assert.ok(rows.some((r) => r.type === 'description'));
  assert.ok(rows.some((r) => r.type === 'composer'));
}

// Estimates for chrome rows
{
  const desc = estimateConversationRowHeight(
    { type: 'description', key: 'description' },
    { descriptionBody: 'x'.repeat(400) }
  );
  assert.ok(desc >= CONV_EST_DESCRIPTION + CONV_ROW_GAP);
  assert.equal(
    estimateConversationRowHeight({ type: 'composer', key: 'composer' }),
    CONV_EST_COMPOSER + CONV_ROW_GAP
  );
  const collapsed = estimateConversationRowHeight(
    {
      type: 'item',
      key: 'x',
      item: { kind: 'review-thread', resolved: true, body: 'hi' },
    },
    { isThreadCollapsed: () => true }
  );
  assert.equal(collapsed, CONV_EST_COLLAPSED_THREAD + CONV_ROW_GAP);
  assert.equal(
    estimateConversationRowHeight({ type: 'gap', key: 'g', hiddenCount: 3 }),
    CONV_EST_GAP + CONV_ROW_GAP
  );
}

// Measured heights win
{
  const row = {
    type: 'item',
    key: 'item:1',
    item: { kind: 'issue-comment', body: 'short' },
  };
  const measured = new Map([['item:1', 240]]);
  assert.equal(conversationRowHeight(row, measured), 240);
  const offsets = conversationRowOffsets(
    [row, { type: 'gap', key: 'timeline-gap', hiddenCount: 1 }],
    measured
  );
  assert.equal(offsets[0], 0);
  assert.equal(offsets[1], 240);
  assert.equal(offsets[2], 240 + CONV_EST_GAP + CONV_ROW_GAP);
}

// Anchor index includes description
{
  const rows = buildConversationVirtualRows(
    {
      items: [
        { id: 10, kind: 'issue-comment' },
        { id: 20, kind: 'review-thread', replies: [{ id: 21 }] },
      ],
      bottomItems: [],
    },
    { reverseComments: true, showPagination: false }
  );
  assert.equal(indexForConversationAnchor(rows, 'body'), 0);
  assert.equal(indexForConversationAnchor(rows, 'issue-comment:10'), 3);
  assert.equal(indexForConversationAnchor(rows, 'review-comment:21'), 4);
}

// review-group height + anchor resolution
{
  const groupItem = {
    id: 900,
    kind: 'review-group',
    body: 'summary',
    threads: [
      { id: 1, path: 'a.ts', replies: [], resolved: false },
      { id: 2, path: 'b.ts', replies: [{ id: 22 }], resolved: true },
    ],
  };
  // Default: unresolved open → taller than all-collapsed override
  const defaultH = estimateConversationRowHeight({
    type: 'item',
    key: 'item:900',
    item: groupItem,
  });
  const allCollapsed = estimateConversationRowHeight(
    { type: 'item', key: 'item:900', item: groupItem },
    { isGroupThreadExpanded: () => false }
  );
  assert.ok(
    defaultH > allCollapsed,
    'unresolved threads expand by default in height estimate'
  );
  const onlyResolvedOpen = estimateConversationRowHeight(
    { type: 'item', key: 'item:900', item: groupItem },
    { isGroupThreadExpanded: (_g, t) => Number(t.id) === 2 }
  );
  assert.ok(onlyResolvedOpen > allCollapsed);
  // Pending file threads start collapsed (compact pending review group)
  const pendingGroup = {
    id: 901,
    kind: 'review-group',
    pending: true,
    body: '',
    threads: [
      { id: 11, path: 'p1.ts', replies: [], resolved: false, pending: true },
      { id: 12, path: 'p2.ts', replies: [{ id: 13 }], resolved: false, pending: true },
    ],
  };
  const pendingDefault = estimateConversationRowHeight({
    type: 'item',
    key: 'item:901',
    item: pendingGroup,
  });
  const pendingExpanded = estimateConversationRowHeight(
    { type: 'item', key: 'item:901', item: pendingGroup },
    { isGroupThreadExpanded: () => true }
  );
  assert.ok(
    pendingExpanded > pendingDefault,
    'pending threads stay collapsed by default in height estimate'
  );
  const rows = buildConversationVirtualRows(
    { items: [groupItem], bottomItems: [] },
    { reverseComments: true }
  );
  assert.equal(indexForConversationAnchor(rows, 'review-group:900'), 3);
  assert.equal(indexForConversationAnchor(rows, 'review-comment:22'), 3);
}

// UI wiring
{
  const conv = fs.readFileSync(
    path.join(__dirname, '../src/modal/views/conversation/ConversationView.tsx'),
    'utf8'
  );
  assert.ok(conv.includes('VirtualConversationList'));
  assert.ok(conv.includes('renderPanelRow') || conv.includes('renderRow'));
  assert.ok(conv.includes('reverseComments'));
  assert.ok(conv.includes('data-virtual-panel') || conv.includes('descriptionBody'));
  assert.ok(conv.includes('renderReviewGroupCard') || conv.includes('review-group'));
  assert.ok(
    conv.includes('groupThreadOpenOverrides') ||
      conv.includes('isGroupThreadOpen')
  );
  assert.ok(
    conv.includes('defaultGroupThreadOpen') ||
      (conv.includes('thread?.pending') && conv.includes('return false'))
  );
  const virt = fs.readFileSync(
    path.join(
      __dirname,
      '../src/modal/views/conversation/VirtualConversationList.tsx'
    ),
    'utf8'
  );
  assert.ok(virt.includes('data-virtual-panel'));
  assert.ok(virt.includes('renderRow'));
  assert.ok(virt.includes('isGroupThreadExpanded'));
  const css = fs.readFileSync(
    path.join(__dirname, '../src/modal/styles.css'),
    'utf8'
  );
  assert.ok(css.includes('.prp-conversation-virtual'));
  assert.ok(
    css.includes('.prp-review-group__list') ||
      css.includes('.prp-card--timeline-review-group')
  );
  assert.ok(
    !/prp-conversation__main > \.prp-card--desc[\s\S]{0,80}max-height:\s*min/.test(
      css
    ),
    'description no longer has separate max-height scroll cage'
  );
}

console.log('conversation-virtual.test.js: all assertions passed');
