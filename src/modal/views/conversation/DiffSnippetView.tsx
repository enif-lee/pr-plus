import React, { useEffect, useState } from 'react';
import { clearHighlightCodeCache, highlightCode } from '@common/utils';
import { useT } from '@lib/locale-context';
import { ensureHljsLanguageForPath, onHljsLanguagesChanged } from '@lib/hljs-lazy';
import './DiffSnippetView.css';

/** Code context under conversation items — hljs when path known. */
export function DiffSnippetView({ snippet, filePath }: any) {
  const t = useT();
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
  void hljsEpoch;
  return (
    <div className={`prp-diff-snippet${lines.length > 30 ? ' prp-diff-snippet--scroll' : ''}`}>
      <table className="prp-diff-snippet__block" aria-label={t('code_context')}>
        <tbody>
          {lines.map((line: any, i: number) => {
            const isCode = ['add', 'del', 'context'].includes(line.type);
            const raw = String(line.text ?? '');
            const code = isCode ? raw.slice(1) : raw;
            const html = path && isCode ? highlightCode(code, path) : null;
            return (
              <tr key={i} className={`prp-diff-snippet__line prp-diff-snippet__line--${line.type}`}>
                <td className="prp-diff-snippet__num">{line.type === 'hunk' ? '...' : line.oldLine}</td>
                <td className="prp-diff-snippet__num">{line.type === 'hunk' ? '...' : line.newLine}</td>
                <td className="prp-diff-snippet__body">
                  {isCode ? (
                    <span className="prp-diff-snippet__mark" aria-hidden="true">
                      {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                    </span>
                  ) : null}
                  {html != null ? (
                    <code className="hljs prp-diff-snippet__code" dangerouslySetInnerHTML={{ __html: html }} />
                  ) : <code className="prp-diff-snippet__code">{code}</code>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default DiffSnippetView;
