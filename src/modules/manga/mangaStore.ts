// ═══════════════════════════════════════════════════════════
// mangaStore — biblioteca, historial y progreso de lectura del manga
//
// Un único registro por manga (`fuente::id`) que junta lo que antes estaba en
// dos listas sueltas (biblioteca + último capítulo):
//   · en biblioteca o no (`status`)
//   · capítulos leídos (para marcar y para contar los que faltan)
//   · dónde te quedaste (capítulo Y PÁGINA)
//   · resultado de la última comprobación de capítulos nuevos
//
// El estado vive en memoria (zustand) y se guarda en disco con retraso, porque
// el lector lo actualiza a cada página; así no se reescribe el archivo cada vez.
// Al arrancar migra sin pérdidas las claves antiguas (`mangaLibrary` y
// `mangaProgress`).
// ═══════════════════════════════════════════════════════════

import { create } from 'zustand';
import { getCache, setCache } from '../cache';
import type { MangaModel } from './types';

export type MangaLibraryStatus = 'reading' | 'completed' | 'planning' | 'dropped';

export interface MangaLastRead {
  chapterId: string;
  chapterNumber: string | null;
  chapterIndex: number;
  /** Página (base 0) por la que ibas. */
  page: number;
  pageCount: number;
  at: number;
}

export interface MangaRecord {
  manga: MangaModel;
  /** Presente = está en la biblioteca; ausente = solo historial de lectura. */
  status?: MangaLibraryStatus;
  addedAt?: number;
  updatedAt: number;
  /** Ids de capítulos marcados como leídos. */
  read: string[];
  last?: MangaLastRead;
  /** Mayor nº de capítulo conocido en la última comprobación. */
  latestKnown?: number | null;
  /** Capítulos sin leer en la última comprobación (solo si ya empezaste a leer). */
  unread?: number;
  checkedAt?: number;
}

const DATA_KEY = 'mangaData';
const OLD_LIBRARY_KEY = 'mangaLibrary';
const OLD_PROGRESS_KEY = 'mangaProgress';
const SAVE_DELAY_MS = 700;
/** Tope de capítulos leídos guardados por manga (series larguísimas). */
const MAX_READ = 6000;

export const mangaKey = (m: { id: string; sourceId: string }): string => `${m.sourceId}::${m.id}`;

interface StoreState {
  records: Record<string, MangaRecord>;
  loaded: boolean;
}

export const useMangaData = create<StoreState>(() => ({ records: {}, loaded: false }));

const get = () => useMangaData.getState().records;

// ─── Persistencia ──────────────────────────────────────────
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let loadPromise: Promise<void> | null = null;

function scheduleSave(): void {
  if (!useMangaData.getState().loaded) return; // nunca guardar antes de cargar (pisaría los datos)
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushMangaData(), SAVE_DELAY_MS);
}

/** Guarda ya (al salir del lector o de la app). */
export async function flushMangaData(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!useMangaData.getState().loaded) return;
  await setCache(DATA_KEY, { v: 2, records: get() });
}

function mutate(fn: (records: Record<string, MangaRecord>) => void): void {
  const next = { ...get() };
  fn(next);
  useMangaData.setState({ records: next });
  scheduleSave();
}

// ─── Carga y migración ─────────────────────────────────────
interface OldLibraryEntry { manga: MangaModel; status: MangaLibraryStatus; addedAt: number; updatedAt: number }
interface OldProgress { lastChapterId: string; lastChapterNumber: string | null; lastChapterIndex: number; updatedAt: number }

/** Une biblioteca y progreso antiguos en registros nuevos (función pura, con tests). */
export function migrateOldManga(
  library: OldLibraryEntry[] | undefined,
  progress: Record<string, OldProgress> | undefined
): Record<string, MangaRecord> {
  const out: Record<string, MangaRecord> = {};
  for (const e of library ?? []) {
    if (!e?.manga?.id || !e.manga.sourceId) continue;
    out[mangaKey(e.manga)] = {
      manga: e.manga,
      status: e.status,
      addedAt: e.addedAt,
      updatedAt: e.updatedAt ?? e.addedAt ?? Date.now(),
      read: [],
    };
  }
  for (const [key, p] of Object.entries(progress ?? {})) {
    const rec = out[key];
    if (!rec || !p?.lastChapterId) continue; // sin ficha del manga no se puede mostrar en el historial
    rec.read = [p.lastChapterId];
    rec.last = {
      chapterId: p.lastChapterId,
      chapterNumber: p.lastChapterNumber ?? null,
      chapterIndex: p.lastChapterIndex ?? 0,
      page: 0,
      pageCount: 0,
      at: p.updatedAt ?? Date.now(),
    };
  }
  return out;
}

/** Carga una sola vez (idempotente). Llamar al arrancar la app. */
export function initMangaStore(): Promise<void> {
  loadPromise ??= (async () => {
    const saved = await getCache<{ v?: number; records?: Record<string, MangaRecord> }>(DATA_KEY);
    let records: Record<string, MangaRecord>;
    if (saved?.records && typeof saved.records === 'object') {
      records = saved.records;
    } else {
      const [lib, prog] = await Promise.all([
        getCache<OldLibraryEntry[]>(OLD_LIBRARY_KEY),
        getCache<Record<string, OldProgress>>(OLD_PROGRESS_KEY),
      ]);
      records = migrateOldManga(lib, prog);
    }
    useMangaData.setState({ records, loaded: true });
    // Primera vez tras migrar: dejar ya guardado el formato nuevo
    if (!saved?.records) await flushMangaData();
  })();
  return loadPromise;
}

/** Solo para pruebas: vuelve al estado inicial. */
export function __resetMangaStoreForTests(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  loadPromise = null;
  useMangaData.setState({ records: {}, loaded: false });
}

// ─── Lectura ───────────────────────────────────────────────
export const getRecord = (m: { id: string; sourceId: string }): MangaRecord | undefined => get()[mangaKey(m)];

export const readSet = (m: { id: string; sourceId: string }): Set<string> => new Set(getRecord(m)?.read ?? []);

/** Biblioteca: los que tienen estado, los tocados más recientemente primero. */
export function libraryRecords(records: Record<string, MangaRecord> = get()): MangaRecord[] {
  return Object.values(records)
    .filter((r) => r.status)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** «Continuar leyendo»: lo último que abriste, más reciente primero. */
export function historyRecords(records: Record<string, MangaRecord> = get(), limit = 24): MangaRecord[] {
  return Object.values(records)
    .filter((r) => r.last)
    .sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0))
    .slice(0, limit);
}

// ─── Biblioteca ────────────────────────────────────────────
export function addToLibrary(manga: MangaModel, status: MangaLibraryStatus = 'reading'): void {
  mutate((r) => {
    const key = mangaKey(manga);
    const now = Date.now();
    const cur = r[key];
    r[key] = cur
      ? { ...cur, manga: { ...cur.manga, ...manga }, status, addedAt: cur.addedAt ?? now, updatedAt: now }
      : { manga, status, addedAt: now, updatedAt: now, read: [] };
  });
}

export function setLibraryStatus(manga: { id: string; sourceId: string }, status: MangaLibraryStatus): void {
  mutate((r) => {
    const cur = r[mangaKey(manga)];
    if (cur) r[mangaKey(manga)] = { ...cur, status, updatedAt: Date.now() };
  });
}

/** Quita de la biblioteca. Si has leído algo, se conserva en el historial. */
export function removeFromLibrary(manga: { id: string; sourceId: string }): void {
  mutate((r) => {
    const key = mangaKey(manga);
    const cur = r[key];
    if (!cur) return;
    if (cur.read.length > 0 || cur.last) {
      const { status: _s, addedAt: _a, unread: _u, latestKnown: _l, checkedAt: _c, ...rest } = cur;
      r[key] = { ...rest, updatedAt: Date.now() };
    } else {
      delete r[key];
    }
  });
}

// ─── Lectura: dónde te quedaste y qué has leído ────────────
/** Al abrir un capítulo. Si es el mismo en el que ibas, conserva la página. */
export function recordOpen(
  manga: MangaModel,
  chapter: { id: string; chapter: string | null },
  chapterIndex: number,
  pageCount = 0
): void {
  mutate((r) => {
    const key = mangaKey(manga);
    const cur = r[key] ?? { manga, updatedAt: Date.now(), read: [] };
    const same = cur.last?.chapterId === chapter.id;
    r[key] = {
      ...cur,
      manga: cur.status ? cur.manga : { ...cur.manga, ...manga }, // refresca la ficha del historial
      updatedAt: Date.now(),
      last: {
        chapterId: chapter.id,
        chapterNumber: chapter.chapter,
        chapterIndex,
        page: same ? cur.last!.page : 0,
        pageCount: pageCount || (same ? cur.last!.pageCount : 0),
        at: Date.now(),
      },
    };
  });
}

/** Página actual dentro del capítulo abierto (se guarda con retraso). */
export function recordPage(manga: { id: string; sourceId: string }, chapterId: string, page: number, pageCount: number): void {
  const cur = get()[mangaKey(manga)];
  if (!cur?.last || cur.last.chapterId !== chapterId) return;
  if (cur.last.page === page && cur.last.pageCount === pageCount) return;
  mutate((r) => {
    const rec = r[mangaKey(manga)];
    if (rec?.last) r[mangaKey(manga)] = { ...rec, last: { ...rec.last, page, pageCount, at: Date.now() } };
  });
}

function withRead(rec: MangaRecord, ids: string[]): MangaRecord {
  const set = new Set(rec.read);
  ids.forEach((id) => set.add(id));
  const read = [...set];
  return { ...rec, read: read.length > MAX_READ ? read.slice(read.length - MAX_READ) : read };
}

/** Marca (o desmarca) un capítulo como leído; actualiza el contador de nuevos. */
export function setChapterRead(manga: MangaModel, chapterId: string, read: boolean): void {
  mutate((r) => {
    const key = mangaKey(manga);
    const cur = r[key] ?? { manga, updatedAt: Date.now(), read: [] };
    const next = read
      ? withRead(cur, [chapterId])
      : { ...cur, read: cur.read.filter((id) => id !== chapterId) };
    const delta = read === cur.read.includes(chapterId) ? 0 : read ? -1 : 1;
    r[key] = { ...next, updatedAt: Date.now(), ...(next.unread !== undefined ? { unread: Math.max(0, next.unread + delta) } : {}) };
  });
}

/** «Marcar como leído hasta aquí»: todos los capítulos hasta ese índice (inclusive). */
export function markReadUpTo(manga: MangaModel, chapters: readonly { id: string }[], index: number): void {
  mutate((r) => {
    const key = mangaKey(manga);
    const cur = r[key] ?? { manga, updatedAt: Date.now(), read: [] };
    const ids = chapters.slice(0, index + 1).map((c) => c.id);
    const next = withRead(cur, ids);
    const total = chapters.length;
    r[key] = { ...next, updatedAt: Date.now(), ...(next.unread !== undefined ? { unread: Math.max(0, total - chapters.filter((c) => next.read.includes(c.id)).length) } : {}) };
  });
}

/** Olvida el historial y lo leído de un manga (no toca la biblioteca). */
export function clearReading(manga: { id: string; sourceId: string }): void {
  mutate((r) => {
    const key = mangaKey(manga);
    const cur = r[key];
    if (!cur) return;
    if (cur.status) {
      const { last: _l, ...rest } = cur;
      r[key] = { ...rest, read: [], unread: undefined, updatedAt: Date.now() };
    } else {
      delete r[key];
    }
  });
}

// ─── Comprobación de capítulos nuevos ──────────────────────
export function applyUpdateCheck(
  manga: { id: string; sourceId: string },
  result: { latest: number | null; unread: number | null; checkedAt?: number }
): void {
  mutate((r) => {
    const key = mangaKey(manga);
    const cur = r[key];
    if (!cur) return;
    r[key] = {
      ...cur,
      latestKnown: result.latest,
      unread: result.unread ?? undefined,
      checkedAt: result.checkedAt ?? Date.now(),
    };
  });
}
