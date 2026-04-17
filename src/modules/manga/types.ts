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

export interface MangaProvider {
  id: string;
  name: string;
  searchManga(query: string): Promise<MangaModel[]>;
  getPopularManga(): Promise<MangaModel[]>;
  getRecentlyUpdatedManga(): Promise<MangaModel[]>;
  getMangaChapters(mangaId: string): Promise<MangaChapterModel[]>;
  getChapterPages(chapterId: string): Promise<MangaPagesModel>;
}
