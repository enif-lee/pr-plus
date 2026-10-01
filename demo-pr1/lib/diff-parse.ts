/** Minimal unified-diff line counter (demo) */
export function countDiffLines(patch: string): { add: number; del: number } {
  let add = 0;
  let del = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) add += 1;
    if (line.startsWith('-') && !line.startsWith('---')) del += 1;
  }
  return { add, del };
}
