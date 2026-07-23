import React, { useMemo, memo } from 'react';
// memo for render isolation
import { parseSuggestionFences } from '@lib/pr-edit-api';
import { splitMarkdownSegments } from '@lib/markdown-composer';
import { markSearchInHtml } from '@lib/search-index';
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
  /** When set, inject search marks into rendered markdown HTML */
  searchQuery = '',
  /** Plain-text start offset for current match (decoded textContent space) */
  searchCurrentStart = null,
  /** 0-based occurrence among matches in this block for current mark */
  searchOccurrenceIndex = null,
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

  const q = String(searchQuery || '').trim();

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
        let html = renderMdHtml(seg.content || '', linkCtx);
        if (q && typeof markSearchInHtml === 'function') {
          html = markSearchInHtml(html, q, {
            currentStart: searchCurrentStart,
            occurrenceIndex: searchOccurrenceIndex,
          });
        }
        return (
          <div
            key={`h-${i}`}
            dangerouslySetInnerHTML={{
              __html: html,
            }}
          />
        );
      })}
    </div>
  );
}

export const MarkdownView = memo(MarkdownViewImpl);
export default MarkdownView;
