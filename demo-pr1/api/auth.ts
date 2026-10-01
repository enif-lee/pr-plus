/** Demo auth */
export function maskToken(token: string): string {
  if (!token || token.length < 8) return '••••';
  return `${'•'.repeat(8)}${token.slice(-4)}`;
}

export function looksLikePat(token: string): boolean {
  return /^(ghp_|github_pat_)/.test(token.trim());
}
