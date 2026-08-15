import React from 'react';

/**
 * Render a shortcut label with optical scaling for undersized modifier glyphs.
 * ⇧ (Shift) paints shorter than ⌥/⌘ in most system fonts.
 */
export function KeyGlyphs({
  text,
  className = '',
}: {
  text?: string | null;
  className?: string;
}) {
  const raw = String(text || '');
  if (!raw) return null;
  // Prefer iterating code points (emoji-safe)
  const chars = Array.from(raw);
  return (
    <span className={className || undefined}>
      {chars.map((ch, i) =>
        ch === '⇧' ? (
          <span key={i} className="prp-key-glyph prp-key-glyph--shift">
            {ch}
          </span>
        ) : (
          <React.Fragment key={i}>{ch}</React.Fragment>
        )
      )}
    </span>
  );
}
