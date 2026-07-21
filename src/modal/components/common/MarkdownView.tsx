import React, { useMemo , memo} from 'react';
// memo for render isolation
import { parseSuggestionFences } from '@lib/pr-edit-api';
import { splitMarkdownSegments } from '@lib/markdown-composer';
import { MermaidBlock } from './MermaidBlock';
import { SuggestionBlock } from './SuggestionBlock';
import { renderMdHtml } from './utils';

function MarkdownViewImpl({
  source,
  className = '',
  onApplySuggestion,
  canApplySuggestion,
  actionBusy,
  onRegisterApply,
  linkCtx,
}: any) {
  const raw = source == null || source === '' ? '_No content_' : String(source);
  const suggestions =
    typeof parseSuggestionFences === 'function' ? parseSuggestionFences(raw) : [];
  const segments = useMemo(() => {
    // Split mermaid first, then peel suggestion fences from md segments for rich render
    const base =
      typeof splitMarkdownSegments === 'function'
        ? splitMarkdownSegments(raw)
        : [{ type: 'md', content: raw }];
    const out = [];
    for (const seg of base) {
      if (seg.type !== 'md') {
        out.push(seg);
        continue;
      }
      const text = seg.content || '';
      const re = /```suggestion[^\n]*\r?\n([\s\S]*?)```/gi;
      let last = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) out.push({ type: 'md', content: text.slice(last, m.index) });
        out.push({ type: 'suggestion', content: m[1].replace(/\n$/, '') });
        last = m.index + m[0].length;
      }
      if (last < text.length) out.push({ type: 'md', content: text.slice(last) });
      if (!last && !out.length) out.push(seg);
    }
    return out.length ? out : [{ type: 'md', content: raw }];
  }, [raw]);
  return (
    <div className={`prp-md ${className}`.trim()}>
      {segments.map((seg, i) => {
        if (seg.type === 'mermaid') {
          return <MermaidBlock key={`m-${i}`} code={seg.content} />;
        }
        if (seg.type === 'suggestion') {
          return (
            <SuggestionBlock
              key={`s-${i}`}
              content={seg.content}
              canApply={Boolean(canApplySuggestion)}
              actionBusy={actionBusy}
              onApply={() => onApplySuggestion?.(seg.content, suggestions)}
              onRegisterApply={onRegisterApply}
            />
          );
        }
        return (
          <div
            key={`h-${i}`}
            dangerouslySetInnerHTML={{
              __html: renderMdHtml(seg.content || '', linkCtx),
            }}
          />
        );
      })}
    </div>
  );
}

export const MarkdownView = memo(MarkdownViewImpl);
export default MarkdownView;
