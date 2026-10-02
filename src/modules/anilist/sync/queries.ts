// ═══════════════════════════════════════════════════════════
// Consultas GraphQL de AniList y lectura defensiva de sus respuestas
// ═══════════════════════════════════════════════════════════

import { ALEntry, ALMedia, ALSave, ALType, ALViewer, isALStatus } from './types';

export const MEDIA_FIELDS = `
  id idMal type format status isAdult popularity averageScore episodes chapters
  title { romaji english native }
  synonyms
  genres
  coverImage { extraLarge large color }
  bannerImage
  seasonYear
  startDate { year }
`;

export const VIEWER_QUERY = `query { Viewer { id name avatar { large medium } } }`;

export const SEARCH_MANGA_QUERY = `
  query ($q: String!, $perPage: Int) {
    Page(perPage: $perPage) {
      media(search: $q, type: MANGA, format_in: [MANGA, ONE_SHOT], sort: SEARCH_MATCH) { ${MEDIA_FIELDS} }
    }
  }`;

/** Lista completa del usuario, por bloques (AniList la reparte en `chunk`s). */
export const LIST_QUERY = `
  query ($userId: Int!, $type: MediaType!, $chunk: Int, $perChunk: Int) {
    MediaListCollection(userId: $userId, type: $type, chunk: $chunk, perChunk: $perChunk, forceSingleCompletedList: true) {
      hasNextChunk
      lists {
        entries {
          id mediaId status progress updatedAt
          score(format: POINT_100)
          media { ${MEDIA_FIELDS} }
        }
      }
    }
  }`;

export const ENTRY_QUERY = `
  query ($userId: Int!, $mediaId: Int!) {
    MediaList(userId: $userId, mediaId: $mediaId) {
      id mediaId status progress updatedAt
      score(format: POINT_100)
      media { ${MEDIA_FIELDS} }
    }
  }`;

/** Varias escrituras en UNA petición (AniList limita las peticiones, no las mutaciones). */
export function buildSaveBatch(items: readonly ALSave[]): { query: string; variables: Record<string, unknown> } {
  const vars: string[] = [];
  const fields: string[] = [];
  const variables: Record<string, unknown> = {};
  items.forEach((it, i) => {
    vars.push(`$m${i}: Int!, $s${i}: MediaListStatus!, $p${i}: Int!`);
    const args = [`mediaId: $m${i}`, `status: $s${i}`, `progress: $p${i}`];
    variables[`m${i}`] = it.mediaId;
    variables[`s${i}`] = it.status;
    variables[`p${i}`] = Math.max(0, Math.floor(it.progress));
    if (typeof it.score === 'number') {
      vars.push(`$r${i}: Int`);
      args.push(`scoreRaw: $r${i}`);
      variables[`r${i}`] = Math.max(0, Math.min(100, Math.round(it.score)));
    }
    fields.push(`w${i}: SaveMediaListEntry(${args.join(', ')}) { id mediaId }`);
  });
  return { query: `mutation (${vars.join(', ')}) { ${fields.join(' ')} }`, variables };
}

// ─── Lectura defensiva ─────────────────────────────────────
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseMedia(raw: unknown, fallbackType: ALType): ALMedia | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const id = num(r.id);
  if (id === null || !Number.isInteger(id) || id <= 0) return null;
  const title = r.title ?? {};
  return {
    id,
    idMal: num(r.idMal),
    type: r.type === 'ANIME' || r.type === 'MANGA' ? r.type : fallbackType,
    title: { romaji: str(title.romaji), english: str(title.english), native: str(title.native) },
    synonyms: Array.isArray(r.synonyms) ? r.synonyms.filter((s: unknown): s is string => typeof s === 'string').slice(0, 20) : [],
    coverImage: { extraLarge: str(r.coverImage?.extraLarge), large: str(r.coverImage?.large), color: str(r.coverImage?.color) },
    bannerImage: str(r.bannerImage),
    episodes: num(r.episodes),
    chapters: num(r.chapters),
    genres: Array.isArray(r.genres) ? r.genres.filter((g: unknown): g is string => typeof g === 'string').slice(0, 12) : [],
    averageScore: num(r.averageScore),
    status: str(r.status),
    seasonYear: num(r.seasonYear),
    startYear: num(r.startDate?.year),
    format: str(r.format),
    isAdult: r.isAdult === true,
    popularity: num(r.popularity),
  };
}

export function parseEntry(raw: unknown, type: ALType): ALEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const media = parseMedia(r.media, type);
  const mediaId = num(r.mediaId);
  if (!media || mediaId === null || !isALStatus(r.status)) return null;
  return {
    id: num(r.id) ?? 0,
    mediaId,
    status: r.status,
    progress: Math.max(0, Math.floor(num(r.progress) ?? 0)),
    score: Math.max(0, Math.min(100, Math.round(num(r.score) ?? 0))),
    updatedAt: (num(r.updatedAt) ?? 0) * 1000,
    media,
  };
}

export function parseViewer(raw: unknown): ALViewer | null {
  const v = (raw as { Viewer?: Record<string, any> } | null)?.Viewer;
  const id = num(v?.id);
  if (!v || id === null || !str(v.name)) return null;
  return { id, name: v.name as string, avatar: str(v.avatar?.large) ?? str(v.avatar?.medium) };
}

/** Entradas de una página de `MediaListCollection` (aplanando las listas por estado). */
export function parseListChunk(raw: unknown, type: ALType): { entries: ALEntry[]; hasNext: boolean } {
  const col = (raw as { MediaListCollection?: { hasNextChunk?: boolean; lists?: Array<{ entries?: unknown[] }> } } | null)?.MediaListCollection;
  const entries: ALEntry[] = [];
  for (const list of col?.lists ?? []) {
    for (const e of list.entries ?? []) {
      const parsed = parseEntry(e, type);
      if (parsed) entries.push(parsed);
    }
  }
  return { entries, hasNext: col?.hasNextChunk === true };
}
