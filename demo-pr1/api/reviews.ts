/** Demo review helpers */
export type ReviewState = 'COMMENTED' | 'APPROVED' | 'CHANGES_REQUESTED';

export function reviewLabel(state: ReviewState): string {
  switch (state) {
    case 'APPROVED':
      return 'Approved';
    case 'CHANGES_REQUESTED':
      return 'Changes requested';
    default:
      return 'Commented';
  }
}

export function mergeAllowed(states: ReviewState[]): boolean {
  if (states.includes('CHANGES_REQUESTED')) return false;
  return states.some((s) => s === 'APPROVED');
}
