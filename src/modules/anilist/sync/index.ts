// ═══════════════════════════════════════════════════════════
// Sincronización con AniList — ciclo de vida y funciones para la interfaz
//
// Se sincroniza: al conectar, cada 15 minutos, al recuperar la conexión, y poco
// después de que cambies algo (con un retraso para no hacerlo a cada página que lees).
// ═══════════════════════════════════════════════════════════

import { onMangaChange } from '../../manga/mangaStore';
import { notify } from '../../notify';
import { getStatus } from './api';
import { AnimeChange, onAnimeListChange } from './changeBus';
import { isConfirmed, isSyncing, mangaSignature, pushAnimeProgress, syncNow } from './engine';
import { getSync, initSyncState, patchSync } from './state';
import type { AniListStatus } from './bridge';

export * from './engine';
export { useAniListSync, getSync, patchSync, setSettings } from './state';
export type { AniListStatus } from './bridge';

const FIRST_SYNC_DELAY_MS = 8_000;
const EVERY_MS = 15 * 60 * 1000;
/** Tras un cambio en el manga, se espera a que dejes de tocar y luego se sincroniza. */
const CHANGE_DEBOUNCE_MS = 12_000;
/** Separación mínima entre sincronizaciones automáticas completas. */
const MIN_GAP_MS = 20_000;
/** Un episodio visto se envía enseguida (se agrupan los que lleguen casi a la vez). */
const ANIME_DEBOUNCE_MS = 2_500;

let started = false;
let timers: ReturnType<typeof setTimeout>[] = [];
let interval: ReturnType<typeof setInterval> | null = null;
let changeTimer: ReturnType<typeof setTimeout> | null = null;
let unsubs: Array<() => void> = [];
let lastAutoAt = 0;
let lastMangaSig = '';
let animeTimer: ReturnType<typeof setTimeout> | null = null;
const pendingAnime = new Map<number, AnimeChange>();

const connected = (): boolean => {
  const s = getSync();
  return !!s.status?.connected && (s.settings.anime || s.settings.manga);
};

/** Conectado Y con permiso del usuario para escribir en su AniList (lo da al confirmar la primera vez). */
const enabled = (): boolean => connected() && isConfirmed();

/** Lanza una sincronización completa recordando cómo estaba el manga en ese momento. */
function kick(reason: 'manual' | 'auto'): void {
  lastAutoAt = Date.now();
  lastMangaSig = mangaSignature();
  void syncNow(reason);
}

function scheduleAfterChange(): void {
  if (!enabled()) return;
  if (changeTimer) clearTimeout(changeTimer);
  changeTimer = setTimeout(() => {
    changeTimer = null;
    if (!enabled() || isSyncing()) return;
    if (Date.now() - lastAutoAt < MIN_GAP_MS) return scheduleAfterChange();
    kick('auto');
  }, CHANGE_DEBOUNCE_MS);
}

/** Cambio en el manga: solo cuenta si cambia un estado o un capítulo leído (no cada página). */
function onMangaChanged(): void {
  if (mangaSignature() !== lastMangaSig) scheduleAfterChange();
}

/** Cambio en el anime: el episodio visto se envía enseguida, sin esperar a la sincronización completa. */
function onAnimeChanged(change?: AnimeChange): void {
  if (!enabled()) return;
  if (!change) return scheduleAfterChange();
  if (!getSync().settings.anime) return;
  pendingAnime.set(change.mediaId, change);
  if (animeTimer) clearTimeout(animeTimer);
  animeTimer = setTimeout(async () => {
    animeTimer = null;
    const batch = [...pendingAnime.values()];
    pendingAnime.clear();
    for (const c of batch) await pushAnimeProgress(c);
  }, ANIME_DEBOUNCE_MS);
}

/** Arranca la sincronización (una vez, al abrir la app). */
export async function startAniListSync(): Promise<void> {
  if (started) return;
  started = true;
  await initSyncState();
  patchSync({ status: await getStatus() });

  if (typeof window !== 'undefined') {
    window.electron?.onAnilistStatus?.((status: AniListStatus) => {
      const was = getSync().status?.connected;
      patchSync({ status });
      if (status.connected && !was) kick('manual'); // acaba de conectarse (la primera vez solo prepara el resumen a confirmar)
    });
    window.electron?.onAnilistLoginResult?.((r) => {
      if (r.ok) notify('success', 'Cuenta de AniList conectada.', 'AniList');
      else notify('error', r.error === 'invalid_token' ? 'AniList no aceptó el acceso. Inténtalo de nuevo.' : 'No se pudo conectar con AniList.', 'AniList');
    });
    const onOnline = () => { if (enabled()) kick('manual'); };
    window.addEventListener('online', onOnline);
    unsubs.push(() => window.removeEventListener('online', onOnline));
  }

  lastMangaSig = mangaSignature();
  unsubs.push(onMangaChange(onMangaChanged), onAnimeListChange(onAnimeChanged));
  timers.push(setTimeout(() => { if (connected()) kick('manual'); }, FIRST_SYNC_DELAY_MS));
  interval = setInterval(() => { if (enabled() && !isSyncing()) kick('manual'); }, EVERY_MS);
}

export function stopAniListSync(): void {
  started = false;
  timers.forEach(clearTimeout);
  timers = [];
  if (interval) clearInterval(interval);
  interval = null;
  if (changeTimer) clearTimeout(changeTimer);
  changeTimer = null;
  if (animeTimer) clearTimeout(animeTimer);
  animeTimer = null;
  pendingAnime.clear();
  unsubs.forEach((u) => u());
  unsubs = [];
}

// ─── Conexión (la usa la interfaz) ─────────────────────────
export type ConnectError = 'not_configured' | 'unavailable' | 'invalid_token' | 'forbidden' | 'unknown';

/** Abre AniList en el navegador para dar permiso. La vuelta llega por el enlace kageview://anilist-auth. */
export async function connectAniList(): Promise<{ ok: boolean; error?: ConnectError }> {
  const bridge = typeof window !== 'undefined' ? window.electron : undefined;
  if (!bridge?.anilistLogin) return { ok: false, error: 'unavailable' };
  const r = await bridge.anilistLogin();
  return r.ok ? { ok: true } : { ok: false, error: (r.error as ConnectError) ?? 'unknown' };
}

/** Plan B: pegar el token (o la dirección a la que redirigió AniList). */
export async function submitAniListToken(text: string): Promise<{ ok: boolean; error?: ConnectError }> {
  const bridge = typeof window !== 'undefined' ? window.electron : undefined;
  if (!bridge?.anilistSubmitToken) return { ok: false, error: 'unavailable' };
  const r = await bridge.anilistSubmitToken(text);
  if (r.ok) {
    patchSync({ status: await getStatus() });
    void syncNow();
  }
  return r.ok ? { ok: true } : { ok: false, error: (r.error as ConnectError) ?? 'unknown' };
}

export async function disconnectAniList(): Promise<void> {
  await window.electron?.anilistLogout?.();
  patchSync({ status: await getStatus(), phase: 'idle', error: null, detail: null, counts: null, anime: {}, manga: {}, viewerId: null });
}
