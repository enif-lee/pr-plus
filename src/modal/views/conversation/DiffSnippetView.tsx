import React, { useEffect, useState } from 'react';
import { clearHighlightCodeCache, highlightCode } from '@common/utils';
import {
  ensureHljsLanguageForPath,
  onHljsLanguagesChanged,
} from '@lib/hljs-lazy';

/** Code context under conversation items — hljs when path known. */
export function DiffSnippetView({ snippet, filePath }: any) {
  const path = filePath || snippet?.path || snippet?.filePath || '';
  const [hljsEpoch, setHljsEpoch] = useState(0);
  useEffect(() => {
    if (path) void ensureHljsLanguageForPath(path);
    return onHljsLanguagesChanged(() => {
      clearHighlightCodeCache();
      setHljsEpoch((n) => n + 1);
    });
  }, [path]);

  if (!snippet?.lines?.length) return null;
  const lines = snippet.lines;
  const scroll = lines.length > 30;
  // hljsEpoch forces re-highlight after lazy grammar load
  void hljsEpoch;
  return (
    <pre
      className={`prp-diff-snippet${scroll ? ' prp-diff-snippet--scroll' : ''}`}
      aria-label="Code context"
    >
      <span className="prp-diff-snippet__block">
        {lines.map((L: any, i: number) => {
          const raw = L.text == null ? '' : String(L.text);
          // Strip leading +/- for highlight of code body when present
          const codeBody =
            L.type === 'add' || L.type === 'del' || L.type === 'context'
              ? raw.replace(/^[\+\- ]/, '')
              : raw;
          const html =
            path && (L.type === 'add' || L.type === 'del' || L.type === 'context')
              ? highlightCode(codeBody, path)
              : null;
          return (
            <div
              key={i}
              className={`prp-diff-snippet__line prp-diff-snippet__line--${L.type}${
                L.highlight ? ' prp-diff-snippet__line--hit' : ''
              }`}
            >
              {html != null ? (
                <>
                  <span className="prp-diff-snippet__mark" aria-hidden="true">
                    {L.type === 'add' ? '+' : L.type === 'del' ? '−' : ' '}
                  </span>
                  <code
                    className="hljs prp-diff-snippet__code"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                </>
              ) : (
                raw
              )}
            </div>
          );
        })}
      </span>
    </pre>
  );
}

export default DiffSnippetView;
