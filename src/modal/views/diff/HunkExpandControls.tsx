/**
 * GitHub-style expand chrome for one omitted gap on an @@ row:
 *   ▼ (down / front) | Expand all | ▲ (up / back)
 */
import React from 'react';
import { expandControlKinds, expandBusyMatches } from '@lib/diff-rows';
import './HunkExpandControls.css';

export function HunkExpandControls({
  gap,
  filePath,
  onExpandGap,
  expandBusyKey,
  placement,
}: {
  gap: any;
  filePath: string;
  onExpandGap: any;
  expandBusyKey: any;
  /** above = gap before this hunk; below = gap after this hunk (trailing) */
  placement: 'above' | 'below';
}) {
  if (!gap) return null;
  const count = Math.max(0, Number(gap.hiddenCount) || 0);
  if (!count) return null;
  const chunk = Math.max(1, Number(gap.expandChunk) || 20);
  const sideN = Math.min(chunk, count);
  const kinds =
    typeof expandControlKinds === 'function'
      ? expandControlKinds(placement, gap)
      : count > chunk
        ? (['fromStart', 'all', 'fromEnd'] as const)
        : (['all'] as const);
  const busy =
    typeof expandBusyMatches === 'function'
      ? expandBusyMatches(expandBusyKey, filePath, gap)
      : Boolean(
          expandBusyKey &&
            String(expandBusyKey).startsWith(
              `${filePath}:${gap.gapStartNew}-${gap.gapEndNew}:`
            )
        );
  const payload = { ...gap, filePath };
  const labelAll =
    busy
      ? '…'
      : count <= chunk
        ? `Expand ${count}`
        : `Expand all ${count}`;

  const buttons = kinds.map((kind) => {
    if (kind === 'fromStart') {
      return (
        <button
          key="fromStart"
          type="button"
          className="prp-hunk-expand__btn prp-hunk-expand__btn--dir"
          data-expand-dir="fromStart"
          disabled={busy || !onExpandGap}
          title={`Expand ${sideN} lines downward (front of gap)`}
          aria-label={`Expand ${sideN} lines down`}
          onClick={() => onExpandGap?.(payload, 'fromStart')}
        >
          <span className="prp-hunk-expand__icon" aria-hidden="true">
            ▼
          </span>
        </button>
      );
    }
    if (kind === 'fromEnd') {
      return (
        <button
          key="fromEnd"
          type="button"
          className="prp-hunk-expand__btn prp-hunk-expand__btn--dir"
          data-expand-dir="fromEnd"
          disabled={busy || !onExpandGap}
          title={`Expand ${sideN} lines upward (back of gap)`}
          aria-label={`Expand ${sideN} lines up`}
          onClick={() => onExpandGap?.(payload, 'fromEnd')}
        >
          <span className="prp-hunk-expand__icon" aria-hidden="true">
            ▲
          </span>
        </button>
      );
    }
    return (
      <button
        key="all"
        type="button"
        className="prp-hunk-expand__btn prp-hunk-expand__btn--all"
        data-expand-dir="all"
        disabled={busy || !onExpandGap}
        title={
          count
            ? `Expand all ${count} omitted lines (entire gap)`
            : 'Expand omitted lines'
        }
        onClick={() => onExpandGap?.(payload, 'all')}
      >
        {labelAll}
      </button>
    );
  });

  return (
    <div
      className={`prp-hunk-expand prp-hunk-expand--${placement}`}
      role="group"
      data-expand-placement={placement}
      aria-label="Expand omitted lines: down, all, or up"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {buttons}
    </div>
  );
}
