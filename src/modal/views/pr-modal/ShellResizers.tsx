/**
 * PR modal shell edge resizers (side sheet + floating modal).
 * Layout geometry residual lives in views/chrome/ShellLayout.css.
 */
import React from 'react';
import {
  SHEET_MIN_WIDTH,
  MODAL_MIN_WIDTH,
  MODAL_MIN_HEIGHT,
} from '../../lib/shell-size';

export function ShellResizers({
  showSheetResizer,
  showModalResizer,
  appliedSheetWidth,
  appliedModalSize,
  vwNow,
  vhNow,
  onSheetResizeStart,
  onModalResizeStart,
}: {
  showSheetResizer: boolean;
  showModalResizer: boolean;
  appliedSheetWidth: number;
  appliedModalSize: { width: number; height: number };
  vwNow: number;
  vhNow: number;
  onSheetResizeStart: (e: React.PointerEvent) => void;
  onModalResizeStart: (e: React.PointerEvent) => void;
}) {
  return (
    <>
      {showSheetResizer ? (
        <div
          className="prp-shell-resizer prp-shell-resizer--sheet"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize side panel"
          aria-valuemin={SHEET_MIN_WIDTH}
          aria-valuemax={vwNow || undefined}
          aria-valuenow={appliedSheetWidth}
          tabIndex={0}
          onPointerDown={onSheetResizeStart}
        />
      ) : null}
      {showModalResizer ? (
        <div
          className="prp-shell-resizer prp-shell-resizer--modal"
          role="separator"
          aria-label="Resize modal panel"
          aria-valuemin={MODAL_MIN_WIDTH}
          aria-valuemax={vwNow || undefined}
          aria-orientation="horizontal"
          tabIndex={0}
          data-modal-min-h={MODAL_MIN_HEIGHT}
          data-modal-max-h={vhNow || undefined}
          onPointerDown={onModalResizeStart}
        />
      ) : null}
    </>
  );
}
