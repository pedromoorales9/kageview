// ═══════════════════════════════════════════════════════════
// engine — sincronización bidireccional con AniList (anime y manga)
//
//  · Anime: las listas de KageView están indexadas por el id de AniList, así que el
//    emparejamiento es directo.
//  · Manga: cada fuente tiene sus propios ids. Se vincula cada manga con su ficha de
//    AniList por el título (solo solo si es claro; si no, el usuario confirma) y se
//    guarda el vínculo. Lo que solo existe en AniList se importa como ficha «sin
//    fuente de lectura»; al vincular un manga real con esa ficha, se fusionan.
//  · La fusión es de tres vías (ver merge.ts) y NUNCA borra nada automáticamente.
// ═══════════════════════════════════════════════════════════

import { ANILIST_DOWN_MESSAGE } from '../client';
import { notify } from '../../notify';
import type { AnimeChange } from './changeBus';
import { getBackend } from '../../backend';
import type { LibraryEntry, LibraryUpsert } from '../../backend';
import { loadMyList } from '../../library';
import { useAppStore } from '../../store';
import { safeCoverUrl } from '../../safeUrl';
import {
  MangaRecord,
  applyExternalProgress,
  deleteRecord,
  libraryRecords,
  mangaKey,
} from '../../manga/mangaStore';
import * as api from './api';
import { AniListApiError } from './api';
import { Side, mergeEntry } from './merge';
import {
  alToManga,
  animeSide,
  isAniListPlaceholder,
  mangaSide,
  mediaTitle,
  mediaToMangaModel,
  mediaToSnapshot,
  progressFromRanges,
  remoteSide,
} from './mapping';
import { decideLink, searchTerms } from './matching';
import {
  Counts,
  EMPTY_COUNTS,
  SuggestItem,
  getSync,
  initSyncState,
  patchSync,
} from './state';
import type { PlanItem } from './state';
import type { ALEntry, ALMedia, ALSave, ALStatus, MangaLink } from './types';

// ─── Ajustes de ritmo (sustituibles en tests) ──────────────
let pace: () => Promise<void> = () => new Promise((r) => setTimeout(r, 750));
export const __setPaceForTests = (fn: (() => Promise<void>) | null): void => {
  pace = fn ?? (() => new Promise((r) => setTimeout(r, 750)));
};

/** Búsquedas de ficha por pasada (la API pública permite ~90/min). */
export const AUTO_LINK_BUDGET = 15;
/** Cuánto tarda en volver a buscarse un manga sin coincidencia. */
export const RETRY_AFTER_MS = 7 * 24 * 3600 * 1000;

const now = () => Date.now();

// ─── Utilidades de vínculos ────────────────────────────────
const anilistIdOf = (rec: MangaRecord): number | null => {
  if (isAniListPlaceholder(rec.manga)) {
    const id = Number(rec.manga.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  }
  return getSync().links[mangaKey(rec.manga)]?.anilistId ?? null;
};

const linkFor = (media: ALMedia, via: MangaLink['via']): MangaLink => ({
  anilistId: media.id,
  title: mediaTitle(media).slice(0, 300),
  cover: safeCoverUrl(media.coverImage.extraLarge) ?? safeCoverUrl(media.coverImage.large),
  via,
  at: now(),
});

const suggestFrom = (m: ALMedia, score: number): SuggestItem => ({
  id: m.id,
  title: mediaTitle(m).slice(0, 200),
  cover: safeCoverUrl(m.coverImage.large) ?? safeCoverUrl(m.coverImage.extraLarge),
  score,
});

/** Mangas de la biblioteca (con fuente de lectura) que aún no tienen ficha de AniList. */
export function unlinkedRecords(): MangaRecord[] {
  const { links, skipped } = getSync();
  return libraryRecords().filter((r) => !isAniListPlaceholder(r.manga) && !links[mangaKey(r.manga)] && !skipped[mangaKey(r.manga)]);
}

/** Vincula un manga con una ficha de AniList (por id; sirve tanto una búsqueda como una sugerencia guardada). */
export function linkMangaTo(
  manga: { id: string; sourceId: string },
  target: { id: number; title: string; cover: string | null },
  via: MangaLink['via'] = 'manual'
): void {
  const key = mangaKey(manga);
  const link: MangaLink = {
    anilistId: target.id,
    title: target.title.slice(0, 300),
    cover: safeCoverUrl(target.cover),
    via,
    at: now(),
  };
  patchSync((s) => {
    const { [key]: _s, ...suggestions } = s.suggestions;
    const { [key]: _n, ...noMatch } = s.noMatch;
    const { [key]: _k, ...skipped } = s.skipped;
    return { links: { ...s.links, [key]: link }, suggestions, noMatch, skipped };
  });
}

export function linkManga(manga: { id: string; sourceId: string }, media: ALMedia, via: MangaLink['via'] = 'manual'): void {
  linkMangaTo(manga, { id: media.id, title: mediaTitle(media), cover: media.coverImage.extraLarge ?? media.coverImage.large }, via);
}

export function unlinkManga(manga: { id: string; sourceId: string }): void {
  const key = mangaKey(manga);
  patchSync((s) => {
    const { [key]: _l, ...links } = s.links;
    return { links, skipped: { ...s.skipped, [key]: now() } }; // no se vuelve a vincular solo
  });
}

/** «No vincular este manga» (deja de aparecer en la lista de pendientes). */
export function skipManga(manga: { id: string; sourceId: string }): void {
  const key = mangaKey(manga);
  patchSync((s) => ({ skipped: { ...s.skipped, [key]: now() } }));
}

export function forgetAllLinks(): void {
  patchSync({ links: {}, suggestions: {}, noMatch: {}, skipped: {}, manga: {} });
}

// ─── Anime ─────────────────────────────────────────────────
/** Una entrada que se acaba de enviar a AniList (para el aviso al usuario). */
export interface PushedItem {
  kind: 'anime' | 'manga';
  title: string;
  progress: number;
}

interface SectionResult {
  pushedItems?: PushedItem[];
  /** Solo en la pasada de revisión: lo que se enviaría. */
  plan?: PlanItem[];
  pushed: number;
  pulled: number;
  failed: number;
  imported?: number;
  linkedAuto?: number;
}

/**
 * `dryRun`: no escribe nada (ni en KageView ni en AniList); solo devuelve en `plan` lo que
 * se enviaría. Se usa la primera vez con una cuenta, para que el usuario lo confirme.
 */
export async function syncAnime(viewerId: number, dryRun = false): Promise<SectionResult> {
  const backend = getBackend();
  const res: SectionResult = { pushed: 0, pulled: 0, failed: 0 };
  if (!backend || useAppStore.getState().account.status !== 'signedIn') return res;

  const [remote, local] = await Promise.all([api.fetchList('ANIME', viewerId), backend.listLibrary('anime')]);
  const rMap = new Map<number, ALEntry>(remote.map((e) => [e.mediaId, e]));
  const lMap = new Map<number, LibraryEntry>(local.map((e) => [e.mediaId, e]));
  const base = getSync().anime;
  const nextBase = { ...base };

  const toRemote: ALSave[] = [];
  const titles = new Map<number, string>();
  const toLocal: Array<{ upsert: LibraryUpsert; id: number }> = [];
  const importRemote = getSync().settings.importRemote;

  for (const id of new Set([...rMap.keys(), ...lMap.keys()])) {
    const r = rMap.get(id);
    const l = lMap.get(id);
    if (!l && !importRemote) continue;
    const out = mergeEntry({ base: base[id] ?? null, local: animeSide(l), remote: remoteSide(r), scoreSynced: true });
    if (!out.next) continue;
    const next = out.next;
    if (out.toRemote) {
      toRemote.push({ mediaId: id, status: next.status, progress: next.progress, score: next.score });
      titles.set(id, (r ? mediaTitle(r.media) : l?.media.title.english || l?.media.title.romaji) || '');
    }
    if (out.toLocal && !dryRun) {
      const media = r ? mediaToSnapshot(r.media) : l?.media;
      if (media) toLocal.push({ id, upsert: { mediaType: 'anime', mediaId: id, status: next.status, progress: next.progress, score: next.score, media } });
    }
    if (!out.toRemote && !out.toLocal) nextBase[id] = next;
  }

  if (dryRun) {
    res.plan = toRemote.map((it) => ({ kind: 'anime', title: titles.get(it.mediaId) ?? '', status: it.status, progress: it.progress, isNew: !rMap.has(it.mediaId) }));
    return res;
  }

  // Escribir en KageView (directo al backend: no cuenta como cambio del usuario → sin rebote)
  for (const { id, upsert } of toLocal) {
    try {
      await backend.upsertLibraryEntry(upsert);
      nextBase[id] = { status: upsert.status, progress: upsert.progress ?? 0, score: upsert.score ?? 0 };
      res.pulled++;
    } catch {
      res.failed++;
    }
  }

  // Escribir en AniList
  if (toRemote.length > 0) {
    const saved = await api.saveEntries(toRemote);
    for (const id of saved.ok) {
      const it = toRemote.find((x) => x.mediaId === id)!;
      nextBase[id] = { status: it.status, progress: it.progress, score: it.score ?? 0 };
      res.pushed++;
      (res.pushedItems ??= []).push({ kind: 'anime', title: titles.get(id) ?? '', progress: it.progress });
    }
    res.failed += saved.failed.length;
  }

  patchSync({ anime: nextBase });
  if (res.pulled > 0) await loadMyList();
  return res;
}

// ─── Manga: vincular por título ────────────────────────────
/** Busca la ficha de los mangas sin vincular (acotado por pasada). Devuelve cuántos vinculó solo. */
export async function autoLinkPending(budget = AUTO_LINK_BUDGET, onDetail?: (t: string) => void): Promise<number> {
  const t0 = now();
  const { links, skipped, noMatch, suggestions } = getSync();
  const todo = libraryRecords().filter((r) => {
    const k = mangaKey(r.manga);
    return (
      !isAniListPlaceholder(r.manga) &&
      !links[k] &&
      !skipped[k] &&
      !(noMatch[k] && t0 - noMatch[k] < RETRY_AFTER_MS) &&
      !(suggestions[k] && t0 - suggestions[k].at < RETRY_AFTER_MS)
    );
  });

  let linked = 0;
  let done = 0;
  for (const rec of todo.slice(0, budget)) {
    onDetail?.(`Buscando fichas en AniList… ${++done}/${Math.min(todo.length, budget)}`);
    const key = mangaKey(rec.manga);
    try {
      let cands: ALMedia[] = [];
      for (const term of searchTerms(rec.manga.title).slice(0, 2)) {
        cands = await api.searchManga(term);
        await pace();
        if (cands.length > 0) break;
      }
      const d = decideLink(rec.manga.title, cands);
      if (d.kind === 'auto') {
        patchSync((s) => ({ links: { ...s.links, [key]: linkFor(d.media, 'auto') } }));
        linked++;
      } else if (d.kind === 'ambiguous') {
        patchSync((s) => ({ suggestions: { ...s.suggestions, [key]: { at: now(), items: d.ranked.map((r) => suggestFrom(r.media, r.score)) } } }));
      } else {
        patchSync((s) => ({ noMatch: { ...s.noMatch, [key]: now() } }));
      }
    } catch (err) {
      // Si AniList pide ir más despacio o no hay conexión, se deja el resto para la próxima pasada
      if (err instanceof AniListApiError && (err.code === 'rate_limited' || err.code === 'network' || err.code === 'down')) break;
      patchSync((s) => ({ noMatch: { ...s.noMatch, [key]: now() } }));
    }
  }
  return linked;
}

// ─── Manga: fusionar y sincronizar ─────────────────────────
function groupByAniList(records: MangaRecord[]): Map<number, MangaRecord[]> {
  const groups = new Map<number, MangaRecord[]>();
  for (const rec of records) {
    const id = anilistIdOf(rec);
    if (id === null) continue;
    groups.set(id, [...(groups.get(id) ?? []), rec]);
  }
  return groups;
}

/** Lado «KageView» de una obra con varios registros (varias fuentes): progreso mayor, estado del más reciente. */
function aggregateLocal(group: MangaRecord[], baseStatus: ALStatus | null): Side | null {
  const sides = group.map((r) => mangaSide(r, baseStatus)).filter((s): s is Side => s !== null);
  if (sides.length === 0) return null;
  const newest = sides.reduce((a, b) => (b.at > a.at ? b : a));
  return { status: newest.status, progress: Math.max(...sides.map((s) => s.progress)), score: 0, at: Math.max(...sides.map((s) => s.at)) };
}

/**
 * Una ficha de AniList («sin fuente de lectura») y un manga real vinculados a la
 * misma obra son la misma cosa: se traspasa lo de la ficha al manga real y se borra.
 */
function foldPlaceholders(groups: Map<number, MangaRecord[]>): number {
  let folded = 0;
  for (const group of groups.values()) {
    const placeholders = group.filter((r) => isAniListPlaceholder(r.manga));
    const real = group.filter((r) => !isAniListPlaceholder(r.manga));
    if (placeholders.length === 0 || real.length === 0) continue;
    const target = real.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
    for (const p of placeholders) {
      // El estado que prevalece es el del registro tocado más recientemente
      const status = (p.updatedAt > target.updatedAt ? p.status : target.status) ?? p.status ?? target.status;
      applyExternalProgress(target.manga, { status, progress: progressFromRanges(p.readRanges) });
      deleteRecord(mangaKey(p.manga));
      folded++;
    }
  }
  return folded;
}

export async function syncManga(viewerId: number, onDetail?: (t: string) => void, dryRun = false): Promise<SectionResult> {
  const res: SectionResult = { pushed: 0, pulled: 0, failed: 0, imported: 0, linkedAuto: 0 };
  const settings = getSync().settings;

  onDetail?.('Leyendo tu lista de manga en AniList…');
  const remote = await api.fetchList('MANGA', viewerId);
  const rMap = new Map<number, ALEntry>(remote.map((e) => [e.mediaId, e]));

  res.linkedAuto = await autoLinkPending(AUTO_LINK_BUDGET, onDetail);

  // Fichas de AniList + mangas reales de la misma obra → una sola
  foldPlaceholders(groupByAniList(libraryRecords()));

  const groups = groupByAniList(libraryRecords());
  const base = getSync().manga;
  const nextBase = { ...base };
  const toRemote: ALSave[] = [];
  const titles = new Map<number, string>();

  for (const id of new Set([...rMap.keys(), ...groups.keys()])) {
    const group = groups.get(id) ?? [];
    const r = rMap.get(id);
    if (group.length === 0 && !settings.importRemote) continue;

    const out = mergeEntry({
      base: base[id] ?? null,
      local: aggregateLocal(group, base[id]?.status ?? null),
      remote: remoteSide(r),
      scoreSynced: false,
    });
    if (!out.next) continue;
    const next = out.next;

    if (out.toRemote) {
      toRemote.push({ mediaId: id, status: next.status, progress: next.progress });
      titles.set(id, group[0]?.manga.title ?? (r ? mediaTitle(r.media) : ''));
    }

    if (out.toLocal && !dryRun) {
      if (group.length > 0) {
        for (const rec of group) applyExternalProgress(rec.manga, { status: alToManga(next.status), progress: next.progress });
        res.pulled++;
      } else if (r) {
        applyExternalProgress(mediaToMangaModel(r.media), { status: alToManga(next.status), progress: next.progress });
        res.imported = (res.imported ?? 0) + 1;
      }
    }
    if (!out.toRemote) nextBase[id] = next;
  }

  if (dryRun) {
    res.plan = toRemote.map((it) => ({ kind: 'manga', title: titles.get(it.mediaId) ?? '', status: it.status, progress: it.progress, isNew: !rMap.has(it.mediaId) }));
    return res;
  }

  if (toRemote.length > 0) {
    onDetail?.(`Enviando ${toRemote.length} manga${toRemote.length === 1 ? '' : 's'} a AniList…`);
    const saved = await api.saveEntries(toRemote);
    for (const id of saved.ok) {
      const it = toRemote.find((x) => x.mediaId === id)!;
      nextBase[id] = { status: it.status, progress: it.progress, score: base[id]?.score ?? rMap.get(id)?.score ?? 0 };
      res.pushed++;
      (res.pushedItems ??= []).push({ kind: 'manga', title: titles.get(id) ?? '', progress: it.progress });
    }
    res.failed += saved.failed.length;
  }

  patchSync({ manga: nextBase });
  return res;
}

// ─── Orquestación ──────────────────────────────────────────
export function describeError(err: unknown): string {
  if (err instanceof AniListApiError) {
    switch (err.code) {
      case 'unauthorized':
        return 'AniList rechazó la conexión (el acceso caducó o se revocó). Vuelve a conectar tu cuenta.';
      case 'rate_limited':
        return 'AniList pidió ir más despacio. Se reintentará solo en unos minutos.';
      case 'down':
        return ANILIST_DOWN_MESSAGE;
      case 'network':
        return 'No hay conexión con AniList. Se reintentará más tarde.';
      case 'not_connected':
        return 'La cuenta de AniList no está conectada.';
      default:
        return `AniList respondió con un error${err.message ? `: ${err.message}` : ''}.`;
    }
  }
  return 'No se pudo sincronizar con AniList.';
}

let running: Promise<void> | null = null;
let rerun = false;
/** Motivo de la petición que quedó en cola mientras había otra en curso. */
let queuedReason: SyncReason = 'auto';

export type SyncReason = 'manual' | 'auto';

/** Texto del aviso tras enviar progreso a AniList (null = nada que avisar). */
export function progressMessage(items: readonly PushedItem[]): { title?: string; message: string } | null {
  if (items.length === 0) return null;
  if (items.length === 1) {
    const it = items[0];
    return {
      title: it.title || undefined,
      message: it.progress <= 0 ? 'Lista de AniList actualizada' : it.kind === 'anime' ? `Episodio ${it.progress} marcado como visto en AniList` : `Capítulo ${it.progress} marcado como leído en AniList`,
    };
  }
  return { message: `${items.length} entradas actualizadas en AniList` };
}

function announce(items: readonly PushedItem[]): void {
  if (!getSync().settings.notifyProgress) return;
  const m = progressMessage(items);
  if (m) notify('success', m.message, m.title ? `AniList · ${m.title}` : 'AniList');
}

async function runOnce(reason: SyncReason, nothingToSend = false): Promise<void> {
  await initSyncState();
  const status = await api.getStatus();
  patchSync({ status });
  if (!status?.connected || !status.user) return;
  const { settings } = getSync();
  if (!settings.anime && !settings.manga) return;

  // Otra cuenta de AniList: el «último estado acordado» era de la anterior
  if (getSync().viewerId !== status.user.id) patchSync({ viewerId: status.user.id, plan: null, anime: {}, manga: {}, noMatch: {} });

  // La primera vez con esta cuenta NO se escribe nada sin que el usuario lo confirme
  // (`nothingToSend`: la pasada de revisión ya vio que no hay nada que enviar, así que esta solo trae)
  const dryRun = !nothingToSend && getSync().confirmedViewerId !== status.user.id;

  patchSync({ phase: 'syncing', error: null, detail: 'Conectando con AniList…', plan: null });
  const counts: Counts = { ...EMPTY_COUNTS };
  const pushedItems: PushedItem[] = [];
  const plan: PlanItem[] = [];
  try {
    if (settings.anime) {
      patchSync({ detail: 'Sincronizando anime…' });
      const a = await syncAnime(status.user.id, dryRun);
      counts.animePushed = a.pushed;
      counts.animePulled = a.pulled;
      counts.failed += a.failed;
      pushedItems.push(...(a.pushedItems ?? []));
      plan.push(...(a.plan ?? []));
    }
    if (settings.manga) {
      const m = await syncManga(status.user.id, (detail) => patchSync({ detail }), dryRun);
      counts.mangaPushed = m.pushed;
      counts.mangaPulled = m.pulled;
      counts.imported = m.imported ?? 0;
      counts.linkedAuto = m.linkedAuto ?? 0;
      counts.failed += m.failed;
      pushedItems.push(...(m.pushedItems ?? []));
      plan.push(...(m.plan ?? []));
    }
    if (dryRun) {
      if (plan.length === 0) {
        // Nada que enviar: no hay nada que confirmar; se sincroniza (solo traer) como siempre.
        // La cuenta solo queda confirmada si se revisaron TODAS las secciones: con el anime omitido
        // (sin sesión en KageView) lo que llegue después aún tiene que pasar por la revisión.
        const reviewedAll = !settings.anime || useAppStore.getState().account.status === 'signedIn';
        if (reviewedAll) patchSync({ confirmedViewerId: status.user.id });
        return runOnce(reason, true);
      }
      patchSync({ phase: 'idle', detail: null, plan: { items: plan } });
      return;
    }
    patchSync({ phase: 'idle', detail: null, lastSyncAt: now(), counts });
    // Solo se avisa en los envíos automáticos tras tu cambio (no al pulsar «Sincronizar» ni al conectar)
    if (reason === 'auto') announce(pushedItems);
  } catch (err) {
    patchSync({ phase: 'error', detail: null, error: describeError(err), counts });
    if (err instanceof AniListApiError && err.code === 'unauthorized') patchSync({ status: await api.getStatus() });
  }
}

/** Sincroniza ya. Si hay una en curso, pide otra al terminar (sin solaparse). */
export function syncNow(reason: SyncReason = 'manual'): Promise<void> {
  if (running) {
    rerun = true;
    if (reason === 'manual') queuedReason = 'manual';
    return running;
  }
  running = (async () => {
    let why = reason;
    do {
      rerun = false;
      await runOnce(why);
      why = queuedReason;
      queuedReason = 'auto';
    } while (rerun);
  })().finally(() => {
    running = null;
  });
  return running;
}

export const isSyncing = (): boolean => running !== null;

/** El usuario acepta que KageView escriba en su AniList: se envía lo revisado y sigue la sincronización normal. */
export function confirmPlan(): Promise<void> {
  const id = getSync().status?.user?.id;
  if (typeof id !== 'number') return Promise.resolve();
  patchSync({ confirmedViewerId: id, plan: null });
  return syncNow('manual');
}

/** «Ahora no»: se cierra el aviso y no se envía nada. Volverá a preguntar al pulsar «Sincronizar ahora». */
export function dismissPlan(): void {
  patchSync({ plan: null });
}

/** ¿El usuario ya aceptó escribir en la cuenta de AniList conectada? */
export const isConfirmed = (): boolean => {
  const s = getSync();
  return typeof s.status?.user?.id === 'number' && s.confirmedViewerId === s.status.user.id;
};

// ─── Envío rápido de UN anime (al terminar un episodio) ────
export type FastResult = 'pushed' | 'pulled' | 'skipped';

/**
 * Envía a AniList el progreso de UN anime sin descargar toda la lista (1 lectura + 1 escritura),
 * para que el episodio visto salga al momento. Si AniList va por delante (lo viste en otro
 * dispositivo), se trae a KageView. Si hay una sincronización completa en curso o es la primera
 * vez con esta cuenta, la deja en manos de la sincronización completa.
 */
export async function pushAnimeProgress(change: AnimeChange): Promise<FastResult> {
  await initSyncState();
  const s = getSync();
  const user = s.status?.user;
  if (!s.status?.connected || !user || !s.settings.anime) return 'skipped';
  const backend = getBackend();
  if (!backend || useAppStore.getState().account.status !== 'signedIn') return 'skipped';
  if (s.confirmedViewerId !== user.id) return 'skipped'; // primera vez: aún sin permiso para escribir
  if (isSyncing() || s.viewerId !== user.id) {
    void syncNow('auto');
    return 'skipped';
  }

  try {
    const remote = await api.fetchEntry(user.id, change.mediaId, 'ANIME');
    const out = mergeEntry({
      base: getSync().anime[change.mediaId] ?? null,
      local: { status: change.status, progress: change.progress, score: change.score, at: now() },
      remote: remoteSide(remote ?? undefined),
      scoreSynced: true,
    });
    if (!out.next) return 'skipped';
    const next = out.next;
    let result: FastResult = 'skipped';

    if (out.toRemote) {
      const saved = await api.saveEntries([{ mediaId: change.mediaId, status: next.status, progress: next.progress, score: next.score }]);
      if (saved.ok.length === 0) return 'skipped';
      result = 'pushed';
    }
    if (out.toLocal && remote) {
      await backend.upsertLibraryEntry({
        mediaType: 'anime', mediaId: change.mediaId, status: next.status, progress: next.progress, score: next.score,
        media: mediaToSnapshot(remote.media),
      });
      await loadMyList();
      if (result === 'skipped') result = 'pulled';
    }
    patchSync((st) => ({ anime: { ...st.anime, [change.mediaId]: next } }));
    if (result === 'pushed') announce([{ kind: 'anime', title: change.title, progress: next.progress }]);
    return result;
  } catch (err) {
    if (err instanceof AniListApiError && err.code === 'unauthorized') patchSync({ status: await api.getStatus() });
    return 'skipped'; // la sincronización completa lo reintentará
  }
}

/** Huella de lo que se sincroniza del manga: solo cambia si cambia un estado o un capítulo leído. */
export function mangaSignature(): string {
  return libraryRecords()
    .map((r) => `${mangaKey(r.manga)}:${r.status}:${progressFromRanges(r.readRanges)}`)
    .sort()
    .join('|');
}

