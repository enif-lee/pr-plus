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
  // Fetch 2× display size for retina; CSS: sm 22px / md 28px (aside people chips override smaller)
  const px = size === 'sm' ? 44 : 56;
  const src =
    (avatarUrl && String(avatarUrl).trim()) ||
    (name && typeof githubAvatarUrl === 'function' ? githubAvatarUrl(name, px) : '');
  const sizeTw = size === 'sm' ? 'h-[22px] w-[22px] text-[9px]' : 'h-7 w-7 text-[10px]';
  const initials = avatarInitials(name || '?');
  const displayPx = size === 'sm' ? 22 : 28;
  const base = `prp-avatar ${sizeTw} ${className}`.trim();

  if (!name && !src) {
    return (
      <span
        className={base}
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
        className={base}
        aria-hidden="true"
        title={title || name}
      >
        {initials}
      </span>
    );
  }

  return (
    <span
      className={`prp-avatar prp-avatar--img ${sizeTw} ${className}`.trim()}
      aria-hidden="true"
      title={title || name}
    >
      <img
        src={src}
        alt=""
        width={displayPx}
        height={displayPx}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

export default Avatar;
