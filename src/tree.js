/**
 * AUTO-GENERATED from src/tree.ts
 * SOURCE OF TRUTH: src/tree.ts — do not edit this .js
 * Rebuild: node scripts/build-content-ts.mjs
 */
function buildPrTree(prs) {
  if (!Array.isArray(prs) || prs.length === 0) {
    return [];
  }
  const byHeadRef = /* @__PURE__ */ new Map();
  for (const pr of prs) {
    byHeadRef.set(pr.headRef, pr);
  }
  const parentOf = /* @__PURE__ */ new Map();
  for (const pr of prs) {
    const parent = byHeadRef.get(pr.baseRef);
    if (parent && parent !== pr) {
      parentOf.set(pr, parent);
    }
  }
  const rootCache = /* @__PURE__ */ new Map();
  function resolveRoot(pr) {
    if (rootCache.has(pr)) return rootCache.get(pr);
    const stack = /* @__PURE__ */ new Set();
    let cur = pr;
    while (parentOf.has(cur)) {
      if (stack.has(cur)) {
        rootCache.set(pr, pr);
        return pr;
      }
      stack.add(cur);
      cur = parentOf.get(cur);
    }
    rootCache.set(pr, cur);
    return cur;
  }
  const roots = [];
  const seenRoots = /* @__PURE__ */ new Set();
  for (const pr of prs) {
    const root = resolveRoot(pr);
    if (!seenRoots.has(root)) {
      seenRoots.add(root);
      roots.push(root);
    }
  }
  const childrenByParentHead = /* @__PURE__ */ new Map();
  for (const pr of prs) {
    const parent = parentOf.get(pr);
    if (!parent) continue;
    if (resolveRoot(pr) !== resolveRoot(parent)) continue;
    if (!childrenByParentHead.has(parent.headRef)) {
      childrenByParentHead.set(parent.headRef, []);
    }
    childrenByParentHead.get(parent.headRef).push(pr);
  }
  function buildNode(pr) {
    const childPrs = childrenByParentHead.get(pr.headRef) || [];
    childPrs.sort((a, b) => b.number - a.number);
    return {
      pr,
      children: childPrs.map(buildNode)
    };
  }
  roots.sort((a, b) => b.number - a.number);
  return roots.map(buildNode);
}
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
function serializePrTree(forest) {
  return flattenPrTree(forest).map(({ pr, depth }) => {
    const indent = "  ".repeat(depth);
    const draft = pr.draft ? " [draft]" : "";
    return `${indent}#${pr.number} ${pr.title} (${pr.headRef} \u2190 ${pr.baseRef})${draft}`;
  }).join("\n");
}
const treeApi = { buildPrTree, flattenPrTree, serializePrTree };
if (typeof module !== "undefined" && module.exports) {
  module.exports = treeApi;
}
if (typeof globalThis !== "undefined") {
  globalThis.PRTree = treeApi;
}
