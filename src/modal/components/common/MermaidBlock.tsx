import React, { useEffect, useId, useRef, useState } from 'react';
import {
  ensureMermaid,
  initMermaid,
  resolveMermaidColorMode,
} from '../../lib/mermaid-lazy';
import {
  mermaidSourceKey,
  shouldRunMermaidHeavyWork,
  shouldShowHeavyPlaceholder,
} from '../../lib/scroll-idle-render';
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
 * Renders a ```mermaid fence via lazy-loaded Mermaid (dist/mermaid.esm.js).
 *
 * Conversation virtual list: defer ensureMermaid/render while the scroller is
 * actively scrolling (ConversationScrollIdleContext). Outside conversation
 * (composer preview, etc.) the context defaults to idle → render immediately.
 * Scroll end does not re-run heavy work when SVG is already cached for the
 * same code+theme (avoids flash / jank).
 *
 * Important: never write SVG via element.innerHTML on a React-managed node that
 * also has children — that corrupts the fiber tree (removeChild crash) and can
 * tear down the whole modal root. SVG is held in React state instead.
 */
export function MermaidBlock({ code }: { code?: string }) {
  const reactId = useId().replace(/:/g, '');
  const colorMode = useShellColorMode();
  const mermaidTheme = colorMode === 'dark' ? 'dark' : 'neutral';
  const { isScrolling } = useConversationScrollIdle();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  /** Inline (max-height fitted) SVG for conversation card. */
  const [svg, setSvg] = useState('');
  /**
   * Full-resolution Mermaid output (pre-fit). Fullscreen viewer must use this
   * so pan/zoom scales a large vector, not the thumbnail width/height.
   */
  const [svgFull, setSvgFull] = useState('');
  const [viewerOpen, setViewerOpen] = useState(false);
  /** Last successfully rendered code+theme identity (survives scroll toggles). */
  const cachedKeyRef = useRef<string>('');
  const svgRef = useRef(svg);
  svgRef.current = svg;

  useEffect(() => {
    let cancelled = false;
    const source = String(code || '').trim();
    const sourceKey = mermaidSourceKey(source, mermaidTheme);
    if (!source) {
      setBusy(false);
      setSvg('');
      setSvgFull('');
      cachedKeyRef.current = '';
      setErr('Empty mermaid diagram');
      return undefined;
    }

    const runHeavy = shouldRunMermaidHeavyWork({
      isScrolling,
      hasCachedResult: Boolean(svgRef.current),
      sourceKey,
      cachedSourceKey: cachedKeyRef.current,
    });

    // Scrolling, or idle with a valid cache for this source: do not touch SVG.
    if (!runHeavy) {
      if (isScrolling && !svgRef.current) {
        setBusy(true);
        setErr(null);
      } else if (!isScrolling && svgRef.current && cachedKeyRef.current === sourceKey) {
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

      let eng: any = null;
      try {
        eng = await ensureMermaid();
      } catch (e: any) {
        if (!cancelled) {
          setBusy(false);
          setErr(e?.message || 'Failed to load Mermaid');
        }
        return;
      }
      if (cancelled) return;

      if (!eng || typeof eng.render !== 'function') {
        setBusy(false);
        setErr('Mermaid unavailable');
        return;
      }

      const id = `prp-mmd-${reactId}-${Date.now().toString(36)}`;
      try {
        // look: handDrawn; theme: neutral (light) | dark (dark shell)
        initMermaid(eng, mermaidTheme);
        const result = await eng.render(id, source);
        if (cancelled) return;
        const out = result && typeof result.svg === 'string' ? result.svg : '';
        if (!out) {
          setBusy(false);
          setErr('Mermaid returned empty SVG');
          return;
        }
        // Keep full SVG for fullscreen viewer; fit only the conversation card.
        const fitted =
          typeof fitMermaidSvgInline === 'function'
            ? fitMermaidSvgInline(out, {
                maxHeight: MERMAID_INLINE_MAX_HEIGHT_PX,
              })
            : out;
        setSvgFull(out);
        setSvg(fitted);
        cachedKeyRef.current = sourceKey;
        setBusy(false);
        setErr(null);
      } catch (e: any) {
        if (cancelled) return;
        setBusy(false);
        setSvg('');
        setSvgFull('');
        cachedKeyRef.current = '';
        setErr(e?.message || String(e));
        try {
          document.getElementById(id)?.remove();
          document.getElementById(`d${id}`)?.remove();
        } catch {
          /* ignore */
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [code, reactId, mermaidTheme, isScrolling]);

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
