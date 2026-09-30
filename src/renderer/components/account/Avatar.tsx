import React from 'react';
import { safeAvatarUrl } from '../../../modules/safeUrl';

interface AvatarProps {
  profile?: {
    username: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  } | null;
  size?: number;
  className?: string;
}

// Degradados de la paleta de la marca para el avatar por defecto
const GRADIENTS = [
  'from-[#ff3d5a] to-[#7a1230]',
  'from-[#ff8fa8] to-[#c81a3f]',
  'from-[#e3234a] to-[#3a0a18]',
  'from-[#ffc2d1] to-[#ff5c78]',
  'from-[#c81a3f] to-[#1a0d14]',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Foto de perfil, o iniciales sobre un degradado estable si no hay foto. */
export default function Avatar({ profile, size = 40, className = '' }: AvatarProps) {
  const name = profile?.displayName || profile?.username || '?';
  const style: React.CSSProperties = { width: size, height: size, fontSize: Math.max(11, size * 0.4) };

  const avatarUrl = safeAvatarUrl(profile?.avatarUrl);
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className={`rounded-full object-cover bg-surface-container-high flex-none ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const gradient = GRADIENTS[hash(profile?.username ?? name) % GRADIENTS.length];
  return (
    <div
      aria-label={name}
      className={`rounded-full flex-none flex items-center justify-center font-semibold text-white bg-gradient-to-br ${gradient} ${className}`}
      style={style}
    >
      {name.trim().charAt(0).toUpperCase()}
    </div>
  );
}
