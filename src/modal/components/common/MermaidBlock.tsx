import React, { useEffect, useId, useState } from 'react';
import {
  ensureMermaid,
  initMermaid,
  resolveMermaidColorMode,
} from '../../lib/mermaid-lazy';
import { IconFullscreen } from './icons';
import { MermaidViewer } from './MermaidViewer';

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
 * Important: never write SVG via element.innerHTML on a React-managed node that
 * also has children — that corrupts the fiber tree (removeChild crash) and can
 * tear down the whole modal root. SVG is held in React state instead.
 */
export function MermaidBlock({ code }: { code?: string }) {
  const reactId = useId().replace(/:/g, '');
  const colorMode = useShellColorMode();
  const mermaidTheme = colorMode === 'dark' ? 'dark' : 'neutral';
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [svg, setSvg] = useState('');
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const source = String(code || '').trim();
    if (!source) {
      setBusy(false);
      setSvg('');
      setErr('Empty mermaid diagram');
      return undefined;
    }

    async function run() {
      setBusy(true);
      setErr(null);
      setSvg('');

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
        setSvg(out);
        setBusy(false);
        setErr(null);
      } catch (e: any) {
        if (cancelled) return;
        setBusy(false);
        setSvg('');
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
  }, [code, reactId, mermaidTheme]);

  if (err) {
    return (
      <pre className="prp-mermaid prp-mermaid--error">
        <code>{code}</code>
        <div className="prp-muted">{err}</div>
      </pre>
    );
  }

  if (busy && !svg) {
    return (
      <div className="prp-mermaid prp-mermaid--loading" aria-busy="true">
        <span className="prp-muted prp-mermaid__loading">Rendering diagram…</span>
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
      {viewerOpen && svg ? (
        <MermaidViewer
          svg={svg}
          title="Diagram"
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default MermaidBlock;
