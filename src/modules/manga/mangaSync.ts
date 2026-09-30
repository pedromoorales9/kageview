// ═══════════════════════════════════════════════════════════
// mangaSync — biblioteca y progreso de manga sincronizados con la cuenta
//
// Cada dispositivo guarda todo en local (funciona sin cuenta ni conexión) y, con
// sesión iniciada, se pone al día con la nube:
//   1. PULL  trae lo que cambió en el servidor desde la última vez
//   2. MERGE por manga: gana el cambio más reciente; lo leído se UNE (nunca se
//            pierde un capítulo leído en otro dispositivo); «olvidar lo leído» y los
//            borrados se propagan sin resucitar datos
//   3. PUSH  sube lo cambiado en local (en lotes de 100)
//
// Los datos locales pertenecen a UNA cuenta: si entra otra distinta en el mismo
// equipo, se guarda una copia aparte y se parte de cero (nunca se suben a la
// cuenta equivocada).
// ═══════════════════════════════════════════════════════════

import { create } from 'zustand';
import {
  BackendError,
  MangaSnapshotWire,
  MangaSyncItem,
  MangaSyncRow,
  MangaSyncStatus,
  getBackend,
} from '../backend';
import {
  MangaRecord,
  applyRemote,
  dirtyRecords,
  initMangaStore,
  mangaKey,
  markSynced,
  onMangaChange,
  recordStamp,
  resetForNewOwner,
  setSyncMeta,
  useMangaData,
} from './mangaStore';
import { Range, parseRanges, sameRanges, unionRanges } from './readRanges';
import type { MangaModel } from './types';

const PULL_PAGE = 200;
const PUSH_BATCH = 100;
const MAX_PULL_PAGES = 50;
const DEBOUNCE_MS = 6_000;
const MIN_GAP_MS = 20_000;
const EVERY_MS = 5 * 60_000;

const STATUSES: readonly string[] = ['reading', 'planning', 'completed', 'dropped'];

// ─── Ficha del manga ⇄ nube ────────────────────────────────
const httpsOnly = (u: unknown): string => (typeof u === 'string' && /^https:\/\//.test(u) && u.length <= 500 ? u : '');

export function toWireManga(m: MangaModel): MangaSnapshotWire {
  return {
    id: m.id,
    sourceId: m.sourceId,
    title: m.title.slice(0, 300) || 'Sin título',
    description: (m.description ?? '').slice(0, 300),
    coverUrl: httpsOnly(m.coverUrl),
    status: m.status,
    tags: (m.tags ?? []).slice(0, 8).map((t) => String(t).slice(0, 40)),
    year: m.year ?? null,
    lastChapter: m.lastChapter ?? null,
    isAdult: !!m.isAdult,
  };
}

/** Lee una ficha que llega de FUERA (la nube o un amigo), sin fiarse de nada. */
export function fromWireManga(raw: unknown, source: string, mangaId: string): MangaModel {
  const w = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const status = ['ongoing', 'completed', 'hiatus', 'cancelled'].includes(String(w.status)) ? (w.status as MangaModel['status']) : 'ongoing';
  return {
    id: mangaId,
    sourceId: source,
    title: typeof w.title === 'string' && w.title ? w.title.slice(0, 300) : 'Sin título',
    description: typeof w.description === 'string' ? w.description.slice(0, 300) : '',
    coverUrl: httpsOnly(w.coverUrl),
    status,
    tags: Array.isArray(w.tags) ? w.tags.filter((t): t is string => typeof t === 'string').slice(0, 8) : [],
    year: typeof w.year === 'number' && Number.isFinite(w.year) ? w.year : null,
    lastChapter: typeof w.lastChapter === 'string' ? w.lastChapter.slice(0, 20) : null,
    isAdult: w.isAdult === true,
  };
}

const iso = (ms: number): string => new Date(ms).toISOString();
const ms = (v: string | null | undefined): number => {
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
};

// ─── Registro local ⇄ entrada de la nube ───────────────────
export function toSyncItem(rec: MangaRecord): MangaSyncItem {
  const last = rec.last;
  return {
    source: rec.manga.sourceId,
    mangaId: rec.manga.id,
    status: rec.status ?? null,
    manga: toWireManga(rec.manga),
    lastChapterId: last?.chapterId ?? null,
    lastChapterNumber: last?.chapterNumber ?? null,
    lastPage: last ? last.page : null,
    lastPageCount: last ? last.pageCount : null,
    lastReadAt: last ? iso(last.at) : null,
    readRanges: rec.readRanges ?? [],
    readResetAt: rec.readResetAt ? iso(rec.readResetAt) : null,
    deleted: false,
    updatedAt: iso(recordStamp(rec)),
  };
}

/** Aviso de borrado para otros dispositivos (la ficha solo hace falta para cumplir el esquema). */
export function tombstoneItem(key: string, at: number): MangaSyncItem {
  const [source, ...rest] = key.split('::');
  const mangaId = rest.join('::');
  return {
    source,
    mangaId,
    status: null,
    manga: { id: mangaId, sourceId: source, title: 'eliminado' },
    lastChapterId: null,
    lastChapterNumber: null,
    lastPage: null,
    lastPageCount: null,
    lastReadAt: null,
    readRanges: [],
    readResetAt: null,
    deleted: true,
    updatedAt: iso(at),
  };
}

export function recordFromRow(row: MangaSyncRow, now: number): MangaRecord {
  const stamp = ms(row.updatedAt);
  const manga = fromWireManga(row.manga, row.source, row.mangaId);
  const status = STATUSES.includes(String(row.status)) ? (row.status as MangaSyncStatus) : undefined;
  const rec: MangaRecord = {
    manga,
    status,
    addedAt: status ? stamp : undefined,
    updatedAt: stamp,
    read: [],
    readRanges: parseRanges(row.readRanges),
    readResetAt: ms(row.readResetAt) || undefined,
    syncedAt: now,
  };
  if (row.lastChapterId) {
    rec.last = {
      chapterId: row.lastChapterId,
      chapterNumber: row.lastChapterNumber ?? null,
      chapterIndex: 0,
      page: Math.max(0, row.lastPage ?? 0),
      pageCount: Math.max(0, row.lastPageCount ?? 0),
      at: ms(row.lastReadAt) || stamp,
    };
  }
  return rec;
}

// ─── Fusión (pura) ─────────────────────────────────────────
export type MergeResult =
  | { action: 'keep' }
  | { action: 'delete' }
  | { action: 'set'; record: MangaRecord };

/**
 * Decide qué hacer con lo que llega de la nube para un manga.
 *  · borrado en la nube: se borra aquí solo si el borrado es MÁS NUEVO que lo local
 *  · solo existe en la nube: se adopta
 *  · en ambos: el cambio más reciente decide estado/ficha/dónde vas; lo leído se une
 *    (salvo un «olvidar lo leído» más nuevo en un lado, que descarta lo anterior del otro)
 */
export function mergeRemote(local: MangaRecord | undefined, remote: MangaSyncRow, now: number): MergeResult {
  const rStamp = ms(remote.updatedAt);
  const lStamp = local ? recordStamp(local) : -1;

  if (remote.deleted) {
    if (!local) return { action: 'keep' };
    return rStamp > lStamp ? { action: 'delete' } : { action: 'keep' };
  }

  const incoming = recordFromRow(remote, now);
  if (!local) return { action: 'set', record: incoming };

  const localRanges: Range[] = local.readRanges ?? [];
  const remoteRanges: Range[] = incoming.readRanges ?? [];
  const lReset = local.readResetAt ?? 0;
  const rReset = incoming.readResetAt ?? 0;

  let ranges: Range[];
  let reset: number;
  if (rReset > lReset) { ranges = remoteRanges; reset = rReset; }
  else if (lReset > rReset) { ranges = localRanges; reset = lReset; }
  else { ranges = unionRanges(localRanges, remoteRanges); reset = lReset; }

  if (rStamp > lStamp) {
    return {
      action: 'set',
      record: {
        ...local,
        manga: incoming.manga,
        status: incoming.status,
        addedAt: local.addedAt ?? incoming.addedAt,
        updatedAt: rStamp,
        last: incoming.last,
        read: rReset > lReset ? [] : local.read,
        readRanges: ranges,
        readResetAt: reset || undefined,
        syncedAt: now,
      },
    };
  }

  // Lo local es igual o más nuevo: se conserva, pero si al unir lo leído ha cambiado
  // algo, se marca como pendiente de subir (gana con la unión ya hecha)
  const changed = !sameRanges(ranges, localRanges) || reset !== lReset;
  if (!changed) return { action: 'keep' };
  return {
    action: 'set',
    record: { ...local, readRanges: ranges, readResetAt: reset || undefined, updatedAt: Math.max(lStamp, now) },
  };
}

// ─── Estado visible ────────────────────────────────────────
export type SyncState = 'off' | 'idle' | 'syncing' | 'error' | 'unavailable';

interface SyncStatus {
  state: SyncState;
  lastSyncAt: number | null;
  error: string | null;
}

export const useMangaSync = create<SyncStatus>(() => ({ state: 'off', lastSyncAt: null, error: null }));
const setStatus = (p: Partial<SyncStatus>) => useMangaSync.setState(p);

// ─── Un ciclo de sincronización ────────────────────────────
let running: Promise<void> | null = null;

async function syncOnce(userId: string): Promise<void> {
  await initMangaStore();
  const backend = getBackend();
  if (!backend) return;

  // Los datos locales son de UNA cuenta
  const owner = useMangaData.getState().meta.owner;
  if (owner && owner !== userId) await resetForNewOwner(userId);
  else if (!owner) setSyncMeta({ owner: userId });

  // 1) traer
  let since = useMangaData.getState().meta.pulledAt;
  for (let i = 0; i < MAX_PULL_PAGES; i++) {
    const rows = await backend.pullMangaEntries({ since, limit: PULL_PAGE });
    const now = Date.now();
    const records = useMangaData.getState().records;
    const upserts: Record<string, MangaRecord> = {};
    const removals: string[] = [];
    for (const row of rows) {
      const key = mangaKey({ id: row.mangaId, sourceId: row.source });
      const res = mergeRemote(upserts[key] ?? records[key], row, now);
      if (res.action === 'set') upserts[key] = res.record;
      else if (res.action === 'delete') { removals.push(key); delete upserts[key]; }
    }
    if (rows.length > 0) since = rows[rows.length - 1].syncedAt;
    applyRemote(upserts, removals, { pulledAt: since });
    if (rows.length < PULL_PAGE) break;
  }

  // 2) subir
  const builtAt = Date.now();
  const state = useMangaData.getState();
  const dirty = dirtyRecords(state.records);
  const tombs = Object.entries(state.tombstones);
  const work: Array<{ item: MangaSyncItem; key: string; tomb: boolean }> = [
    ...dirty.map(([key, rec]) => ({ item: toSyncItem(rec), key, tomb: false })),
    ...tombs.map(([key, at]) => ({ item: tombstoneItem(key, at), key, tomb: true })),
  ];
  for (let i = 0; i < work.length; i += PUSH_BATCH) {
    const chunk = work.slice(i, i + PUSH_BATCH);
    await backend.pushMangaEntries(chunk.map((w) => w.item));
    markSynced(
      chunk.filter((w) => !w.tomb).map((w) => w.key),
      builtAt,
      chunk.filter((w) => w.tomb).map((w) => w.key)
    );
  }
}

/** Sincroniza ahora (si ya hay una en curso, espera a esa). */
export function syncMangaNow(): Promise<void> {
  const userId = useMangaData.getState().meta.owner ?? currentUser;
  if (!currentUser || !userId) return Promise.resolve();
  if (running) return running;
  setStatus({ state: 'syncing', error: null });
  running = syncOnce(currentUser)
    .then(() => setStatus({ state: 'idle', lastSyncAt: Date.now(), error: null }))
    .catch((err) => {
      if (err instanceof BackendError && err.code === 'unavailable') {
        // La base de datos aún no tiene la migración: se desactiva sin ruido
        setStatus({ state: 'unavailable', error: null });
        stopTimers();
        return;
      }
      console.warn('[mangaSync] No se pudo sincronizar:', err);
      setStatus({ state: 'error', error: err instanceof BackendError && err.code === 'network' ? 'Sin conexión' : 'No se pudo sincronizar' });
    })
    .finally(() => { running = null; lastRunAt = Date.now(); });
  return running;
}

// ─── Programación ──────────────────────────────────────────
let currentUser: string | null = null;
let lastRunAt = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribeChange: (() => void) | null = null;
let onlineHandler: (() => void) | null = null;

function scheduleSync(delay = DEBOUNCE_MS): void {
  if (!currentUser || useMangaSync.getState().state === 'unavailable') return;
  if (debounceTimer) clearTimeout(debounceTimer);
  const wait = Math.max(delay, lastRunAt + MIN_GAP_MS - Date.now());
  debounceTimer = setTimeout(() => void syncMangaNow(), wait);
}

function stopTimers(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (intervalTimer) clearInterval(intervalTimer);
  debounceTimer = null;
  intervalTimer = null;
  unsubscribeChange?.();
  unsubscribeChange = null;
  if (onlineHandler && typeof window !== 'undefined') window.removeEventListener('online', onlineHandler);
  onlineHandler = null;
}

/** Empieza a sincronizar con esta cuenta (al iniciar sesión). */
export function startMangaSync(userId: string): void {
  stopTimers();
  currentUser = userId;
  lastRunAt = 0;
  setStatus({ state: 'idle', error: null });
  void initMangaStore().then(() => syncMangaNow());
  unsubscribeChange = onMangaChange(() => scheduleSync());
  intervalTimer = setInterval(() => void syncMangaNow(), EVERY_MS);
  if (typeof window !== 'undefined') {
    onlineHandler = () => scheduleSync(1000);
    window.addEventListener('online', onlineHandler);
  }
}

/** Deja de sincronizar (al cerrar sesión). Los datos locales se conservan. */
export function stopMangaSync(): void {
  stopTimers();
  currentUser = null;
  setStatus({ state: 'off', error: null });
}
