// ═══════════════════════════════════════════════════════════
// readingPresence — publica "leyendo ahora" para tus amigos
//
// Mientras el lector está abierto se envía un latido cada minuto (con el capítulo
// y la página actuales); los amigos consideran "leyendo ahora" a quien envió uno
// en los últimos ~3,5 min. Si el usuario oculta su actividad en el perfil, no se
// publica nada. Es el equivalente de presence.ts para el manga.
// ═══════════════════════════════════════════════════════════

import { ReadingActivityInput, getBackend } from '../backend';
import { useAppStore } from '../store';
import type { MangaModel } from './types';

const HEARTBEAT_MS = 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let current: ReadingActivityInput | null = null;

function canPublish(): boolean {
  const { status, profile } = useAppStore.getState().account;
  return status === 'signedIn' && profile?.showActivity !== false;
}

async function send(): Promise<void> {
  const backend = getBackend();
  if (!backend || !current || !canPublish()) return;
  try {
    await backend.setReadingActivity(current);
  } catch (err) {
    // Sin la migración (o sin red) simplemente no se publica: la lectura no se ve afectada
    console.debug('[readingPresence] No se pudo publicar:', err);
  }
}

/** Empieza (o actualiza a otro capítulo/página) el "leyendo ahora". */
export function startReading(manga: MangaModel, chapter: string | null, page: number, pageCount: number): void {
  const first = current === null || current.mangaId !== manga.id || current.chapter !== chapter;
  current = {
    source: manga.sourceId,
    mangaId: manga.id,
    title: manga.title,
    coverUrl: manga.coverUrl || null,
    chapter,
    page,
    pageCount,
  };
  // Un cambio de capítulo se publica al instante; el avance de páginas va en el latido
  if (first) void send();
  if (timer === null) timer = setInterval(() => void send(), HEARTBEAT_MS);
}

/** Actualiza solo la página (se enviará en el siguiente latido). */
export function updateReadingPage(page: number, pageCount: number): void {
  if (current) current = { ...current, page, pageCount };
}

/** Deja de publicar y marca la actividad como inactiva. */
export function stopReading(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  const had = current !== null;
  current = null;
  const backend = getBackend();
  if (had && backend && useAppStore.getState().account.status === 'signedIn') {
    backend.clearReadingActivity().catch(() => { /* sin sesión / sin red: caduca sola */ });
  }
}
