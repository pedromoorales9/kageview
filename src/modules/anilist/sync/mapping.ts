// ═══════════════════════════════════════════════════════════
// Conversiones entre KageView y AniList (funciones puras, con tests)
// ═══════════════════════════════════════════════════════════

import type { LibraryEntry, MediaSnapshot } from '../../backend';
import type { MangaLibraryStatus, MangaRecord } from '../../manga/mangaStore';
import type { MangaModel } from '../../manga/types';
import type { Range } from '../../manga/readRanges';
import { safeCoverUrl } from '../../safeUrl';
import type { ALEntry, ALMedia, ALStatus, EntrySnap } from './types';
import type { Side } from './merge';

// ─── Estados del manga ─────────────────────────────────────
export const MANGA_TO_AL: Record<MangaLibraryStatus, ALStatus> = {
  reading: 'CURRENT',
  completed: 'COMPLETED',
  planning: 'PLANNING',
  dropped: 'DROPPED',
};

/** AniList tiene dos estados más (en pausa, releyendo): en KageView cuentan como «leyendo». */
export function alToManga(status: ALStatus): MangaLibraryStatus {
  switch (status) {
    case 'COMPLETED': return 'completed';
    case 'PLANNING': return 'planning';
    case 'DROPPED': return 'dropped';
    default: return 'reading'; // CURRENT, PAUSED, REPEATING
  }
}

/**
 * Estado de AniList equivalente al de KageView. Si el estado local es el que ya
 * se derivó del estado acordado (p. ej. EN PAUSA → «leyendo»), se conserva el
 * estado de AniList: así no se pisa «en pausa» con «leyendo» sin que nadie lo cambie.
 */
export function mangaStatusToAL(local: MangaLibraryStatus, base: ALStatus | null): ALStatus {
  if (base && alToManga(base) === local) return base;
  return MANGA_TO_AL[local];
}

// ─── Progreso del manga (capítulos leídos ↔ número de AniList) ─
/** Mayor capítulo leído (parte entera), 0 si no hay ninguno. */
export function progressFromRanges(ranges: readonly Range[] | undefined): number {
  if (!ranges || ranges.length === 0) return 0;
  let max = 0;
  for (const [, to] of ranges) if (to > max) max = to;
  return Math.max(0, Math.floor(max));
}

// ─── «Lados» para la fusión ────────────────────────────────
/** Estado de un manga de KageView, en términos de AniList. null = no está en la biblioteca. */
export function mangaSide(rec: MangaRecord, baseStatus: ALStatus | null): Side | null {
  if (!rec.status) return null;
  return {
    status: mangaStatusToAL(rec.status, baseStatus),
    progress: progressFromRanges(rec.readRanges),
    score: 0, // el manga de KageView no tiene nota (se ignora en la fusión)
    at: Math.max(rec.updatedAt, rec.last?.at ?? 0),
  };
}

export function animeSide(e: LibraryEntry | undefined): Side | null {
  if (!e) return null;
  return {
    status: e.status,
    progress: Math.max(0, Math.floor(e.progress)),
    score: clampScore(e.score),
    at: Date.parse(e.updatedAt) || 0,
  };
}

export function remoteSide(e: ALEntry | undefined): Side | null {
  if (!e) return null;
  return { status: e.status, progress: Math.max(0, e.progress), score: clampScore(e.score), at: e.updatedAt };
}

export const clampScore = (n: unknown): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 0;
  return Math.max(0, Math.min(100, v));
};

export const toSnap = (s: Side): EntrySnap => ({ status: s.status, progress: s.progress, score: s.score });

// ─── Fichas ────────────────────────────────────────────────
/** Título para mostrar: el de preferencia en español/inglés, si no el romaji. */
export const mediaTitle = (m: Pick<ALMedia, 'title'>): string =>
  m.title.english || m.title.romaji || m.title.native || 'Sin título';

/** Instantánea de un anime para guardarla en la lista de KageView. */
export function mediaToSnapshot(m: ALMedia): MediaSnapshot {
  return {
    id: m.id,
    idMal: m.idMal,
    title: { romaji: m.title.romaji ?? m.title.english ?? m.title.native ?? '', english: m.title.english, native: m.title.native },
    coverImage: {
      extraLarge: m.coverImage.extraLarge,
      large: m.coverImage.large ?? m.coverImage.extraLarge ?? '',
      color: m.coverImage.color,
    },
    bannerImage: m.bannerImage,
    episodes: m.episodes,
    genres: m.genres.slice(0, 8),
    averageScore: m.averageScore,
    status: m.status,
    seasonYear: m.seasonYear,
    format: m.format,
  };
}

const MANGA_STATUS: Record<string, MangaModel['status']> = {
  FINISHED: 'completed',
  RELEASING: 'ongoing',
  NOT_YET_RELEASED: 'ongoing',
  CANCELLED: 'cancelled',
  HIATUS: 'hiatus',
};

/** Ficha de KageView para un manga que solo existe en AniList (aún sin fuente de lectura). */
export function mediaToMangaModel(m: ALMedia): MangaModel {
  return {
    id: String(m.id),
    sourceId: ANILIST_SOURCE_ID,
    title: mediaTitle(m).slice(0, 300),
    description: '',
    coverUrl: safeCoverUrl(m.coverImage.extraLarge) ?? safeCoverUrl(m.coverImage.large) ?? '',
    status: MANGA_STATUS[m.status ?? ''] ?? 'ongoing',
    tags: m.genres.slice(0, 8),
    year: m.startYear ?? m.seasonYear ?? null,
    lastChapter: m.chapters ? String(m.chapters) : null,
    isAdult: m.isAdult,
  };
}

/** `sourceId` de los mangas importados de AniList que todavía no tienen fuente de lectura. */
export const ANILIST_SOURCE_ID = 'anilist';
export const isAniListPlaceholder = (m: { sourceId: string }): boolean => m.sourceId === ANILIST_SOURCE_ID;
