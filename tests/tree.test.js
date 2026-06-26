const assert = require('node:assert/strict');
const { buildPrTree, flattenPrTree, serializePrTree } = require('../src/tree.js');

function pr(number, title, headRef, baseRef, extra = {}) {
  return { number, title, headRef, baseRef, author: 'dev', draft: false, ...extra };
}

function nodeNumbers(forest) {
  return forest.map((n) => ({
    number: n.pr.number,
    children: nodeNumbers(n.children),
  }));
}

function flatNumbers(forest) {
  return flattenPrTree(forest).map((e) => ({ number: e.pr.number, depth: e.depth }));
}

// Linear stack depth 3+: main → a → b → c
{
  const prs = [
    pr(10, 'Root PR', 'feature-a', 'main'),
    pr(11, 'Stack 1', 'feature-b', 'feature-a'),
    pr(12, 'Stack 2', 'feature-c', 'feature-b'),
    pr(13, 'Stack 3', 'feature-d', 'feature-c'),
  ];
  const forest = buildPrTree(prs);
  assert.equal(forest.length, 1);
  assert.deepEqual(nodeNumbers(forest), [
    { number: 10, children: [{ number: 11, children: [{ number: 12, children: [{ number: 13, children: [] }] }] }] },
  ]);
  assert.deepEqual(flatNumbers(forest), [
    { number: 10, depth: 0 },
    { number: 11, depth: 1 },
    { number: 12, depth: 2 },
    { number: 13, depth: 3 },
  ]);
}

// Siblings under same parent
{
  const prs = [
    pr(1, 'Root', 'feat-a', 'main'),
    pr(2, 'Child A', 'feat-b', 'feat-a'),
    pr(3, 'Child B', 'feat-c', 'feat-a'),
  ];
  const forest = buildPrTree(prs);
  assert.equal(forest.length, 1);
  assert.deepEqual(nodeNumbers(forest), [
    { number: 1, children: [{ number: 2, children: [] }, { number: 3, children: [] }] },
  ]);
}

// Disconnected / unrelated PRs (multiple roots)
{
  const prs = [
    pr(5, 'On main', 'branch-x', 'main'),
    pr(6, 'Also main', 'branch-y', 'main'),
    pr(7, 'Develop', 'branch-z', 'develop'),
  ];
  const forest = buildPrTree(prs);
  assert.equal(forest.length, 3);
  assert.deepEqual(
    forest.map((n) => n.pr.number).sort((a, b) => a - b),
    [5, 6, 7]
  );
  for (const root of forest) {
    assert.equal(root.children.length, 0);
  }
}

// Branching stack: two roots, one child chain
{
  const prs = [
    pr(20, 'Chain root', 'stack-a', 'main'),
    pr(21, 'Other root', 'other-b', 'main'),
    pr(22, 'On stack', 'stack-c', 'stack-a'),
  ];
  const forest = buildPrTree(prs);
  assert.equal(forest.length, 2);
  const byNum = Object.fromEntries(forest.map((n) => [n.pr.number, n]));
  assert.equal(byNum[20].children.length, 1);
  assert.equal(byNum[20].children[0].pr.number, 22);
  assert.equal(byNum[21].children.length, 0);
}

// Draft flag preserved in serialization
{
  const prs = [pr(99, 'Draft work', 'wip', 'main', { draft: true })];
  const text = serializePrTree(buildPrTree(prs));
  assert.match(text, /\[draft\]/);
  assert.match(text, /#99/);
}

// Empty input
{
  assert.deepEqual(buildPrTree([]), []);
}

console.log('tree.test.js: all assertions passed');