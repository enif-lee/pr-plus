import React from 'react';
import { githubTreeUrl } from '@lib/ui-polish';

/**
 * Link a git branch/tag ref to the GitHub tree page.
 * Renders plain text when owner/repo/ref is incomplete.
 */
export function RefLink({
  owner,
  repo,
  refName,
  className = '',
  title,
  children,
  ...rest
}: any) {
  const name = refName != null ? String(refName) : '';
  if (!name) return <span className={className}>{children ?? '—'}</span>;

  const href =
    typeof githubTreeUrl === 'function'
      ? githubTreeUrl(owner, repo, name)
      : owner && repo
        ? `https://github.com/${owner}/${repo}/tree/${name}`
        : '';

  if (!href) {
    return (
      <span className={className} title={title || name} {...rest}>
        {children ?? name}
      </span>
    );
  }

  return (
    <a
      className={`prp-entity-link prp-entity-link--ref ${className}`.trim()}
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title || `View ${name} on GitHub`}
      {...rest}
    >
      {children ?? name}
    </a>
  );
}
