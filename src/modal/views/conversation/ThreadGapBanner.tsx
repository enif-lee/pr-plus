/**
 * Dual-window timeline fold: "N hidden items · Load more… · Load all".
 */
import React from 'react';
import './ThreadGapBanner.css';

export function ThreadGapBanner({
  hiddenCount,
  actionBusy,
  onLoadMore,
}: {
  hiddenCount: number;
  actionBusy?: boolean;
  onLoadMore?: ((mode?: string) => void | Promise<void>) | null;
}) {
  if (typeof onLoadMore !== 'function') return null;
  const n = Number(hiddenCount) || 0;
  return (
    <div
      className="prp-timeline-gap flex items-center gap-3 my-3.5 px-1"
      role="region"
      aria-label="Hidden review threads"
    >
      <div className="prp-timeline-gap__line" aria-hidden="true" />
      <div className="prp-timeline-gap__body flex flex-col items-center gap-0.5 shrink-0 text-center">
        <span className="prp-timeline-gap__count text-xs text-[var(--prp-fg-muted)] leading-snug">
          {n > 0 ? `${n} hidden items` : 'More review threads'}
        </span>
        <div className="prp-timeline-gap__actions inline-flex items-center gap-2 flex-wrap justify-center">
          <button
            type="button"
            className="prp-timeline-gap__load text-xs font-semibold text-[var(--prp-accent)] bg-transparent border-0 cursor-pointer px-1 py-0.5"
            disabled={actionBusy}
            onClick={() => void onLoadMore?.()}
            title="Load more review threads between newest and oldest"
          >
            Load more…
          </button>
          <button
            type="button"
            className="prp-timeline-gap__load text-xs font-semibold text-[var(--prp-accent)] bg-transparent border-0 cursor-pointer px-1 py-0.5"
            disabled={actionBusy}
            onClick={() => void onLoadMore?.('all')}
            title="Load every remaining review thread"
          >
            Load all
          </button>
        </div>
      </div>
      <div className="prp-timeline-gap__line" aria-hidden="true" />
    </div>
  );
}
