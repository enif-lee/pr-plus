import React, { useState } from 'react';
import { avatarInitials } from './utils';
import { githubAvatarUrl } from '@lib/ui-polish';

/**
 * User avatar: GitHub profile image with initials fallback.
 */
export function Avatar({
  login,
  avatarUrl,
  size = 'md',
  className = '',
  title,
}: {
  login?: string | null;
  avatarUrl?: string | null;
  size?: 'sm' | 'md';
  className?: string;
  title?: string;
}) {
  const [failed, setFailed] = useState(false);
  const name = String(login || '').trim().replace(/^@/, '');
  const px = size === 'sm' ? 44 : 56;
  const src =
    (avatarUrl && String(avatarUrl).trim()) ||
    (name && typeof githubAvatarUrl === 'function' ? githubAvatarUrl(name, px) : '');
  const sizeClass = size === 'sm' ? ' prp-avatar--sm' : '';
  const initials = avatarInitials(name || '?');

  if (!name && !src) {
    return (
      <span
        className={`prp-avatar${sizeClass} ${className}`.trim()}
        aria-hidden="true"
        title={title}
      >
        ?
      </span>
    );
  }

  if (!src || failed) {
    return (
      <span
        className={`prp-avatar${sizeClass} ${className}`.trim()}
        aria-hidden="true"
        title={title || name}
      >
        {initials}
      </span>
    );
  }

  return (
    <span
      className={`prp-avatar prp-avatar--img${sizeClass} ${className}`.trim()}
      aria-hidden="true"
      title={title || name}
    >
      <img
        src={src}
        alt=""
        width={size === 'sm' ? 22 : 28}
        height={size === 'sm' ? 22 : 28}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

export default Avatar;
