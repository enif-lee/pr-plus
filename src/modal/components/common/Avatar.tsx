import React, { useEffect, useState } from 'react';
import { avatarInitials } from './utils';
import { githubAvatarUrl } from '@lib/ui-polish';
import {
  avatarImageDecodingAttr,
  avatarImageLoadingAttr,
  isAvatarImageFailed,
  isAvatarImageWarm,
  markAvatarImageFailed,
  markAvatarImageWarm,
} from '@lib/avatar-image-cache';
import './Avatar.css';

/**
 * User avatar: GitHub profile image with initials fallback.
 * Warm URLs (already loaded this session) use loading=eager + decoding=sync
 * so virtual-scroll remounts paint from browser/memory cache without lazy delay.
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

  // Local fail mirrors session failed-set so remount skips broken img immediately
  const [failed, setFailed] = useState(() =>
    Boolean(src && isAvatarImageFailed(src))
  );

  // When src changes (different user), re-sync fail/warm state
  useEffect(() => {
    if (!src) {
      setFailed(false);
      return;
    }
    if (isAvatarImageFailed(src)) setFailed(true);
    else setFailed(false);
  }, [src]);

  if (!name && !src) {
    return (
      <span className={base} aria-hidden="true" title={title}>
        ?
      </span>
    );
  }

  if (!src || failed) {
    return (
      <span className={base} aria-hidden="true" title={title || name}>
        {initials}
      </span>
    );
  }

  const warm = isAvatarImageWarm(src);
  const loading = avatarImageLoadingAttr(src);
  const decoding = avatarImageDecodingAttr(src);

  return (
    <span
      className={`prp-avatar prp-avatar--img ${sizeTw} ${className}`.trim()}
      aria-hidden="true"
      title={title || name}
      data-avatar-warm={warm ? '1' : '0'}
    >
      <img
        src={src}
        alt=""
        width={displayPx}
        height={displayPx}
        loading={loading}
        decoding={decoding}
        referrerPolicy="no-referrer"
        data-avatar-loading={loading}
        onLoad={() => {
          markAvatarImageWarm(src);
        }}
        onError={() => {
          markAvatarImageFailed(src);
          setFailed(true);
        }}
      />
    </span>
  );
}

export default Avatar;
