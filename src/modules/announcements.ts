// ═══════════════════════════════════════════════════════════
// announcements — presentación y estado local de los anuncios
//
// Qué anuncio se muestra y cuáles ya descartó el usuario (localStorage, por
// dispositivo; todo va envuelto en try/catch por si el almacenamiento falla).
// ═══════════════════════════════════════════════════════════

import type { Announcement, AnnouncementKind } from './backend';

export interface KindMeta {
  label: string;
  icon: string;
  /** Clases Tailwind completas (literales, para que el JIT las detecte). */
  text: string;
  tint: string;
  ring: string;
  solid: string;
}

export const KIND_META: Record<AnnouncementKind, KindMeta> = {
  info: {
    label: 'Información', icon: 'info',
    text: 'text-sky-300', tint: 'bg-sky-400/10', ring: 'ring-sky-400/30', solid: 'bg-sky-400',
  },
  update: {
    label: 'Novedad', icon: 'auto_awesome',
    text: 'text-pink-300', tint: 'bg-pink-400/10', ring: 'ring-pink-400/30', solid: 'bg-pink-400',
  },
  event: {
    label: 'Evento', icon: 'celebration',
    text: 'text-violet-300', tint: 'bg-violet-400/10', ring: 'ring-violet-400/30', solid: 'bg-violet-400',
  },
  warning: {
    label: 'Aviso importante', icon: 'warning',
    text: 'text-amber-300', tint: 'bg-amber-400/10', ring: 'ring-amber-400/30', solid: 'bg-amber-400',
  },
  maintenance: {
    label: 'Mantenimiento', icon: 'build',
    text: 'text-orange-300', tint: 'bg-orange-400/10', ring: 'ring-orange-400/30', solid: 'bg-orange-400',
  },
};

export const KIND_ORDER: AnnouncementKind[] = ['info', 'update', 'event', 'warning', 'maintenance'];

/** Los avisos urgentes van primero en la cola. */
const PRIORITY: Record<AnnouncementKind, number> = { maintenance: 4, warning: 3, event: 2, update: 1, info: 0 };

export type AnnouncementState = 'live' | 'scheduled' | 'expired' | 'paused';

export function announcementState(a: Announcement, now = Date.now()): AnnouncementState {
  if (!a.active) return 'paused';
  if (Date.parse(a.startsAt) > now) return 'scheduled';
  if (a.expiresAt && Date.parse(a.expiresAt) <= now) return 'expired';
  return 'live';
}

/** Solo https (el servidor ya lo exige; aquí se vuelve a comprobar antes de abrir). */
export function isSafeLink(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

// ─── Descartados (por dispositivo) ─────────────────────────
const DISMISSED_KEY = 'kageview.dismissedAnnouncements';
const MAX_REMEMBERED = 200;

export function loadDismissed(): Set<number> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((n): n is number => typeof n === 'number') : []);
  } catch {
    return new Set();
  }
}

export function saveDismissed(set: Set<number>): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set].slice(-MAX_REMEMBERED)));
  } catch {
    /* sin almacenamiento: el aviso reaparecerá en el próximo arranque */
  }
}

/** Anuncios pendientes de mostrar de un tipo, del más urgente/nuevo al menos. */
export function pendingAnnouncements(
  all: Announcement[] | undefined,
  dismissed: Set<number>,
  display: Announcement['display']
): Announcement[] {
  return (all ?? [])
    .filter((a) => a.display === display && !dismissed.has(a.id) && announcementState(a) === 'live')
    .sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind] || b.id - a.id);
}
