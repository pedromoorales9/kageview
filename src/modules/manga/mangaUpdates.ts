// ═══════════════════════════════════════════════════════════
// mangaUpdates — capítulos nuevos de los mangas de tu biblioteca
//
// Cada cierto tiempo (y a petición) consulta los capítulos de lo que estás
// leyendo y calcula cuántos te faltan DESDE DONDE VAS. Guarda el resultado en el
// registro de cada manga (insignia «+N» en la biblioteca) y avisa cuando aparece
// un capítulo nuevo. Una fuente caída se ignora sin afectar al resto.
// ═══════════════════════════════════════════════════════════

import { loadMangaChapters } from './index';
import { latestChapterNumber } from './chapters';
import { ANILIST_SOURCE_ID } from '../anilist/sync/mapping';
import { MangaRecord, applyUpdateCheck, libraryRecords, readPredicate, useMangaData } from './mangaStore';
import type { MangaChapterModel, MangaModel } from './types';

/** No volver a consultar un manga comprobado hace menos de esto (salvo que se fuerce). */
export const CHECK_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const CONCURRENCY = 3;
const FIRST_CHECK_DELAY_MS = 30_000;
const CHECK_EVERY_MS = 3 * 60 * 60 * 1000;

/**
 * Capítulos SIN LEER posteriores al último que has leído (por posición en la
 * lista ascendente). null si aún no has empezado a leerlo o lo leído no aparece
 * en esta lista (p. ej. otro idioma): no se puede saber.
 */
export function computeUnread<T extends { id: string }>(
  chapters: readonly T[],
  isRead: (ch: T) => boolean,
  lastChapterId?: string
): number | null {
  const read = (c: T) => isRead(c) || c.id === lastChapterId;
  let lastIdx = -1;
  chapters.forEach((c, i) => { if (read(c)) lastIdx = i; });
  if (lastIdx === -1) return null;
  return chapters.slice(lastIdx + 1).filter((c) => !read(c)).length;
}

/** Cuántos capítulos hay por encima del último que se conocía. */
export function countNewSince(chapters: readonly Pick<MangaChapterModel, 'chapter'>[], previousLatest: number | null | undefined): number {
  if (previousLatest == null) return 0;
  return chapters.filter((c) => {
    const n = latestChapterNumber([c]);
    return n !== null && n > previousLatest;
  }).length;
}

export interface NewChaptersInfo {
  manga: MangaModel;
  added: number;
  unread: number | null;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i]);
      }
    })
  );
}

/**
 * Comprueba los mangas que estás leyendo. Devuelve los que tienen capítulos
 * nuevos desde la comprobación anterior.
 */
export async function checkMangaUpdates(
  opts: { force?: boolean; includeEnglish?: boolean; now?: number } = {}
): Promise<NewChaptersInfo[]> {
  const now = opts.now ?? Date.now();
  const targets = libraryRecords().filter(
    (r: MangaRecord) => r.status === 'reading' && r.manga.sourceId !== ANILIST_SOURCE_ID && (opts.force || !r.checkedAt || now - r.checkedAt >= CHECK_MAX_AGE_MS)
  );
  const found: NewChaptersInfo[] = [];

  await mapLimit(targets, CONCURRENCY, async (rec) => {
    try {
      const chapters = await loadMangaChapters(rec.manga, { includeEnglish: opts.includeEnglish });
      if (chapters.length === 0) return;
      // Releer el registro: pudo cambiar mientras se consultaba (p. ej. leíste un capítulo)
      const fresh = useMangaData.getState().records[`${rec.manga.sourceId}::${rec.manga.id}`] ?? rec;
      const latest = latestChapterNumber(chapters);
      const unread = computeUnread(chapters, readPredicate(fresh), fresh.last?.chapterId);
      const added = countNewSince(chapters, fresh.latestKnown);
      applyUpdateCheck(rec.manga, { latest, unread, checkedAt: now });
      if (added > 0) found.push({ manga: rec.manga, added, unread });
    } catch {
      /* fuente caída o sin conexión: se reintenta en la siguiente comprobación */
    }
  });
  return found;
}

/**
 * Arranca las comprobaciones periódicas (a los 30 s y cada 3 h). Devuelve la
 * función que las detiene. `onNew` recibe los mangas con capítulos nuevos.
 */
export function startMangaUpdateChecks(
  onNew: (list: NewChaptersInfo[]) => void,
  getIncludeEnglish: () => boolean = () => false
): () => void {
  let stopped = false;
  const run = async () => {
    if (stopped || !useMangaData.getState().loaded) return;
    const list = await checkMangaUpdates({ includeEnglish: getIncludeEnglish() });
    if (!stopped && list.length > 0) onNew(list);
  };
  const first = setTimeout(() => void run(), FIRST_CHECK_DELAY_MS);
  const every = setInterval(() => void run(), CHECK_EVERY_MS);
  return () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(every);
  };
}
