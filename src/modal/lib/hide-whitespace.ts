/**
 * Client-side hide-whitespace for unified-diff patches (GitHub Files `w=1` spirit).
 * Pure: input patch/files → filtered patch/files. No DOM.
 */

/** True when two line bodies match after stripping all whitespace. */
export function isWhitespaceOnlyChange(oldBody: string, newBody: string): boolean {
  const a = String(oldBody ?? '').replace(/\s+/g, '');
  const b = String(newBody ?? '').replace(/\s+/g, '');
  return a === b;
}

/**
 * Whether a remove/add block is entirely whitespace-only (order-preserving pairs
 * when lengths match; otherwise multiset of stripped bodies).
 */
export function isChangeBlockWhitespaceOnly(
  removes: string[],
  adds: string[]
): boolean {
  if (!removes.length && !adds.length) return true;
  if (!removes.length || !adds.length) return false;
  if (removes.length === adds.length) {
    for (let i = 0; i < removes.length; i++) {
      if (
        !isWhitespaceOnlyChange(
          String(removes[i]).slice(1),
          String(adds[i]).slice(1)
        )
      ) {
        return false;
      }
    }
    return true;
  }
  const strip = (line: string) => String(line).slice(1).replace(/\s+/g, '');
  const r = removes.map(strip).sort();
  const a = adds.map(strip).sort();
  if (r.length !== a.length) return false;
  for (let i = 0; i < r.length; i++) {
    if (r[i] !== a[i]) return false;
  }
  return true;
}

function filterHunkBody(hunkLines: string[]): {
  lines: string[];
  hasRealChange: boolean;
} {
  const out: string[] = [];
  let hasRealChange = false;
  let i = 0;
  while (i < hunkLines.length) {
    const line = hunkLines[i];
    if (
      !line.startsWith('+') &&
      !line.startsWith('-')
    ) {
      // context / "\ No newline" / empty
      out.push(line);
      i += 1;
      continue;
    }
    if (line.startsWith('-') || line.startsWith('+')) {
      const removes: string[] = [];
      const adds: string[] = [];
      while (i < hunkLines.length && hunkLines[i].startsWith('-')) {
        removes.push(hunkLines[i]);
        i += 1;
      }
      while (i < hunkLines.length && hunkLines[i].startsWith('+')) {
        adds.push(hunkLines[i]);
        i += 1;
      }
      // Lone + or - blocks (insert/delete): keep — not pure whitespace rewrite
      if (removes.length === 0 || adds.length === 0) {
        out.push(...removes, ...adds);
        hasRealChange = true;
        continue;
      }
      if (isChangeBlockWhitespaceOnly(removes, adds)) {
        // Drop pure whitespace rewrite
        continue;
      }
      out.push(...removes, ...adds);
      hasRealChange = true;
      continue;
    }
    out.push(line);
    i += 1;
  }
  if (
    !hasRealChange &&
    out.some((l) => l.startsWith('+') || l.startsWith('-'))
  ) {
    hasRealChange = true;
  }
  return { lines: out, hasRealChange };
}

/**
 * Filter a unified diff patch: drop +/− blocks that differ only by whitespace.
 * Hunks that become empty of real changes are omitted. Headers are preserved.
 */
export function filterPatchHideWhitespace(patch: string | null | undefined): string {
  if (patch == null || patch === '') return patch || '';
  const lines = String(patch).replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('@@')) {
      const header = line;
      i += 1;
      const body: string[] = [];
      while (i < lines.length && !lines[i].startsWith('@@')) {
        body.push(lines[i]);
        i += 1;
      }
      const { lines: filtered, hasRealChange } = filterHunkBody(body);
      if (hasRealChange) {
        out.push(header);
        out.push(...filtered);
      }
      continue;
    }
    out.push(line);
    i += 1;
  }
  // Drop trailing empty line noise only if original had no trailing content
  while (out.length && out[out.length - 1] === '' && lines[lines.length - 1] !== '') {
    out.pop();
  }
  return out.join('\n');
}

/**
 * Map PR file list applying hide-whitespace to each `patch` when enabled.
 * Returns same reference when hide is false.
 */
export function applyHideWhitespaceToFiles(
  files: any[] | null | undefined,
  hide: boolean
): any[] {
  if (!Array.isArray(files)) return [];
  if (!hide) return files;
  return files.map((f) => {
    if (!f || typeof f !== 'object') return f;
    const patch = typeof f.patch === 'string' ? f.patch : '';
    if (!patch) return f;
    const next = filterPatchHideWhitespace(patch);
    if (next === patch) return f;
    return { ...f, patch: next, _hideWhitespaceApplied: true };
  });
}
