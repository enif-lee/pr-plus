import React from 'react';
import { githubLabelUrl } from '@lib/ui-polish';
import './EntityLinks.css';

export function LabelLink({ owner, repo, label, className = '' }: any) {
  const name = label?.name || label;
  if (!name) return null;
  const href =
    typeof githubLabelUrl === 'function'
      ? githubLabelUrl(owner, repo, name)
      : `https://github.com/${owner}/${repo}/labels/${encodeURIComponent(name)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`prp-label ${className}`.trim()}
      style={
        label?.color
          ? {
              borderColor: `#${label.color}`,
              background: `#${label.color}22`,
            }
          : undefined
      }
      title={label?.description || name}
    >
      {name}
    </a>
  );
}
