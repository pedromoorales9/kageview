// ═══════════════════════════════════════════════════════════
// Tipos de la sincronización con AniList
// ═══════════════════════════════════════════════════════════

export type ALType = 'ANIME' | 'MANGA';
export type ALStatus = 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'DROPPED' | 'PAUSED' | 'REPEATING';

export const AL_STATUSES: readonly ALStatus[] = ['CURRENT', 'PLANNING', 'COMPLETED', 'DROPPED', 'PAUSED', 'REPEATING'];
export const isALStatus = (v: unknown): v is ALStatus => typeof v === 'string' && (AL_STATUSES as readonly string[]).includes(v);

/** Ficha (resumida) de una obra de AniList. */
export interface ALMedia {
  id: number;
  idMal: number | null;
  type: ALType;
  title: { romaji: string | null; english: string | null; native: string | null };
  synonyms: string[];
  coverImage: { extraLarge: string | null; large: string | null; color: string | null };
  bannerImage: string | null;
  episodes: number | null;
  chapters: number | null;
  genres: string[];
  averageScore: number | null;
  /** FINISHED | RELEASING | NOT_YET_RELEASED | CANCELLED | HIATUS */
  status: string | null;
  seasonYear: number | null;
  startYear: number | null;
  /** MANGA | NOVEL | ONE_SHOT | TV | MOVIE… */
  format: string | null;
  isAdult: boolean;
  popularity: number | null;
}

/** Una entrada de la lista del usuario en AniList. */
export interface ALEntry {
  id: number;
  mediaId: number;
  status: ALStatus;
  progress: number;
  /** 0–100 (`POINT_100`), 0 = sin nota. */
  score: number;
  /** Última modificación (ms). */
  updatedAt: number;
  media: ALMedia;
}

export interface ALViewer {
  id: number;
  name: string;
  avatar: string | null;
}

/** Lo que se escribe en AniList. `score` en 0–100; omitido = no tocar. */
export interface ALSave {
  mediaId: number;
  status: ALStatus;
  progress: number;
  score?: number;
}

/** Vínculo entre un manga de una fuente y su ficha de AniList. */
export interface MangaLink {
  anilistId: number;
  title: string;
  cover: string | null;
  /** auto = por título · manual = lo eligió el usuario · import = viene de AniList */
  via: 'auto' | 'manual' | 'import';
  at: number;
}

/** Estado acordado la última vez que ambas partes coincidieron. */
export interface EntrySnap {
  status: ALStatus;
  progress: number;
  /** 0–100. */
  score: number;
}
