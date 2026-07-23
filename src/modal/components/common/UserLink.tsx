import React from 'react';
import { githubUserUrl } from '@lib/ui-polish';

export function UserLink({ login, className = '' }: any) {
  if (!login) return null;
  const href =
    typeof githubUserUrl === 'function' ? githubUserUrl(login) : `https://github.com/${login}`;
  return (
    <a
      className={`prp-entity-link prp-entity-link--user ${className}`.trim()}
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {login}
    </a>
  );
}
