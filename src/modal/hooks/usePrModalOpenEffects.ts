/**
 * Open-session domain projection helpers (Phase 7).
 * Host detail prop is the domain SoT; this documents the open-effect seam.
 */
import { useEffect, useRef } from 'react';

/**
 * Keep detailRef aligned with host detail prop (no local domain mirror).
 */
export function useHostDetailRef(detailProp: any) {
  const detailRef = useRef(detailProp);
  detailRef.current = detailProp;
  return detailRef;
}

/**
 * Reset ephemeral UI when PR identity changes (open / switch).
 */
export function usePrModalOpenEffects(opts: {
  open: boolean;
  prIdentity: string;
  onPrSwitch?: () => void;
}) {
  const { open, prIdentity, onPrSwitch } = opts;
  const prev = useRef<string>('');
  useEffect(() => {
    if (!open) return;
    if (prIdentity && prIdentity !== prev.current) {
      if (prev.current) onPrSwitch?.();
      prev.current = prIdentity;
    }
  }, [open, prIdentity, onPrSwitch]);
}
