export type Chord = { alt?: boolean; shift?: boolean; key: string };

export function formatChord(c: Chord): string {
  const parts: string[] = [];
  if (c.alt) parts.push('⌥');
  if (c.shift) parts.push('⇧');
  parts.push(c.key.toUpperCase());
  return parts.join('');
}

export const DEMO_CHORDS: Chord[] = [
  { alt: true, key: '.' },
  { alt: true, shift: true, key: 'k' },
  { alt: true, shift: true, key: ']' },
];
