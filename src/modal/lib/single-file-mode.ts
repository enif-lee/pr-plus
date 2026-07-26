/** @module modal/lib/single-file-mode */
/**
 * Pure helper: which files feed the Diff virtual list under single-file mode.
 * File tree / step-nav keep the full filtered list; only the hunk list narrows.
 */

function filePathOf(file: any): string {
  return String(file?.filename || file?.path || '').trim();
}

/**
 * @param {any[]|null|undefined} displayFiles full filtered file list
 * @param {unknown} activePath currently selected path
 * @param {boolean} singleFileMode pref (default false)
 * @returns {any[]}
 */
export function resolveDiffDisplayFiles(
  displayFiles: any[] | null | undefined,
  activePath: unknown,
  singleFileMode = false
): any[] {
  const list = Array.isArray(displayFiles) ? displayFiles : [];
  if (!singleFileMode || list.length <= 1) return list;
  const active = String(activePath || '').trim();
  if (active) {
    const hit = list.find((f) => filePathOf(f) === active);
    if (hit) return [hit];
  }
  return [list[0]];
}
