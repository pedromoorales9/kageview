import { proxyGet } from '../../httpProxy';
import { MangaModel, MangaChapterModel, MangaPagesModel, MangaProvider } from '../types';

const MDEX_API = 'https://api.mangadex.org';
const MDEX_COVERS = 'https://uploads.mangadex.org/covers';

// MangaDex bloquea User-Agents de navegador (Chrome/Firefox → 400 "Unsupported
// Browser"). Su API exige un UA de cliente que identifique la app, no que finja
// ser un navegador. main.ts inyecta Chrome por defecto, así que lo sobrescribimos.
const MDEX_USER_AGENT = 'KageView/1.0 (https://github.com/pedromoorales9/KageView)';
const MDEX_HEADERS = { 'User-Agent': MDEX_USER_AGENT };

function parseManga(raw: any): MangaModel {
  const attrs = raw.attributes || {};

  const titleObj: Record<string, string> = attrs.title ?? {};
  const altTitles: Record<string, string>[] = attrs.altTitles ?? [];
  const merged: Record<string, string> = {};
  altTitles.forEach((t) => Object.assign(merged, t));
  Object.assign(merged, titleObj);
  const title =
    merged['es'] ??
    merged['es-la'] ??
    merged['en'] ??
    merged['ja-ro'] ??
    merged['ja'] ??
    Object.values(merged)[0] ??
    'Sin título';

  const descObj: Record<string, string> = attrs.description ?? {};
  const description = descObj['es'] ?? descObj['es-la'] ?? descObj['en'] ?? '';

  const coverRel = (raw.relationships ?? []).find((r: any) => r.type === 'cover_art');
  const coverUrl = coverRel?.attributes?.fileName
    ? `${MDEX_COVERS}/${raw.id}/${coverRel.attributes.fileName}.256.jpg`
    : '';

  const tags = (attrs.tags ?? [])
    .map((t: any) => t.attributes?.name?.en ?? '')
    .filter(Boolean) as string[];

  return {
    id: raw.id,
    sourceId: 'mangadex',
    title,
    description,
    coverUrl,
    status: attrs.status ?? 'ongoing',
    tags,
    year: attrs.year ?? null,
    lastChapter: attrs.lastChapter ?? null,
  };
}

function baseParams(): URLSearchParams {
  const p = new URLSearchParams();
  p.append('availableTranslatedLanguage[]', 'es');
  p.append('availableTranslatedLanguage[]', 'es-la');
  p.append('includes[]', 'cover_art');
  p.set('limit', '20');
  p.append('contentRating[]', 'safe');
  p.append('contentRating[]', 'suggestive');
  return p;
}

export const MangaDexProvider: MangaProvider = {
  id: 'mangadex',
  name: 'MangaDex',

  async searchManga(query: string): Promise<MangaModel[]> {
    const p = baseParams();
    if (query.trim()) p.set('title', query.trim());
    const res = await proxyGet<any>(`${MDEX_API}/manga?${p.toString()}`, { headers: MDEX_HEADERS });
    return (res.data?.data ?? []).map(parseManga);
  },

  async getPopularManga(): Promise<MangaModel[]> {
    const p = baseParams();
    p.set('order[followedCount]', 'desc');
    const res = await proxyGet<any>(`${MDEX_API}/manga?${p.toString()}`, { headers: MDEX_HEADERS });
    return (res.data?.data ?? []).map(parseManga);
  },

  async getRecentlyUpdatedManga(): Promise<MangaModel[]> {
    const p = baseParams();
    p.set('order[updatedAt]', 'desc');
    const res = await proxyGet<any>(`${MDEX_API}/manga?${p.toString()}`, { headers: MDEX_HEADERS });
    return (res.data?.data ?? []).map(parseManga);
  },

  async getMangaChapters(mangaId: string): Promise<MangaChapterModel[]> {
    const p = new URLSearchParams();
    p.append('translatedLanguage[]', 'es');
    p.append('translatedLanguage[]', 'es-la');
    p.set('order[chapter]', 'asc');
    p.set('limit', '500');

    const res = await proxyGet<any>(`${MDEX_API}/manga/${mangaId}/feed?${p.toString()}`, { headers: MDEX_HEADERS });
    const raw: any[] = res.data?.data ?? [];

    const chapters: MangaChapterModel[] = raw.map((c) => ({
      id: c.id,
      sourceId: 'mangadex',
      chapter: c.attributes.chapter ?? null,
      volume: c.attributes.volume ?? null,
      title: c.attributes.title ?? null,
      pages: c.attributes.pages ?? 0,
      publishAt: c.attributes.publishAt ?? '',
      translatedLanguage: c.attributes.translatedLanguage,
    }));

    const seen = new Map<string, MangaChapterModel>();
    chapters.forEach((ch) => {
      if (ch.pages === 0) return;
      const key = ch.chapter ?? ch.id;
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, ch);
      } else if (ch.translatedLanguage === 'es' && existing.translatedLanguage !== 'es') {
        seen.set(key, ch);
      }
    });

    return Array.from(seen.values());
  },

  async getChapterPages(chapterId: string): Promise<MangaPagesModel> {
    const res = await proxyGet<any>(`${MDEX_API}/at-home/server/${chapterId}`, { headers: MDEX_HEADERS });
    const ch = res.data?.chapter;
    return {
      baseUrl: res.data?.baseUrl ?? 'https://uploads.mangadex.org',
      hash: ch?.hash ?? '',
      data: ch?.data ?? [],
      dataSaver: ch?.dataSaver ?? [],
    };
  }
};
