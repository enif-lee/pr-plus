/**
 * Conversation fold: "N hidden items · Load more… · Load all".
 * Single handle pages remaining reviewThreads and/or timelineItems.
 * May sit at list end or mid-list (threads complete, timeline still partial).
 */
import React from 'react';
import { useT } from '@lib/locale-context';
import './ThreadGapBanner.css';

export function ThreadGapBanner({
  hiddenCount,
  actionBusy,
  onLoadMore,
  gapPlacement = 'end',
}: {
  hiddenCount: number;
  actionBusy?: boolean;
  onLoadMore?: ((mode?: string) => void | Promise<void>) | null;
  /** 'end' | 'middle' — middle when older threads already painted past timeline window */
  gapPlacement?: string;
}) {
  const t = useT();
  if (typeof onLoadMore !== 'function') return null;
  const n = Number(hiddenCount) || 0;
  const mid = String(gapPlacement || 'end') === 'middle';
  return (
    <div
      className="prp-timeline-gap flex items-center gap-3 my-3.5 px-1"
      role="region"
      aria-label={
        mid
          ? 'Older conversation items not loaded yet'
          : 'More conversation items available'
      }
      data-gap-placement={mid ? 'middle' : 'end'}
    >
      <div className="prp-timeline-gap__line" aria-hidden="true" />
      <div className="prp-timeline-gap__body flex flex-col items-center gap-0.5 shrink-0 text-center">
        <span className="prp-timeline-gap__count text-xs text-[var(--prp-fg-muted)] leading-snug">
          {n > 0
            ? `${n} hidden items`
            : mid
              ? 'Older comments & events'
              : 'More conversation'}
        </span>
        <div className="prp-timeline-gap__actions inline-flex items-center gap-2 flex-wrap justify-center">
          <button
            type="button"
            className="prp-timeline-gap__load text-xs font-semibold text-[var(--prp-accent)] bg-transparent border-0 cursor-pointer px-1 py-0.5"
            disabled={actionBusy}
            onClick={() => void onLoadMore?.()}
            title="Load the next page of review threads and/or timeline items"
          >
            {t('cta_load_more')}
          </button>
          <button
            type="button"
            className="prp-timeline-gap__load text-xs font-semibold text-[var(--prp-accent)] bg-transparent border-0 cursor-pointer px-1 py-0.5"
            disabled={actionBusy}
            onClick={() => void onLoadMore?.('all')}
            title="Load every remaining review thread and timeline item"
          >
            {t('cta_load_all')}
          </button>
        </div>
      </div>
      <div className="prp-timeline-gap__line" aria-hidden="true" />
    </div>
  );
}
