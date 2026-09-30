// ═══════════════════════════════════════════════════════════
// share — convierte mangas para compartirlos (chat) y para mostrar lo que
// leen los amigos. Todo lo que llega de otra persona se trata como no fiable.
// ═══════════════════════════════════════════════════════════

import type { FriendReading, MangaShare } from '../backend';
import type { MangaModel } from './types';

const STATUSES = ['ongoing', 'completed', 'hiatus', 'cancelled'] as const;
const httpsOnly = (u: string | null | undefined) => (u && /^https:\/\//.test(u) && u.length <= 500 ? u : '');

/** Lo que se envía por chat: lo justo para pintar la tarjeta y abrir la ficha. */
export function toMangaShare(m: MangaModel): MangaShare {
  return {
    id: m.id,
    sourceId: m.sourceId,
    title: m.title.slice(0, 300) || 'Sin título',
    coverUrl: httpsOnly(m.coverUrl),
    status: m.status,
    year: m.year ?? null,
    lastChapter: m.lastChapter ?? null,
    tags: (m.tags ?? []).slice(0, 8),
  };
}

/** Manga a partir de una tarjeta compartida (para abrir su ficha). */
export function mangaFromShare(s: MangaShare): MangaModel {
  return {
    id: s.id,
    sourceId: s.sourceId,
    title: s.title,
    description: '',
    coverUrl: httpsOnly(s.coverUrl),
    status: (STATUSES as readonly string[]).includes(s.status) ? (s.status as MangaModel['status']) : 'ongoing',
    tags: s.tags ?? [],
    year: s.year ?? null,
    lastChapter: s.lastChapter ?? null,
  };
}

/** Manga a partir de lo que un amigo está leyendo (para abrir su ficha). */
export function mangaFromReading(r: Pick<FriendReading, 'source' | 'mangaId' | 'title' | 'coverUrl'>): MangaModel {
  return {
    id: r.mangaId,
    sourceId: r.source,
    title: r.title,
    description: '',
    coverUrl: httpsOnly(r.coverUrl),
    status: 'ongoing',
    tags: [],
    year: null,
    lastChapter: null,
  };
}
