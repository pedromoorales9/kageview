// ═══════════════════════════════════════════════════════════
// mangaStore — biblioteca, historial y progreso de lectura del manga
//
// Un único registro por manga (`fuente::id`) que junta:
//   · en biblioteca o no (`status`)
//   · capítulos leídos: ids (para marcar en la lista) y RANGOS DE NÚMEROS (para
//     sincronizar con la cuenta y entender otras fuentes/dispositivos)
//   · dónde te quedaste (capítulo Y PÁGINA)
//   · resultado de la última comprobación de capítulos nuevos
//   · estado de sincronización con la cuenta (`syncedAt`) y borrados pendientes
//
// El estado vive en memoria (zustand) y se guarda en disco con retraso, porque
// el lector lo actualiza a cada página. Al arrancar migra sin pérdidas las claves
// antiguas (`mangaLibrary` y `mangaProgress`).
// ═══════════════════════════════════════════════════════════

import { create } from 'zustand';
import { getCache, setCache } from '../cache';
import { parseChapterNumber } from './chapters';
import { Range, addNumber, addSpan, hasNumber, rangesFromNumbers, removeNumber } from './readRanges';
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
  /** Ids de capítulos marcados como leídos en ESTE dispositivo. */
  read: string[];
  /** Capítulos leídos por número (lo que viaja a la nube). */
  readRanges?: Range[];
  /** «Olvidar lo leído»: lo leído en otros dispositivos antes de esta fecha se descarta. */
  readResetAt?: number;
  last?: MangaLastRead;
  /** Mayor nº de capítulo conocido en la última comprobación. */
  latestKnown?: number | null;
  /** Capítulos sin leer en la última comprobación (solo si ya empezaste a leer). */
  unread?: number;
  checkedAt?: number;
  /** Última vez que este registro coincidía con la nube (ms). */
  syncedAt?: number;
}

export interface MangaSyncMeta {
  /** Cuenta a la que pertenecen estos datos (null = aún sin vincular). */
  owner: string | null;
  /** Último `synced_at` del servidor recibido (ISO). */
  pulledAt: string | null;
}

const DATA_KEY = 'mangaData';
const BACKUP_KEY = 'mangaDataPrev';
const OLD_LIBRARY_KEY = 'mangaLibrary';
const OLD_PROGRESS_KEY = 'mangaProgress';
const SAVE_DELAY_MS = 700;
/** Tope de capítulos leídos (por id) guardados por manga. */
const MAX_READ = 6000;

export const mangaKey = (m: { id: string; sourceId: string }): string => `${m.sourceId}::${m.id}`;

/** «Cuándo cambió por última vez»: lo más reciente entre el registro y la lectura. */
export const recordStamp = (r: MangaRecord): number => Math.max(r.updatedAt, r.last?.at ?? 0);

interface StoreState {
  records: Record<string, MangaRecord>;
  loaded: boolean;
  /** Borrados locales pendientes de comunicar a la nube: clave → cuándo. */
  tombstones: Record<string, number>;
  meta: MangaSyncMeta;
}

const EMPTY_META: MangaSyncMeta = { owner: null, pulledAt: null };

export const useMangaData = create<StoreState>(() => ({
  records: {},
  loaded: false,
  tombstones: {},
  meta: { ...EMPTY_META },
}));

const get = () => useMangaData.getState().records;

// ─── Avisos de cambio (los usa la sincronización) ──────────
const changeListeners = new Set<() => void>();
/** Se llama en cada cambio HECHO POR EL USUARIO (no en los que llegan de la nube). */
export function onMangaChange(cb: () => void): () => void {
  changeListeners.add(cb);
  return () => void changeListeners.delete(cb);
}

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
  const { loaded, records, tombstones, meta } = useMangaData.getState();
  if (!loaded) return;
  await setCache(DATA_KEY, { v: 2, records, tombstones, meta });
}

function mutate(fn: (records: Record<string, MangaRecord>, tombstones: Record<string, number>) => void): void {
  const records = { ...get() };
  const tombstones = { ...useMangaData.getState().tombstones };
  fn(records, tombstones);
  useMangaData.setState({ records, tombstones });
  scheduleSave();
  changeListeners.forEach((cb) => cb());
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
    const n = parseChapterNumber(p.lastChapterNumber);
    if (n !== null) rec.readRanges = rangesFromNumbers([n]);
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

interface Saved {
  v?: number;
  records?: Record<string, MangaRecord>;
  tombstones?: Record<string, number>;
  meta?: Partial<MangaSyncMeta>;
}

/** Carga una sola vez (idempotente). Llamar al arrancar la app. */
export function initMangaStore(): Promise<void> {
  loadPromise ??= (async () => {
    const saved = await getCache<Saved>(DATA_KEY);
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
    useMangaData.setState({
      records,
      tombstones: saved?.tombstones && typeof saved.tombstones === 'object' ? saved.tombstones : {},
      meta: { ...EMPTY_META, ...(saved?.meta ?? {}) },
      loaded: true,
    });
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
  changeListeners.clear();
  useMangaData.setState({ records: {}, loaded: false, tombstones: {}, meta: { ...EMPTY_META } });
}

// ─── Lectura ───────────────────────────────────────────────
export const getRecord = (m: { id: string; sourceId: string }): MangaRecord | undefined => get()[mangaKey(m)];

type ChapterRef = { id: string; chapter?: string | null };

/** ¿Está leído? Por id (este dispositivo) o por número (otros dispositivos / la nube). */
export function isChapterRead(rec: MangaRecord | undefined, ch: ChapterRef): boolean {
  if (!rec) return false;
  if (rec.read.includes(ch.id)) return true;
  return hasNumber(rec.readRanges ?? [], parseChapterNumber(ch.chapter));
}

/** Predicado rápido para recorrer listas largas (construye el conjunto de ids una vez). */
export function readPredicate(rec: MangaRecord | undefined): (ch: ChapterRef) => boolean {
  if (!rec) return () => false;
  const ids = new Set(rec.read);
  const ranges = rec.readRanges ?? [];
  return (ch) => ids.has(ch.id) || (ranges.length > 0 && hasNumber(ranges, parseChapterNumber(ch.chapter)));
}

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
  mutate((r, t) => {
    const key = mangaKey(manga);
    const now = Date.now();
    const cur = r[key];
    r[key] = cur
      ? { ...cur, manga: { ...cur.manga, ...manga }, status, addedAt: cur.addedAt ?? now, updatedAt: now }
      : { manga, status, addedAt: now, updatedAt: now, read: [] };
    delete t[key];
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
  mutate((r, t) => {
    const key = mangaKey(manga);
    const cur = r[key];
    if (!cur) return;
    if (cur.read.length > 0 || (cur.readRanges?.length ?? 0) > 0 || cur.last) {
      const { status: _s, addedAt: _a, unread: _u, latestKnown: _l, checkedAt: _c, ...rest } = cur;
      r[key] = { ...rest, updatedAt: Date.now() };
    } else {
      delete r[key];
      t[key] = Date.now();
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
  mutate((r, t) => {
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
    delete t[key];
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

function withRead(rec: MangaRecord, chapters: ChapterRef[]): MangaRecord {
  const ids = new Set(rec.read);
  let ranges = rec.readRanges ?? [];
  for (const c of chapters) {
    ids.add(c.id);
    const n = parseChapterNumber(c.chapter);
    if (n !== null) ranges = addNumber(ranges, n);
  }
  const read = [...ids];
  return { ...rec, read: read.length > MAX_READ ? read.slice(read.length - MAX_READ) : read, readRanges: ranges };
}

/**
 * Marca (o desmarca) un capítulo como leído; actualiza el contador de nuevos.
 * `chapter` puede ser solo el id, pero con el número (`{id, chapter}`) el dato
 * viaja a la nube y se entiende en otros dispositivos.
 */
export function setChapterRead(manga: MangaModel, chapter: string | ChapterRef, read: boolean): void {
  const ref: ChapterRef = typeof chapter === 'string' ? { id: chapter } : chapter;
  mutate((r, t) => {
    const key = mangaKey(manga);
    const cur = r[key] ?? { manga, updatedAt: Date.now(), read: [] };
    const was = isChapterRead(cur, ref);
    let next: MangaRecord;
    if (read) {
      next = withRead(cur, [ref]);
    } else {
      const n = parseChapterNumber(ref.chapter);
      next = {
        ...cur,
        read: cur.read.filter((id) => id !== ref.id),
        readRanges: n !== null ? removeNumber(cur.readRanges ?? [], n) : cur.readRanges,
      };
    }
    const delta = read === was ? 0 : read ? -1 : 1;
    r[key] = { ...next, updatedAt: Date.now(), ...(next.unread !== undefined ? { unread: Math.max(0, next.unread + delta) } : {}) };
    delete t[key];
  });
}

/** «Marcar como leído hasta aquí»: todos los capítulos hasta ese índice (inclusive). */
export function markReadUpTo(manga: MangaModel, chapters: readonly ChapterRef[], index: number): void {
  mutate((r, t) => {
    const key = mangaKey(manga);
    const cur = r[key] ?? { manga, updatedAt: Date.now(), read: [] };
    const upTo = chapters.slice(0, index + 1);
    let next = withRead(cur, upTo);
    // tramo continuo de números: más compacto y cubre huecos de la lista
    const nums = upTo.map((c) => parseChapterNumber(c.chapter)).filter((n): n is number => n !== null);
    if (nums.length > 0) next = { ...next, readRanges: addSpan(next.readRanges ?? [], Math.min(...nums), Math.max(...nums)) };
    const isRead = readPredicate(next);
    r[key] = {
      ...next,
      updatedAt: Date.now(),
      ...(next.unread !== undefined ? { unread: Math.max(0, chapters.filter((c) => !isRead(c)).length) } : {}),
    };
    delete t[key];
  });
}

/** Olvida el historial y lo leído de un manga (no toca la biblioteca). */
export function clearReading(manga: { id: string; sourceId: string }): void {
  mutate((r, t) => {
    const key = mangaKey(manga);
    const cur = r[key];
    if (!cur) return;
    if (cur.status) {
      const { last: _l, ...rest } = cur;
      r[key] = { ...rest, read: [], readRanges: [], readResetAt: Date.now(), unread: undefined, updatedAt: Date.now() };
    } else {
      delete r[key];
      t[key] = Date.now();
    }
  });
}

// ─── Comprobación de capítulos nuevos ──────────────────────
export function applyUpdateCheck(
  manga: { id: string; sourceId: string },
  result: { latest: number | null; unread: number | null; checkedAt?: number }
): void {
  // Sin avisar a la sincronización: no es un cambio del usuario
  const key = mangaKey(manga);
  const cur = get()[key];
  if (!cur) return;
  useMangaData.setState({
    records: {
      ...get(),
      [key]: {
        ...cur,
        latestKnown: result.latest,
        unread: result.unread ?? undefined,
        checkedAt: result.checkedAt ?? Date.now(),
      },
    },
  });
  scheduleSave();
}

// ─── Sincronización con la cuenta ──────────────────────────
/**
 * Aplica lo que llega de la nube en un solo paso. NO cuenta como cambio del
 * usuario (no dispara una subida) y deja los registros marcados como sincronizados.
 */
export function applyRemote(upserts: Record<string, MangaRecord>, removeKeys: string[], metaPatch?: Partial<MangaSyncMeta>): void {
  const records = { ...get(), ...upserts };
  const tombstones = { ...useMangaData.getState().tombstones };
  for (const k of removeKeys) {
    delete records[k];
    delete tombstones[k];
  }
  for (const k of Object.keys(upserts)) delete tombstones[k];
  useMangaData.setState({ records, tombstones, meta: { ...useMangaData.getState().meta, ...metaPatch } });
  scheduleSave();
}

/** Tras subir: marca los registros como al día y olvida los borrados ya comunicados. */
export function markSynced(keys: string[], at: number, doneTombstones: string[] = []): void {
  const records = { ...get() };
  for (const k of keys) if (records[k]) records[k] = { ...records[k], syncedAt: at };
  const tombstones = { ...useMangaData.getState().tombstones };
  for (const k of doneTombstones) delete tombstones[k];
  useMangaData.setState({ records, tombstones });
  scheduleSave();
}

export function setSyncMeta(patch: Partial<MangaSyncMeta>): void {
  useMangaData.setState({ meta: { ...useMangaData.getState().meta, ...patch } });
  scheduleSave();
}

/** Registros con cambios que aún no están en la nube. */
export function dirtyRecords(records: Record<string, MangaRecord> = get()): Array<[string, MangaRecord]> {
  return Object.entries(records).filter(([, r]) => recordStamp(r) > (r.syncedAt ?? 0));
}

/**
 * Otra cuenta inicia sesión en este equipo: los datos locales eran de la
 * anterior, así que se guardan aparte (una copia) y se parte de cero para que
 * NUNCA se suban a la cuenta equivocada.
 */
export async function resetForNewOwner(userId: string): Promise<void> {
  const prev = useMangaData.getState();
  if (Object.keys(prev.records).length > 0) {
    await setCache(BACKUP_KEY, { v: 2, records: prev.records, tombstones: prev.tombstones, meta: prev.meta, savedAt: Date.now() });
  }
  useMangaData.setState({ records: {}, tombstones: {}, meta: { owner: userId, pulledAt: null } });
  await flushMangaData();
}
