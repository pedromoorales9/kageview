import { proxyGet } from '../../httpProxy';
import { MangaModel, MangaChapterModel, MangaPagesModel, MangaProvider } from '../types';

const API_BASE = 'https://manhwawebbackend-production.up.railway.app';

// ─── Status mapping ──────────────────────────────────────────────

function mapStatus(raw: string): MangaModel['status'] {
  switch (raw) {
    case 'finalizado':
      return 'completed';
    case 'pausado':
      return 'hiatus';
    case 'cancelado':
      return 'cancelled';
    default: // 'publicandose'
      return 'ongoing';
  }
}

// ─── Parse manga from library listing ────────────────────────────

function parseMangaFromListing(item: any): MangaModel {
  return {
    id: item.real_id ?? item._id,
    sourceId: 'manhwaweb',
    title: item.the_real_name ?? item.name_esp ?? 'Sin título',
    description: item.the_real_name ?? '',
    coverUrl: item._imagen ?? '',
    status: mapStatus(item._status ?? ''),
    tags: [],
    year: null,
    lastChapter: item._numero_cap != null ? String(item._numero_cap) : null,
    isAdult: item._erotico === 'si',
  };
}

// ─── Parse manga from /manhwa/see/ detail ────────────────────────

function parseTags(cats: any[] | undefined): string[] {
  if (!Array.isArray(cats)) return [];
  return cats
    .map((c: any) => {
      // categories come as { "1": "Drama" } objects
      const vals = Object.values(c);
      return vals.length > 0 ? String(vals[0]) : '';
    })
    .filter(Boolean);
}

// ─── Provider Export ─────────────────────────────────────────────

export const ManhwaWebProvider: MangaProvider = {
  id: 'manhwaweb',
  name: 'ManhwaWeb',

  /** Search by title keyword */
  async searchManga(query: string): Promise<MangaModel[]> {
    const params: Record<string, string> = {
      buscar: query.trim(),
      order_item: 'views',
      order_dir: 'desc',
    };
    const res = await proxyGet<any>(`${API_BASE}/manhwa/library`, { params, retries: 1 });
    const parsed = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    return (parsed?.data ?? []).map(parseMangaFromListing);
  },

  /** Popular manga — sorted by views */
  async getPopularManga(): Promise<MangaModel[]> {
    const params: Record<string, string> = {
      order_item: 'views',
      order_dir: 'desc',
    };
    const res = await proxyGet<any>(`${API_BASE}/manhwa/library`, { params, retries: 1 });
    const parsed = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    return (parsed?.data ?? []).map(parseMangaFromListing);
  },

  /** Recently updated manga — sorted by last chapter date */
  async getRecentlyUpdatedManga(): Promise<MangaModel[]> {
    const params: Record<string, string> = {
      order_item: 'last_chapter_date',
      order_dir: 'desc',
    };
    const res = await proxyGet<any>(`${API_BASE}/manhwa/library`, { params, retries: 1 });
    const parsed = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    return (parsed?.data ?? []).map(parseMangaFromListing);
  },

  /** Get chapters for a manga from the detail endpoint */
  async getMangaChapters(mangaId: string): Promise<MangaChapterModel[]> {
    const res = await proxyGet<any>(`${API_BASE}/manhwa/see/${mangaId}`, { retries: 1 });
    const parsed = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;

    const chapters: any[] = parsed?.chapters ?? [];
    const internalId = parsed?._id ?? mangaId;

    return chapters
      .map((ch: any, _idx: number) => ({
        id: `${internalId}-${ch.chapter}`, // e.g. "my-manga_123456789-1"
        sourceId: 'manhwaweb',
        chapter: ch.chapter != null ? String(ch.chapter) : null,
        volume: null,
        title: null,
        pages: Array.isArray(ch.img) ? ch.img.length : 0,
        publishAt: ch.create ? new Date(ch.create).toISOString() : '',
        translatedLanguage: 'es',
      }))
      .sort(
        (a: MangaChapterModel, b: MangaChapterModel) =>
          parseFloat(a.chapter || '0') - parseFloat(b.chapter || '0')
      );
  },

  /** Get chapter image pages from /chapters/see/{chapterSlug} */
  async getChapterPages(chapterId: string): Promise<MangaPagesModel> {
    // chapterId is already in the format "mangaSlug-chapterNumber"
    const res = await proxyGet<any>(`${API_BASE}/chapters/see/${chapterId}`, { retries: 1 });
    const parsed = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;

    const images: string[] = parsed?.chapter?.img ?? [];

    // Images are absolute URLs from imageshack CDN — return them directly
    return {
      baseUrl: '',
      hash: '',
      data: images,
      dataSaver: [],
    };
  },
};
