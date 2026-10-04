// ═══════════════════════════════════════════════════════════
// state — lo que la sincronización con AniList recuerda entre sesiones
//
//  · base: el último estado acordado de cada obra (para la fusión de tres vías)
//  · links: qué ficha de AniList corresponde a cada manga de una fuente
//  · sugerencias / «sin coincidencia» / descartados: para no repetir búsquedas
//  · ajustes del usuario
//
// Se guarda en el almacén local (electron-store). NO contiene el token (vive solo
// en el proceso principal).
// ═══════════════════════════════════════════════════════════

import { create } from 'zustand';
import { getCache, setCache } from '../../cache';
import type { AniListStatus } from './bridge';
import type { ALStatus, EntrySnap, MangaLink } from './types';

export interface SuggestItem {
  id: number;
  title: string;
  cover: string | null;
  score: number;
}

export interface SyncSettings {
  anime: boolean;
  manga: boolean;
  /** Traer a KageView lo que solo está en AniList. */
  importRemote: boolean;
  /** Aviso discreto cuando el progreso se envía a AniList. */
  notifyProgress: boolean;
}

export const DEFAULT_SETTINGS: SyncSettings = { anime: true, manga: true, importRemote: true, notifyProgress: true };

/** Una entrada que se va a enviar a AniList (para que el usuario lo confirme la primera vez). */
export interface PlanItem {
  kind: 'anime' | 'manga';
  title: string;
  status: ALStatus;
  progress: number;
  /** No existe todavía en AniList: se crearía. */
  isNew: boolean;
}

export interface SyncPlan {
  items: PlanItem[];
}

export interface Persisted {
  v: 1;
  /** Cuenta de AniList a la que pertenece `anime`/`manga` (si cambia, se reinicia la base). */
  viewerId: number | null;
  /** Cuenta para la que el usuario ya aceptó que KageView escriba en su AniList. */
  confirmedViewerId: number | null;
  anime: Record<string, EntrySnap>;
  /** Clave = id de AniList (varias fuentes pueden compartir la misma obra). */
  manga: Record<string, EntrySnap>;
  links: Record<string, MangaLink>;
  suggestions: Record<string, { at: number; items: SuggestItem[] }>;
  noMatch: Record<string, number>;
  skipped: Record<string, number>;
  settings: SyncSettings;
  lastSyncAt: number | null;
}

export type Phase = 'idle' | 'syncing' | 'error';

export interface Counts {
  animePushed: number;
  animePulled: number;
  mangaPushed: number;
  mangaPulled: number;
  imported: number;
  linkedAuto: number;
  failed: number;
}

export interface Runtime {
  loaded: boolean;
  status: AniListStatus | null;
  phase: Phase;
  /** Texto de progreso («Vinculando mangas… 15/60»). */
  detail: string | null;
  error: string | null;
  counts: Counts | null;
  /** Primera sincronización con esta cuenta: lo que se enviaría, a la espera de confirmación. */
  plan: SyncPlan | null;
}

export type SyncStoreState = Persisted & Runtime;

export const EMPTY_COUNTS: Counts = { animePushed: 0, animePulled: 0, mangaPushed: 0, mangaPulled: 0, imported: 0, linkedAuto: 0, failed: 0 };

const initial = (): SyncStoreState => ({
  v: 1,
  viewerId: null,
  confirmedViewerId: null,
  anime: {},
  manga: {},
  links: {},
  suggestions: {},
  noMatch: {},
  skipped: {},
  settings: { ...DEFAULT_SETTINGS },
  lastSyncAt: null,
  loaded: false,
  status: null,
  phase: 'idle',
  detail: null,
  error: null,
  counts: null,
  plan: null,
});

export const useAniListSync = create<SyncStoreState>(() => initial());

export const getSync = (): SyncStoreState => useAniListSync.getState();

const KEY = 'anilistSync';
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const persistable = (s: SyncStoreState): Persisted => ({
  v: 1,
  viewerId: s.viewerId,
  confirmedViewerId: s.confirmedViewerId,
  anime: s.anime,
  manga: s.manga,
  links: s.links,
  suggestions: s.suggestions,
  noMatch: s.noMatch,
  skipped: s.skipped,
  settings: s.settings,
  lastSyncAt: s.lastSyncAt,
});

export async function flushSyncState(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (!getSync().loaded) return; // nunca guardar antes de cargar (pisaría lo guardado)
  await setCache(KEY, persistable(getSync()));
}

/** Cambia el estado y lo guarda con un pequeño retraso. */
export function patchSync(patch: Partial<SyncStoreState> | ((s: SyncStoreState) => Partial<SyncStoreState>)): void {
  useAniListSync.setState(typeof patch === 'function' ? patch(getSync()) : patch);
  if (!getSync().loaded) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushSyncState(), 500);
}

/** Cambia un ajuste y lo guarda en disco. */
export function setSettings(patch: Partial<SyncSettings>): void {
  patchSync((s) => ({ settings: { ...s.settings, ...patch } }));
}

let loading: Promise<void> | null = null;

/** Carga lo guardado (una vez). */
export function initSyncState(): Promise<void> {
  loading ??= (async () => {
    const saved = await getCache<Partial<Persisted>>(KEY);
    const base = initial();
    useAniListSync.setState({
      ...base,
      ...(saved && saved.v === 1
        ? {
            viewerId: typeof saved.viewerId === 'number' ? saved.viewerId : null,
            confirmedViewerId: typeof saved.confirmedViewerId === 'number' ? saved.confirmedViewerId : null,
            anime: saved.anime ?? {},
            manga: saved.manga ?? {},
            links: saved.links ?? {},
            suggestions: saved.suggestions ?? {},
            noMatch: saved.noMatch ?? {},
            skipped: saved.skipped ?? {},
            settings: { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) },
            lastSyncAt: typeof saved.lastSyncAt === 'number' ? saved.lastSyncAt : null,
          }
        : {}),
      loaded: true,
    });
  })();
  return loading;
}

export function __resetSyncStateForTests(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  loading = null;
  useAniListSync.setState({ ...initial(), loaded: true });
}
