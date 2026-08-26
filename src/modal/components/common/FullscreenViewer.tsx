import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from './icons';
import { resolveMermaidColorMode } from '../../lib/mermaid-lazy';
import { useModalStore } from '../../store/modal-store';
import { registerEscapeOverlay } from '../../lib/escape-layer';
import './FullscreenViewer.css';

export type FullscreenViewerLayer = 'image' | 'mermaid' | 'markdown';

export type FullscreenViewerProps = {
  layer: FullscreenViewerLayer;
  title: React.ReactNode;
  ariaLabel?: string;
  hint?: React.ReactNode;
  /** Extra chrome to the left of the close button (Reset, Show diff, …). */
  actions?: React.ReactNode;
  onClose: () => void;
  closeLabel: string;
  closeTitle?: string;
  children: React.ReactNode;
  stageRef?: React.Ref<HTMLDivElement>;
  panning?: boolean;
  stageClassName?: string;
  stageProps?: React.HTMLAttributes<HTMLDivElement>;
  rootProps?: React.HTMLAttributes<HTMLDivElement>;
};

const LAYER_ATTR: Record<FullscreenViewerLayer, string> = {
  image: 'data-prp-image-viewer',
  mermaid: 'data-prp-mermaid-viewer',
  markdown: 'data-prp-md-viewer',
};

function resolvePortalHost(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const overlay = document.querySelector('.prp-overlay') as HTMLElement | null;
  return overlay || document.body;
}

/**
 * Shared fullscreen overlay chrome (image / diagram / markdown).
 * Esc is owned by the overlay stack; varying body is `children`.
 */
export function FullscreenViewer({
  layer,
  title,
  ariaLabel,
  hint,
  actions,
  onClose,
  closeLabel,
  closeTitle,
  children,
  stageRef,
  panning = false,
  stageClassName = '',
  stageProps,
  rootProps,
}: FullscreenViewerProps) {
  const portalHost = useMemo(() => resolvePortalHost(), []);
  const colorMode = resolveMermaidColorMode();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    return registerEscapeOverlay(() => onCloseRef.current());
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    try {
      useModalStore.getState().setOptHintsActive(false);
    } catch {
      /* ignore */
    }
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!portalHost) return null;

  const label =
    ariaLabel || (typeof title === 'string' ? title : undefined) || closeLabel;
  const stageCls = [
    'prp-overlay-viewer__stage',
    panning ? 'prp-overlay-viewer__stage--panning' : '',
    layer === 'markdown' ? 'prp-overlay-viewer__stage--doc' : '',
    stageClassName,
  ]
    .filter(Boolean)
    .join(' ');

  const node = (
    <div
      className={`prp-overlay-viewer prp-overlay-viewer--${layer}`}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-color-mode={colorMode}
      {...{ [LAYER_ATTR[layer]]: '1' }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      {...rootProps}
    >
      <div
        className="prp-overlay-viewer__backdrop"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-hidden="true"
      />
      <div className="prp-overlay-viewer__chrome">
        <div className="prp-overlay-viewer__bar">
          <span className="prp-overlay-viewer__title" title={typeof title === 'string' ? title : undefined}>
            {title}
          </span>
          {hint ? (
            <span className="prp-overlay-viewer__hint prp-muted">{hint}</span>
          ) : null}
          <div className="prp-overlay-viewer__actions">
            {actions}
            <button
              type="button"
              className="prp-icon-btn prp-overlay-viewer__close"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              aria-label={closeLabel}
              title={closeTitle || closeLabel}
            >
              <IconX size={16} />
            </button>
          </div>
        </div>
        <div ref={stageRef} className={stageCls} {...stageProps}>
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(node, portalHost);
}

export default FullscreenViewer;
