/**
 * Pure PR tree builder. Accepts flat PR descriptors, returns an ordered forest.
 * Each node: { pr, children: Node[] }
 *
 * Root rule: baseRef is not the headRef of any PR in the set.
 * Child rule: pr.baseRef === parent.headRef (exact string match).
 */

function buildPrTree(prs) {
  if (!Array.isArray(prs) || prs.length === 0) {
    return [];
  }

  const headRefs = new Set(prs.map((p) => p.headRef));
  const byHeadRef = new Map();
  for (const pr of prs) {
    byHeadRef.set(pr.headRef, pr);
  }

  const childrenByParentHead = new Map();
  const roots = [];

  for (const pr of prs) {
    const parent = byHeadRef.get(pr.baseRef);
    if (parent) {
      if (!childrenByParentHead.has(parent.headRef)) {
        childrenByParentHead.set(parent.headRef, []);
      }
      childrenByParentHead.get(parent.headRef).push(pr);
    } else if (!headRefs.has(pr.baseRef)) {
      roots.push(pr);
    } else {
      // base matches a head but parent PR not found (shouldn't happen with unique heads)
      roots.push(pr);
    }
  }

  function buildNode(pr) {
    const childPrs = childrenByParentHead.get(pr.headRef) || [];
    childPrs.sort((a, b) => a.number - b.number);
    return {
      pr,
      children: childPrs.map(buildNode),
    };
  }

  roots.sort((a, b) => a.number - b.number);
  return roots.map(buildNode);
}

/** Flatten forest to depth-first order with depth for rendering. */
function flattenPrTree(forest) {
  const result = [];
  function walk(node, depth) {
    result.push({ pr: node.pr, depth });
    for (const child of node.children) {
      walk(child, depth + 1);
    }
  }
  for (const root of forest) {
    walk(root, 0);
  }
  return result;
}

/** Serialize forest to indented text (for tests / debugging). */
function serializePrTree(forest) {
  return flattenPrTree(forest)
    .map(({ pr, depth }) => {
      const indent = '  '.repeat(depth);
      const draft = pr.draft ? ' [draft]' : '';
      return `${indent}#${pr.number} ${pr.title} (${pr.headRef} ← ${pr.baseRef})${draft}`;
    })
    .join('\n');
}

const treeApi = { buildPrTree, flattenPrTree, serializePrTree };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = treeApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRTree = treeApi;
}