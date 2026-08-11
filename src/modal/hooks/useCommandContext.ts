/**
 * Live command bag helpers (Phase 7).
 * App fills bags each render; command modules read them on invoke.
 */
import { useMemo, useRef } from 'react';
import { installPrModalMutations } from '../commands/domain-mutations';
import { installReviewActions } from '../commands/review-actions';
import { installSideActions } from '../commands/side-actions';

export function useCommandContext() {
  const mutD = useRef<Record<string, any>>({}).current;
  const reviewBag = useRef<Record<string, any>>({}).current;
  const sideBag = useRef<Record<string, any>>({}).current;
  const mut = useMemo(() => installPrModalMutations(mutD), [mutD]);
  const reviewAct = useMemo(() => installReviewActions(reviewBag), [reviewBag]);
  const sideAct = useMemo(() => installSideActions(sideBag), [sideBag]);
  return { mutD, reviewBag, sideBag, mut, reviewAct, sideAct };
}
