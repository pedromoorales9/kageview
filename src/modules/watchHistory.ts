// ═══════════════════════════════════════════════════════════
// Watch History — Historial detallado de visualización de anime
// Persistencia local vía getCache/setCache (electron-store por IPC).
// Mismo patrón que manga/mangaLibrary.ts.
// ═══════════════════════════════════════════════════════════

import { getCache, setCache } from './cache';
import { AniListAnime, PlayMode } from '../types/types';

// ─── Tipos ──────────────────────────────────────────────────

export interface WatchHistoryEntry {
  /** Snapshot del anime para poder reabrirlo sin volver a buscarlo. */
  anime: AniListAnime;
  /** Número de episodio visto. */
  episode: number;
  /** Sub o dub con el que se reprodujo. */
  mode: PlayMode;
  /** Marca temporal (ms) de la última vez que se vio este episodio. */
  watchedAt: number;
  /** Segundo de reproducción alcanzado (para reanudar). Solo fuentes no-iframe. */
  positionSeconds?: number;
  /** Duración total del episodio en segundos (si se conoce). */
  durationSeconds?: number;
}

/** Item derivado para la fila "Continuar viendo". */
export interface ContinueWatchingItem {
  anime: AniListAnime;
  episode: number;
  mode: PlayMode;
  /** Segundo desde el que reanudar. */
  resumeSeconds: number;
  /** Progreso 0..1 dentro del episodio (0 si se desconoce). */
  progress: number;
  watchedAt: number;
  /**
   * Episodio de la entrada real del historial que originó este item.
   * Cuando el episodio estaba terminado sugerimos `episode + 1`, así que
   * puede diferir de `episode`. Necesario para borrar la entrada correcta.
   */
  sourceEpisode: number;
}

/** A partir de este ratio consideramos el episodio "terminado". */
const FINISHED_RATIO = 0.9;

// ─── Constantes ─────────────────────────────────────────────

const HISTORY_KEY = 'watchHistory';

/** Máximo de entradas conservadas. Evita que el store crezca sin límite. */
const MAX_ENTRIES = 200;

/** Intervalo mínimo entre escrituras de posición a disco. */
const POSITION_WRITE_INTERVAL_MS = 30_000;

// ─── Snapshot ligero ────────────────────────────────────────

/**
 * Reduce el AniListAnime a lo que el historial realmente necesita.
 * Sin esto, cada entrada arrastra relations/studios/mediaListEntry (que
 * pueden ocupar decenas de KB por anime) y el fichero del historial se
 * reescribe entero en cada guardado de posición.
 */
function slimAnime(anime: AniListAnime): AniListAnime {
  return {
    id: anime.id,
    idMal: anime.idMal,
    title: anime.title,
    coverImage: anime.coverImage,
    bannerImage: anime.bannerImage,
    description: anime.description,
    episodes: anime.episodes,
    duration: anime.duration,
    genres: anime.genres,
    averageScore: anime.averageScore,
    status: anime.status,
    season: anime.season,
    seasonYear: anime.seasonYear,
    studios: { nodes: [] },
    nextAiringEpisode: null,
    mediaListEntry: null,
  };
}

// ─── Cola de mutaciones ─────────────────────────────────────
// Todas las mutaciones del historial son lecturas-modificaciones-escrituras
// por IPC; encadenarlas evita que dos llamadas concurrentes (p. ej. recordWatch
// y el guardado de posición) se pisen entre sí.

let mutationQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(fn, fn);
  mutationQueue = run.catch(() => undefined);
  return run;
}

// ─── API ────────────────────────────────────────────────────

/**
 * Devuelve el historial completo ordenado del más reciente al más antiguo.
 */
export async function getHistory(): Promise<WatchHistoryEntry[]> {
  const raw = (await getCache<WatchHistoryEntry[]>(HISTORY_KEY)) ?? [];
  return [...raw].sort((a, b) => b.watchedAt - a.watchedAt);
}

/**
 * Registra (o actualiza) la visualización de un episodio.
 * Si ya existía una entrada para el mismo anime + episodio, actualiza su
 * marca temporal en lugar de duplicarla, de modo que cada episodio aparece
 * una sola vez en el historial y siempre con la fecha más reciente.
 */
export async function recordWatch(
  anime: AniListAnime,
  episode: number,
  mode: PlayMode
): Promise<void> {
  return enqueue(async () => {
    const history = (await getCache<WatchHistoryEntry[]>(HISTORY_KEY)) ?? [];

    // Conservar la posición previa si ya existía esta misma entrada
    // (así reanudar un episodio no borra el minuto guardado).
    const previous = history.find(
      (e) => e.anime.id === anime.id && e.episode === episode
    );

    const filtered = history.filter(
      (e) => !(e.anime.id === anime.id && e.episode === episode)
    );

    filtered.push({
      anime: slimAnime(anime),
      episode,
      mode,
      watchedAt: Date.now(),
      positionSeconds: previous?.positionSeconds,
      durationSeconds: previous?.durationSeconds,
    });

    // Ordenar desc y recortar al máximo permitido.
    const trimmed = filtered
      .sort((a, b) => b.watchedAt - a.watchedAt)
      .slice(0, MAX_ENTRIES);

    await setCache(HISTORY_KEY, trimmed);
  });
}

// ─── Posición de reproducción (throttled) ───────────────────
// El reproductor reporta la posición cada ~5s, pero escribir el historial a
// disco con esa frecuencia bloquea el proceso main (electron-store reescribe
// el fichero entero de forma síncrona). Guardamos la última posición en
// memoria y persistimos como mucho cada 30s; flushWatchPosition() fuerza la
// escritura al salir del reproductor o cambiar de episodio.

interface PendingPosition {
  anime: AniListAnime;
  episode: number;
  mode: PlayMode;
  positionSeconds: number;
  durationSeconds: number;
}

let pendingPosition: PendingPosition | null = null;
let lastPositionWrite = 0;

async function persistPosition(p: PendingPosition): Promise<void> {
  return enqueue(async () => {
    const history = (await getCache<WatchHistoryEntry[]>(HISTORY_KEY)) ?? [];
    const idx = history.findIndex(
      (e) => e.anime.id === p.anime.id && e.episode === p.episode
    );

    const patch: WatchHistoryEntry = {
      anime: slimAnime(p.anime),
      episode: p.episode,
      mode: p.mode,
      watchedAt: Date.now(),
      positionSeconds: p.positionSeconds,
      durationSeconds: Number.isFinite(p.durationSeconds) && p.durationSeconds > 0
        ? p.durationSeconds
        : history[idx]?.durationSeconds,
    };

    if (idx >= 0) {
      history[idx] = { ...history[idx], ...patch };
    } else {
      history.push(patch);
    }

    const trimmed = history
      .sort((a, b) => b.watchedAt - a.watchedAt)
      .slice(0, MAX_ENTRIES);

    await setCache(HISTORY_KEY, trimmed);
  });
}

/**
 * Actualiza la posición de reproducción del episodio en curso.
 * Se llama periódicamente desde el reproductor (cada ~5s); la escritura
 * real a disco se limita a una vez cada 30s.
 */
export async function updateWatchPosition(
  anime: AniListAnime,
  episode: number,
  mode: PlayMode,
  positionSeconds: number,
  durationSeconds: number
): Promise<void> {
  if (!Number.isFinite(positionSeconds) || positionSeconds < 0) return;

  const previous = pendingPosition;
  pendingPosition = { anime, episode, mode, positionSeconds, durationSeconds };

  // Sin avance real (vídeo en pausa) no hay nada nuevo que persistir.
  const unchanged =
    previous &&
    previous.anime.id === anime.id &&
    previous.episode === episode &&
    Math.abs(previous.positionSeconds - positionSeconds) < 1;

  const now = Date.now();
  if (!unchanged && now - lastPositionWrite >= POSITION_WRITE_INTERVAL_MS) {
    lastPositionWrite = now;
    const toWrite = pendingPosition;
    pendingPosition = null;
    await persistPosition(toWrite);
  }
}

/**
 * Persiste inmediatamente la última posición pendiente (si la hay).
 * Llamar al salir del reproductor o al cambiar de episodio.
 */
export async function flushWatchPosition(): Promise<void> {
  if (!pendingPosition) return;
  const toWrite = pendingPosition;
  pendingPosition = null;
  lastPositionWrite = Date.now();
  await persistPosition(toWrite);
}

/**
 * Construye la lista "Continuar viendo": una entrada por anime (su episodio
 * más reciente). Si el episodio ya está prácticamente terminado, sugiere el
 * siguiente; si era el último, se omite.
 */
export async function getContinueWatching(): Promise<ContinueWatchingItem[]> {
  const history = await getHistory(); // ya viene ordenado desc

  const seen = new Set<number>();
  const items: ContinueWatchingItem[] = [];

  for (const entry of history) {
    if (seen.has(entry.anime.id)) continue; // solo la entrada más reciente por anime
    seen.add(entry.anime.id);

    const dur = entry.durationSeconds ?? 0;
    const pos = entry.positionSeconds ?? 0;
    const ratio = dur > 0 ? pos / dur : 0;

    if (ratio >= FINISHED_RATIO) {
      // Episodio terminado → sugerir el siguiente si existe
      const total = entry.anime.episodes;
      if (total && entry.episode >= total) continue; // serie completada
      items.push({
        anime: entry.anime,
        episode: entry.episode + 1,
        mode: entry.mode,
        resumeSeconds: 0,
        progress: 0,
        watchedAt: entry.watchedAt,
        sourceEpisode: entry.episode,
      });
    } else {
      items.push({
        anime: entry.anime,
        episode: entry.episode,
        mode: entry.mode,
        resumeSeconds: pos,
        progress: ratio,
        watchedAt: entry.watchedAt,
        sourceEpisode: entry.episode,
      });
    }
  }

  return items;
}

/**
 * Elimina una entrada concreta (anime + episodio) del historial.
 */
export async function removeHistoryEntry(animeId: number, episode: number): Promise<void> {
  return enqueue(async () => {
    const history = (await getCache<WatchHistoryEntry[]>(HISTORY_KEY)) ?? [];
    const filtered = history.filter(
      (e) => !(e.anime.id === animeId && e.episode === episode)
    );
    await setCache(HISTORY_KEY, filtered);
  });
}

/**
 * Borra todo el historial.
 */
export async function clearHistory(): Promise<void> {
  return enqueue(async () => {
    await setCache(HISTORY_KEY, []);
  });
}
