export function plural(n: number, one: string, many?: string): string {
  return n === 1 ? `${n} ${one}` : `${n} ${many || one + 's'}`;
}

export function truncate(s: string, max = 40): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
