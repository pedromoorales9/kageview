import React from 'react';
import type { AppRole } from '../../../modules/backend';

const META: Record<Exclude<AppRole, 'user'>, { label: string; icon: string; cls: string }> = {
  owner: {
    label: 'Owner',
    icon: 'workspace_premium',
    cls: 'bg-gradient-to-r from-primary/90 to-[#ff7a59]/90 text-white shadow-[0_0_14px_-2px_rgba(255,61,90,0.6)]',
  },
  admin: {
    label: 'Admin',
    icon: 'shield_person',
    cls: 'bg-pink-400/15 text-pink-200 ring-1 ring-pink-300/30',
  },
};

/** Insignia de rol (no pinta nada para usuarios normales). */
export default function RoleBadge({ role, className = '' }: { role: AppRole | undefined; className?: string }) {
  if (!role || role === 'user') return null;
  const m = META[role];
  return (
    <span
      className={`inline-flex items-center gap-1 h-[20px] px-2 rounded-full text-[10.5px] font-bold uppercase tracking-[0.08em] ${m.cls} ${className}`}
    >
      <span className="material-symbols-outlined text-[13px]" aria-hidden>{m.icon}</span>
      {m.label}
    </span>
  );
}
