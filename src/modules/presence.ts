// ═══════════════════════════════════════════════════════════
// presence — Publica "viendo ahora" para tus amigos
//
// Mientras el reproductor está abierto se envía un latido cada minuto; los
// amigos consideran "viendo ahora" a quien envió uno en los últimos ~3,5 min.
// Si el usuario oculta su actividad en el perfil, no se publica nada.
// ═══════════════════════════════════════════════════════════

import { ActivityInput, getBackend } from './backend';
import { useAppStore } from './store';
import { AniListAnime } from '../types/types';

const HEARTBEAT_MS = 60 * 1000;

let timer: number | null = null;
let current: ActivityInput | null = null;

function canPublish(): boolean {
  const { status, profile } = useAppStore.getState().account;
  return status === 'signedIn' && profile?.showActivity !== false;
}

async function send(): Promise<void> {
  const backend = getBackend();
  if (!backend || !current || !canPublish()) return;
  try {
    await backend.setActivity(current);
  } catch (err) {
    console.warn('[presence] No se pudo publicar la actividad:', err);
  }
}

/** Empieza (o actualiza a otro episodio) el "viendo ahora". */
export function startWatching(anime: AniListAnime, episode: number): void {
  current = {
    mediaId: anime.id,
    title: anime.title.english || anime.title.romaji,
    coverUrl: anime.coverImage?.large || null,
    episode,
    totalEpisodes: anime.episodes ?? null,
  };
  void send();
  if (timer === null) timer = window.setInterval(() => void send(), HEARTBEAT_MS);
}

/** Deja de publicar y marca la actividad como inactiva. */
export function stopWatching(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  const had = current !== null;
  current = null;
  const backend = getBackend();
  if (had && backend && useAppStore.getState().account.status === 'signedIn') {
    backend.clearActivity().catch(() => { /* sin sesión / sin red: caduca sola */ });
  }
}
