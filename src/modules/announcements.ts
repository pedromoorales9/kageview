// ═══════════════════════════════════════════════════════════
// announcements — presentación y estado local de los anuncios
//
// Qué anuncio se muestra y cuáles ya descartó el usuario (localStorage, por
// dispositivo; todo va envuelto en try/catch por si el almacenamiento falla).
// ═══════════════════════════════════════════════════════════

import type { Announcement, AnnouncementKind, AnnouncementPlatform } from './backend';

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

// ─── Segmentación (sistema y versión) ──────────────────────
export type AppPlatform = Exclude<AnnouncementPlatform, 'all'> | 'unknown';

export const PLATFORM_LABEL: Record<AnnouncementPlatform, string> = {
  all: 'Todos los sistemas',
  mac: 'Solo macOS',
  windows: 'Solo Windows',
  linux: 'Solo Linux',
};

/** `process.platform` de Electron → plataforma de los anuncios. */
export function toAppPlatform(nodePlatform: string | undefined): AppPlatform {
  if (nodePlatform === 'darwin') return 'mac';
  if (nodePlatform === 'win32') return 'windows';
  if (nodePlatform === 'linux') return 'linux';
  return 'unknown';
}

const VERSION_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isValidVersion(v: string): boolean {
  return VERSION_RE.test(v);
}

/** Compara "1.4.0" con "1.10.2" numéricamente (-1, 0, 1); null si alguna no es válida. */
export function compareVersions(a: string, b: string): number | null {
  const pa = VERSION_RE.exec(a);
  const pb = VERSION_RE.exec(b);
  if (!pa || !pb) return null;
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export interface AudienceContext {
  platform: AppPlatform;
  /** null = no se pudo leer (entonces no se filtra por versión). */
  version: string | null;
}

/** ¿Debe ver este anuncio esta instalación? Ante la duda (contexto desconocido) sí. */
export function matchesAudience(
  a: Pick<Announcement, 'platform' | 'belowVersion'>,
  ctx: AudienceContext
): boolean {
  if (a.platform && a.platform !== 'all' && ctx.platform !== 'unknown' && a.platform !== ctx.platform) return false;
  if (a.belowVersion && ctx.version) {
    const cmp = compareVersions(ctx.version, a.belowVersion);
    if (cmp !== null && cmp >= 0) return false; // ya tiene esa versión o una más nueva
  }
  return true;
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
