/** Demo pulls client */
export type Pull = { number: number; title: string; draft: boolean };

export function summarizePulls(pulls: Pull[]): string {
  const open = pulls.filter((p) => !p.draft).length;
  return `${open} ready / ${pulls.length} total`;
}

export async function fetchPulls(repo: string): Promise<Pull[]> {
  console.log('fetch', repo);
  return [
    { number: 1, title: 'demo root', draft: false },
    { number: 2, title: 'demo child', draft: true },
  ];
}
