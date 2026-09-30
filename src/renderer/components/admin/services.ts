/** Servicios que se pueden desactivar para todos los usuarios. */
export const SERVICES: Array<{ id: string; label: string; kind: 'Anime' | 'Manga' }> = [
  { id: 'animeflv', label: 'AnimeFLV', kind: 'Anime' },
  { id: 'animeav1', label: 'AnimeAV1', kind: 'Anime' },
  { id: 'jkanime', label: 'JKAnime', kind: 'Anime' },
  { id: 'mangadex', label: 'MangaDex', kind: 'Manga' },
  { id: 'inmanga', label: 'InManga', kind: 'Manga' },
  { id: 'manhwaweb', label: 'ManhwaWeb', kind: 'Manga' },
  { id: 'mangaoni', label: 'MangaOni', kind: 'Manga' },
];

export const serviceLabel = (id: string): string => SERVICES.find((s) => s.id === id)?.label ?? id;
