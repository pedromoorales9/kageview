// ═══════════════════════════════════════════════════════════
// library — Mis listas de anime (Supabase) y las de mis amigos
//
// La UI sigue trabajando con `AniListAnime` (+ `mediaListEntry`): aquí se
// convierte desde/hacia las instantáneas guardadas en `library_entries`, así
// las listas se pintan sin consultar AniList por cada entrada.
// ═══════════════════════════════════════════════════════════

import { getBackend, LibraryEntry, ListStatus, MediaSnapshot } from './backend';
import { useAppStore } from './store';
import { notify } from './notify';
import { AniListAnime, MyListEntry } from '../types/types';
import { safeCoverUrl } from './safeUrl';

const st = () => useAppStore.getState();

/** Instantánea mínima (< 2 KB) de un anime para guardarla en la lista. */
export function toSnapshot(a: AniListAnime): MediaSnapshot {
  return {
    id: a.id,
    idMal: a.idMal ?? null,
    title: { romaji: a.title.romaji, english: a.title.english, native: a.title.native },
    coverImage: {
      extraLarge: a.coverImage?.extraLarge ?? null,
      large: a.coverImage?.large ?? a.coverImage?.extraLarge ?? '',
      color: a.coverImage?.color ?? null,
    },
    bannerImage: a.bannerImage ?? null,
    episodes: a.episodes ?? null,
    genres: (a.genres ?? []).slice(0, 8),
    averageScore: a.averageScore ?? null,
    status: a.status ?? null,
    seasonYear: a.seasonYear ?? null,
  };
}

/** Reconstruye un AniListAnime (con `mediaListEntry`) desde una entrada guardada. */
export function entryToAnime(e: LibraryEntry): AniListAnime {
  const m = e.media;
  return {
    id: m.id ?? e.mediaId,
    idMal: m.idMal ?? null,
    title: {
      romaji: m.title?.romaji ?? '',
      english: m.title?.english ?? null,
      native: m.title?.native ?? '',
    },
    // Las portadas de la lista de OTRO usuario solo se cargan si son del CDN de AniList
    coverImage: {
      extraLarge: safeCoverUrl(m.coverImage?.extraLarge) ?? safeCoverUrl(m.coverImage?.large) ?? '',
      large: safeCoverUrl(m.coverImage?.large) ?? safeCoverUrl(m.coverImage?.extraLarge) ?? '',
      color: null,
    },
    bannerImage: safeCoverUrl(m.bannerImage),
    description: null,
    episodes: m.episodes ?? null,
    duration: null,
    genres: m.genres ?? [],
    averageScore: m.averageScore ?? null,
    status: (m.status as AniListAnime['status']) ?? 'FINISHED',
    season: null,
    seasonYear: m.seasonYear ?? null,
    studios: { nodes: [] },
    nextAiringEpisode: null,
    mediaListEntry: {
      id: 0,
      status: e.status,
      progress: e.progress,
      score: e.score,
    },
  };
}

const toMy = (e: LibraryEntry): MyListEntry => ({ status: e.status, progress: e.progress, score: e.score });

// ─── Índice de MI lista ────────────────────────────────────
export async function loadMyList(): Promise<void> {
  const backend = getBackend();
  if (!backend || st().account.status !== 'signedIn') return;
  try {
    const entries = await backend.listLibrary('anime');
    const index: Record<number, MyListEntry> = {};
    for (const e of entries) index[e.mediaId] = toMy(e);
    st().setMyList(index);
  } catch (err) {
    console.warn('[library] No se pudo cargar la lista:', err);
  }
}

export function clearMyList(): void {
  st().setMyList({});
}

// ─── Lecturas ──────────────────────────────────────────────
/** Mi lista de anime (opcionalmente filtrada por estado). */
export async function getUserList(status?: string): Promise<AniListAnime[]> {
  const backend = getBackend();
  if (!backend || st().account.status !== 'signedIn') return [];
  const entries = await backend.listLibrary('anime');
  return entries.filter((e) => !status || e.status === status).map(entryToAnime);
}

/** Lista de anime de un amigo (vacía si no la comparte). */
export async function getFriendList(userId: string): Promise<AniListAnime[]> {
  const backend = getBackend();
  if (!backend) return [];
  return (await backend.listLibrary('anime', userId)).map(entryToAnime);
}

// ─── Escrituras ────────────────────────────────────────────
async function persist(
  anime: AniListAnime,
  status: ListStatus,
  progress: number,
  score: number
): Promise<void> {
  const backend = getBackend();
  if (!backend) return;
  const prev = st().myList[anime.id] ?? null;
  // Optimista: la UI cambia al instante; si falla se revierte
  st().patchMyList(anime.id, { status, progress, score });
  try {
    await backend.upsertLibraryEntry({
      mediaType: 'anime',
      mediaId: anime.id,
      status,
      progress,
      score,
      media: toSnapshot(anime),
    });
  } catch (err) {
    st().patchMyList(anime.id, prev);
    console.warn('[library] Error guardando la lista:', err);
    notify('error', 'No se pudo guardar tu lista. Revisa tu conexión e inténtalo de nuevo.');
    throw err;
  }
}

/**
 * Registra que has visto hasta `episode`. Sin sesión no hace nada.
 * Nunca retrocede el progreso; al llegar al último episodio pasa a "Completado".
 */
export async function saveProgress(anime: AniListAnime, episode: number): Promise<void> {
  if (st().account.status !== 'signedIn') return;
  const prev = st().myList[anime.id];
  const progress = Math.max(prev?.progress ?? 0, episode);
  const done = !!anime.episodes && progress >= anime.episodes;
  const status: ListStatus = done ? 'COMPLETED' : prev?.status === 'REPEATING' ? 'REPEATING' : 'CURRENT';
  await persist(anime, status, progress, prev?.score ?? 0);
}

/** Cambia el estado (Viendo, Completado…) o la quita de la lista con `null`. */
export async function setListStatus(anime: AniListAnime, status: ListStatus | null): Promise<void> {
  const backend = getBackend();
  if (!backend || st().account.status !== 'signedIn') return;
  if (status === null) {
    const prev = st().myList[anime.id] ?? null;
    st().patchMyList(anime.id, null);
    try {
      await backend.removeLibraryEntry('anime', anime.id);
    } catch (err) {
      st().patchMyList(anime.id, prev);
      notify('error', 'No se pudo quitar de tu lista.');
      throw err;
    }
    return;
  }
  const prev = st().myList[anime.id];
  const progress =
    status === 'COMPLETED' && anime.episodes ? anime.episodes : prev?.progress ?? 0;
  await persist(anime, status, progress, prev?.score ?? 0);
}

export async function setScore(anime: AniListAnime, score: number): Promise<void> {
  if (st().account.status !== 'signedIn') return;
  const prev = st().myList[anime.id];
  await persist(anime, prev?.status ?? 'PLANNING', prev?.progress ?? 0, Math.max(0, Math.min(100, Math.round(score))));
}

/**
 * Al empezar a ver un episodio: si el anime no estaba en "Viendo"/"Completado",
 * lo pasa a "Viendo" (así aparece en tu lista y en la de tus amigos).
 */
export async function markStarted(anime: AniListAnime, episode: number): Promise<void> {
  if (st().account.status !== 'signedIn') return;
  const prev = st().myList[anime.id];
  if (prev && (prev.status === 'CURRENT' || prev.status === 'COMPLETED' || prev.status === 'REPEATING')) return;
  await persist(anime, 'CURRENT', Math.max(prev?.progress ?? 0, Math.max(0, episode - 1)), prev?.score ?? 0);
}
