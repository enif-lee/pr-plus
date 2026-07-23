import React, { useEffect, useRef, useState } from 'react';

export function MermaidBlock({ code }: { code?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      const eng = (globalThis as any).mermaid;
      if (!eng || !ref.current) {
        setErr('Mermaid unavailable');
        return;
      }
      try {
        eng.initialize?.({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
        const id = `prp-mmd-${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await eng.render(id, String(code || ''));
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [code]);
  if (err) {
    return (
      <pre className="prp-mermaid prp-mermaid--error">
        <code>{code}</code>
        <div className="prp-muted">{err}</div>
      </pre>
    );
  }
  return <div className="prp-mermaid" ref={ref} />;
}
