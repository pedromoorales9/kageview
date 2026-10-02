// ═══════════════════════════════════════════════════════════
// Sincronización con AniList — ciclo de vida y funciones para la interfaz
//
// Se sincroniza: al conectar, cada 15 minutos, al recuperar la conexión, y poco
// después de que cambies algo (con un retraso para no hacerlo a cada página que lees).
// ═══════════════════════════════════════════════════════════

import { onMangaChange } from '../../manga/mangaStore';
import { notify } from '../../notify';
import { getStatus } from './api';
import { onAnimeListChange } from './changeBus';
import { isSyncing, syncNow } from './engine';
import { getSync, initSyncState, patchSync } from './state';
import type { AniListStatus } from './bridge';

export * from './engine';
export { useAniListSync, getSync, patchSync } from './state';
export type { AniListStatus } from './bridge';

const FIRST_SYNC_DELAY_MS = 8_000;
const EVERY_MS = 15 * 60 * 1000;
/** Tras un cambio, se espera a que dejes de tocar y luego se sincroniza. */
const CHANGE_DEBOUNCE_MS = 30_000;
/** Separación mínima entre sincronizaciones automáticas. */
const MIN_GAP_MS = 60_000;

let started = false;
let timers: ReturnType<typeof setTimeout>[] = [];
let interval: ReturnType<typeof setInterval> | null = null;
let changeTimer: ReturnType<typeof setTimeout> | null = null;
let unsubs: Array<() => void> = [];
let lastAutoAt = 0;

const enabled = (): boolean => {
  const s = getSync();
  return !!s.status?.connected && (s.settings.anime || s.settings.manga);
};

function scheduleAfterChange(): void {
  if (!enabled()) return;
  if (changeTimer) clearTimeout(changeTimer);
  changeTimer = setTimeout(() => {
    changeTimer = null;
    if (!enabled() || isSyncing()) return;
    if (Date.now() - lastAutoAt < MIN_GAP_MS) return scheduleAfterChange();
    lastAutoAt = Date.now();
    void syncNow();
  }, CHANGE_DEBOUNCE_MS);
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
      if (status.connected && !was) void syncNow(); // acaba de conectarse
    });
    window.electron?.onAnilistLoginResult?.((r) => {
      if (r.ok) notify('success', 'Cuenta de AniList conectada.', 'AniList');
      else notify('error', r.error === 'invalid_token' ? 'AniList no aceptó el acceso. Inténtalo de nuevo.' : 'No se pudo conectar con AniList.', 'AniList');
    });
    const onOnline = () => { if (enabled()) void syncNow(); };
    window.addEventListener('online', onOnline);
    unsubs.push(() => window.removeEventListener('online', onOnline));
  }

  unsubs.push(onMangaChange(scheduleAfterChange), onAnimeListChange(scheduleAfterChange));
  timers.push(setTimeout(() => { if (enabled()) { lastAutoAt = Date.now(); void syncNow(); } }, FIRST_SYNC_DELAY_MS));
  interval = setInterval(() => { if (enabled() && !isSyncing()) { lastAutoAt = Date.now(); void syncNow(); } }, EVERY_MS);
}

export function stopAniListSync(): void {
  started = false;
  timers.forEach(clearTimeout);
  timers = [];
  if (interval) clearInterval(interval);
  interval = null;
  if (changeTimer) clearTimeout(changeTimer);
  changeTimer = null;
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
