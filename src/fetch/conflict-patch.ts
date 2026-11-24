/** Compare API text patches, both measured against the same merge base. */
export type ComparePatch = {
  status?: string;
  previous_filename?: string;
  patch?: string;
  additions?: number;
  deletions?: number;
};

/** Half-open ranges in the ancestor; insertions are points between lines. */
type EditRange = { start: number; end: number };
type PatchEdits = {
  ranges: EditRange[];
  ancestor: Map<number, { text: string; context: boolean }>;
  inserted: Set<string>;
};

function patchEdits(file: ComparePatch): PatchEdits | null {
  if (file.status !== 'modified' || file.previous_filename ||
      typeof file.patch !== 'string' || !file.patch) return null;
  const ranges: EditRange[] = [];
  const ancestor: PatchEdits['ancestor'] = new Map();
  const inserted = new Set<string>();
  let cursor = 0;
  let start: number | null = null;
  let oldRemaining = 0;
  let newRemaining = 0;
  let additions = 0;
  let deletions = 0;
  let inHunk = false;
  function finishEdit() {
    if (start !== null) ranges.push({ start, end: cursor });
    start = null;
  }

  for (const line of file.patch.replace(/\n$/, '').split('\n')) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(line);
    if (header) {
      if (oldRemaining !== 0 || newRemaining !== 0) return null;
      finishEdit();
      oldRemaining = Number(header[2] ?? 1);
      newRemaining = Number(header[4] ?? 1);
      const oldOffset = Number(header[1]) - (oldRemaining === 0 ? 0 : 1);
      const newOffset = Number(header[3]) - (newRemaining === 0 ? 0 : 1);
      if (oldOffset < cursor || newOffset - oldOffset !== additions - deletions) return null;
      cursor = oldOffset;
      inHunk = true;
      continue;
    }
    const kind = line[0];
    // Unknown lines (including EOF newline edits) are not safe to prune.
    if (!inHunk || (kind !== ' ' && kind !== '+' && kind !== '-')) return null;
    if (kind === ' ') finishEdit();
    else if (start === null) start = cursor;
    if (kind !== '+') {
      ancestor.set(cursor, { text: line.slice(1), context: kind === ' ' });
      oldRemaining--;
      cursor++;
    }
    if (kind !== '-') newRemaining--;
    if (oldRemaining < 0 || newRemaining < 0) return null;
    if (kind === '+') {
      inserted.add(line.slice(1));
      additions++;
    }
    if (kind === '-') deletions++;
  }
  finishEdit();

  // GitHub can omit or truncate a patch. Require both complete hunks and
  // matching totals before using the known edits to rule out a candidate.
  return ranges.length && oldRemaining === 0 && newRemaining === 0 &&
    additions === file.additions && deletions === file.deletions
    ? { ranges, ancestor, inserted }
    : null;
}

function sharedAnchors(base: PatchEdits, head: PatchEdits): number[] {
  const positions = new Map<string, number | null>();
  for (const patch of [base, head]) {
    for (const [line, { text }] of patch.ancestor) {
      const before = positions.get(text);
      if (before === undefined) positions.set(text, line);
      else if (before !== line) positions.set(text, null);
    }
  }
  const anchors: number[] = [];
  for (const [line, row] of base.ancestor) {
    const other = head.ancestor.get(line);
    if (other && row.text !== other.text) return [];
    if (row.context && other?.context && row.text.trim() &&
        positions.get(row.text) === line &&
        !base.inserted.has(row.text) && !head.inserted.has(row.text)) anchors.push(line);
  }
  return anchors;
}

export function haveSeparatedEdits(base: ComparePatch, head: ComparePatch): boolean {
  const baseEdits = patchEdits(base);
  const headEdits = patchEdits(head);
  if (!baseEdits || !headEdits) return false;

  // Diff and merge can align repeated lines differently. Only infer separation
  // across shared, unchanged context that is unique in the visible patches.
  const anchors = sharedAnchors(baseEdits, headEdits);
  let b = 0;
  let h = 0;
  while (b < baseEdits.ranges.length && h < headEdits.ranges.length) {
    const baseRange = baseEdits.ranges[b];
    const headRange = headEdits.ranges[h];
    if (anchors.some((line) => baseRange.end <= line && line < headRange.start)) b++;
    else if (anchors.some((line) => headRange.end <= line && line < baseRange.start)) h++;
    else return false;
  }
  return true;
}
