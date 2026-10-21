import React, { useEffect, useId, useRef, useState } from 'react';
import { renderOndine, resolveMermaidColorMode } from '../../lib/ondine-client';
import { useT } from '../../lib/locale-context';
import {
  mermaidSourceKey,
  shouldRunMermaidHeavyWork,
  shouldShowHeavyPlaceholder,
} from '../../lib/scroll-idle-render';
import {
  getMermaidSvgCache,
  setMermaidSvgCache,
} from '../../lib/mermaid-svg-cache';
import {
  fitMermaidSvgInline,
  MERMAID_INLINE_MAX_HEIGHT_PX,
} from '../../lib/mermaid-viewer';
import { useConversationScrollIdle } from '../../views/conversation/ConversationScrollIdleContext';
import { IconFullscreen } from './icons';
import { MermaidViewer } from './MermaidViewer';
import './MermaidBlock.css';

/** Track PR modal shell light/dark so diagrams re-render when theme flips. */
function useShellColorMode(): 'light' | 'dark' {
  const [mode, setMode] = useState<'light' | 'dark'>(() => resolveMermaidColorMode());
  useEffect(() => {
    const el = document.querySelector('.prp-overlay');
    if (!el) {
      setMode(resolveMermaidColorMode());
      return undefined;
    }
    const sync = () => setMode(resolveMermaidColorMode());
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ['data-color-mode', 'class'] });
    return () => obs.disconnect();
  }, []);
  return mode;
}

/**
 * Ondine SVG reads colors from `--ondine-*` CSS vars (MarkdownComposer.css),
 * so one render serves both shell themes.
 */
const ONDINE_CACHE_THEME = 'ondine';

/**
 * Renders a ```mermaid fence via Ondine (WASM in the service worker, see
 * lib/ondine-client).
 *
 * Conversation virtual list: defer renderOndine while the scroller is
 * actively scrolling (ConversationScrollIdleContext). Outside conversation
 * (composer preview, etc.) the context defaults to idle → render immediately.
 * Scroll end does not re-run heavy work when SVG is already cached for the
 * same code (avoids flash / jank).
 *
 * Module LRU (`mermaid-svg-cache`) survives virtual-list unmount/remount so
 * diagrams that leave and re-enter the viewport reuse SVG without eng.render.
 *
 * Important: never write SVG via element.innerHTML on a React-managed node that
 * also has children — that corrupts the fiber tree (removeChild crash) and can
 * tear down the whole modal root. SVG is held in React state instead.
 */
export function MermaidBlock({ code }: { code?: string }) {
  const reactId = useId().replace(/:/g, '');
  const colorMode = useShellColorMode();
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;
  const { isScrolling } = useConversationScrollIdle();
  const sourceTrim = String(code || '').trim();
  const initialKey = mermaidSourceKey(sourceTrim, ONDINE_CACHE_THEME);
  const initialHit = sourceTrim ? getMermaidSvgCache(initialKey) : null;

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(() => !initialHit);
  /** Inline (max-height fitted) SVG for conversation card. */
  const [svg, setSvg] = useState(() => initialHit?.svgFitted || '');
  /**
   * Full-resolution Mermaid output (pre-fit). Fullscreen viewer must use this
   * so pan/zoom scales a large vector, not the thumbnail width/height.
   */
  const [svgFull, setSvgFull] = useState(() => initialHit?.svgFull || '');
  const [viewerOpen, setViewerOpen] = useState(false);
  /**
   * Last successfully rendered code identity.
   * Component ref covers scroll-while-mounted; module LRU covers remount.
   */
  const cachedKeyRef = useRef<string>(initialHit ? initialKey : '');
  const svgRef = useRef(svg);
  svgRef.current = svg;

  useEffect(() => {
    let cancelled = false;
    const source = String(code || '').trim();
    const sourceKey = mermaidSourceKey(source, ONDINE_CACHE_THEME);
    if (!source) {
      setBusy(false);
      setSvg('');
      setSvgFull('');
      cachedKeyRef.current = '';
      setErr('Empty mermaid diagram');
      return undefined;
    }

    // Virtual-list remount: module LRU survives unmount — restore SVG and
    // skip eng.render entirely (even while scrolling).
    const moduleHit = getMermaidSvgCache(sourceKey);
    if (moduleHit?.svgFitted) {
      setSvg(moduleHit.svgFitted);
      setSvgFull(moduleHit.svgFull || moduleHit.svgFitted);
      cachedKeyRef.current = sourceKey;
      setBusy(false);
      setErr(null);
      return undefined;
    }

    const runHeavy = shouldRunMermaidHeavyWork({
      isScrolling,
      hasCachedResult: Boolean(svgRef.current),
      sourceKey,
      cachedSourceKey: cachedKeyRef.current,
    });

    // Scrolling, or idle with a valid component cache: do not re-render.
    if (!runHeavy) {
      if (isScrolling && !svgRef.current) {
        setBusy(true);
        setErr(null);
      } else if (
        !isScrolling &&
        svgRef.current &&
        cachedKeyRef.current === sourceKey
      ) {
        setBusy(false);
      }
      return undefined;
    }

    async function run() {
      setBusy(true);
      setErr(null);
      setSvg('');
      setSvgFull('');
      cachedKeyRef.current = '';

      const res = await renderOndine(source, {
        idPrefix: `prp-mmd-${reactId}-${Date.now().toString(36)}-`,
      });
      if (cancelled) return;

      if (res.ok === false) {
        setBusy(false);
        setErr(
          res.unavailable ? tRef.current('diagram_renderer_unavailable') : res.error
        );
        return;
      }

      const out = res.svg;
      // Keep full SVG for fullscreen viewer; fit only the conversation card.
      const fitted = fitMermaidSvgInline(out, {
        maxHeight: MERMAID_INLINE_MAX_HEIGHT_PX,
      });
      setSvgFull(out);
      setSvg(fitted);
      cachedKeyRef.current = sourceKey;
      setMermaidSvgCache(sourceKey, { svgFitted: fitted, svgFull: out });
      setBusy(false);
      setErr(null);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [code, reactId, isScrolling]);

  if (err) {
    return (
      <pre className="prp-mermaid prp-mermaid--error">
        <code>{code}</code>
        <div className="prp-muted">{err}</div>
      </pre>
    );
  }

  if (
    shouldShowHeavyPlaceholder({
      isScrolling,
      hasResult: Boolean(svg),
      busy,
    })
  ) {
    return (
      <div
        className="prp-mermaid prp-mermaid--loading"
        aria-busy="true"
        data-prp-mermaid-deferred={isScrolling ? '1' : '0'}
        data-prp-mermaid-skeleton="1"
      >
        <div className="prp-mermaid__skeleton" aria-hidden="true" />
        <span className="prp-muted prp-mermaid__loading">
          {isScrolling ? 'Diagram paused while scrolling…' : 'Rendering diagram…'}
        </span>
      </div>
    );
  }

  return (
    <div className="prp-mermaid-wrap" data-color-mode={colorMode}>
      <div className="prp-mermaid__chrome">
        <button
          type="button"
          className="prp-mermaid__expand"
          data-prp-mermaid-expand="1"
          onClick={() => setViewerOpen(true)}
          title="View diagram fullscreen"
          aria-label="View diagram fullscreen"
        >
          <IconFullscreen active={false} size={14} />
          <span>자세히 보기</span>
        </button>
      </div>
      <div
        className="prp-mermaid"
        dangerouslySetInnerHTML={{ __html: svg }}
        onDoubleClick={() => setViewerOpen(true)}
        title="Double-click or use 자세히 보기 for fullscreen"
      />
      {viewerOpen && (svgFull || svg) ? (
        <MermaidViewer
          svg={svgFull || svg}
          title="Diagram"
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default MermaidBlock;
