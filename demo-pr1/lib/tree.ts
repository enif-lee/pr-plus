export type Node = { id: string; children: Node[] };

export function flatten(root: Node, depth = 0): Array<{ id: string; depth: number }> {
  const out = [{ id: root.id, depth }];
  for (const c of root.children) out.push(...flatten(c, depth + 1));
  return out;
}
