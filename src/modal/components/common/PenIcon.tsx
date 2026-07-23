import React from 'react';
import { IconPencil } from './icons';

/** @deprecated Prefer IconPencil from @common/icons — kept for existing call sites. */
export function PenIcon({ className = '', size = 14 }: { className?: string; size?: number }) {
  return <IconPencil className={className} size={size} />;
}

export default PenIcon;
