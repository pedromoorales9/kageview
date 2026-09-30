export interface MangaModel {
  id: string;
  sourceId: string;
  title: string;
  description: string;
  coverUrl: string;
  status: 'ongoing' | 'completed' | 'hiatus' | 'cancelled';
  tags: string[];
  year: number | null;
  lastChapter: string | null;
  isAdult?: boolean;
}

export interface MangaChapterModel {
  id: string;
  sourceId: string;
  chapter: string | null;
  volume: string | null;
  title: string | null;
  pages: number;
  publishAt: string;
  translatedLanguage: string;
}

export interface MangaPagesModel {
  baseUrl: string;
  hash: string;
  data: string[];
  dataSaver: string[];
}

/** Cómo ordenar un listado (no todas las fuentes admiten todos). */
export type MangaSort = 'popular' | 'recent' | 'rating' | 'az';

export interface MangaGenre {
  id: string;
  name: string;
}

export interface MangaLanguage {
  code: string;
  label: string;
}

export interface MangaChaptersOptions {
  /** Idiomas a incluir, por orden de preferencia (solo las fuentes multi-idioma). */
  languages?: string[];
}

export interface MangaProvider {
  id: string;
  name: string;
  /** Resultados por página; si una página devuelve tantos, probablemente hay más. */
  readonly pageSize: number;
  /** Solo si la fuente ofrece más de un idioma de capítulos. */
  readonly languages?: MangaLanguage[];

  /** `page` empieza en 1. */
  searchManga(query: string, page?: number): Promise<MangaModel[]>;
  getPopularManga(page?: number): Promise<MangaModel[]>;
  getRecentlyUpdatedManga(page?: number): Promise<MangaModel[]>;
  /** Sin orden garantizado: usar `loadMangaChapters`, que los normaliza. */
  getMangaChapters(mangaId: string, opts?: MangaChaptersOptions): Promise<MangaChapterModel[]>;
  getChapterPages(chapterId: string): Promise<MangaPagesModel>;

  /** Solo las fuentes que permiten filtrar por género. */
  getGenres?(): Promise<MangaGenre[]>;
  browse?(opts: { genre?: string; sort: MangaSort; page: number }): Promise<MangaModel[]>;
}
