import { proxyGet, proxyPost } from '../../httpProxy';
import { MangaModel, MangaChapterModel, MangaPagesModel, MangaProvider } from '../types';

const INMANGA_URL = 'https://inmanga.com';
const IMAGE_CDN = 'https://cdn1.intomanga.com';

function extractGuid(url: string | null): string {
  if (!url) return '';
  const parts = url.split('/');
  return parts[parts.length - 1] || '';
}

/** Builds the exact URL-encoded body that InManga's server expects */
function buildBody(query: string, skip = 0, sortby: 1 | 3 = 1): string {
  return [
    'filter%5Bgeneres%5D%5B%5D=-1',
    `filter%5BqueryString%5D=${encodeURIComponent(query)}`,
    `filter%5Bskip%5D=${skip}`,
    'filter%5Btake%5D=10',
    `filter%5Bsortby%5D=${sortby}`,
    'filter%5BbroadcastStatus%5D=0',
    'filter%5BonlyFavorites%5D=false',
    'd=',
  ].join('&');
}

const POST_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'X-Requested-With': 'XMLHttpRequest',
};

function parseMangaList(html: string): MangaModel[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  // Tachiyomi uses "body > a" as the selector — InManga returns <a> tags at root level
  const nodes = doc.querySelectorAll('body > a');

  const results: MangaModel[] = [];
  nodes.forEach((node) => {
    const href = node.getAttribute('href') || '';
    const id = extractGuid(href);
    const title = node.querySelector('h4.m0')?.textContent?.replace(/"/g, '').trim() || 'Sin título';
    const img = node.querySelector('img');
    // InManga uses lazy loading: real URL is in data-src, src is a spinner gif
    let coverUrl = img?.getAttribute('data-src') || img?.getAttribute('src') || '';
    if (coverUrl && coverUrl.startsWith('/')) {
      coverUrl = `${INMANGA_URL}${coverUrl}`;
    }
    if (coverUrl.includes('loading-gear')) coverUrl = '';

    const statusText = node.querySelector('span.label-danger, span.label-success')?.textContent?.trim() || '';
    const status = statusText.toLowerCase().includes('finalizado') ? 'completed' : 'ongoing';

    if (id) {
      results.push({
        id,
        sourceId: 'inmanga',
        title,
        description: title,
        coverUrl,
        status,
        tags: [],
        year: null,
        lastChapter: null,
      });
    }
  });

  return results;
}

export const InMangaProvider: MangaProvider = {
  id: 'inmanga',
  name: 'InManga',

  async searchManga(query: string): Promise<MangaModel[]> {
    const body = buildBody(query.trim(), 0, 1);
    const res = await proxyPost<string>(`${INMANGA_URL}/manga/getMangasConsultResult`, body, {
      headers: POST_HEADERS,
    });
    return parseMangaList(res.data);
  },

  async getPopularManga(): Promise<MangaModel[]> {
    const body = buildBody('', 0, 1); // sortby=1 → popular
    const res = await proxyPost<string>(`${INMANGA_URL}/manga/getMangasConsultResult`, body, {
      headers: POST_HEADERS,
    });
    return parseMangaList(res.data);
  },

  async getRecentlyUpdatedManga(): Promise<MangaModel[]> {
    const body = buildBody('', 0, 3); // sortby=3 → latest
    const res = await proxyPost<string>(`${INMANGA_URL}/manga/getMangasConsultResult`, body, {
      headers: POST_HEADERS,
    });
    return parseMangaList(res.data);
  },

  async getMangaChapters(mangaId: string): Promise<MangaChapterModel[]> {
    const res = await proxyGet<any>(`${INMANGA_URL}/chapter/getall?mangaIdentification=${mangaId}`);
    let chaptersData: any;
    try {
      chaptersData = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      // The API double-encodes: outer JSON has .data which is itself JSON
      if (chaptersData.data && typeof chaptersData.data === 'string') {
        chaptersData = JSON.parse(chaptersData.data);
      }
    } catch {
      return [];
    }

    const chaptersArray = chaptersData?.result ?? chaptersData?.Result ?? [];
    return chaptersArray
      .map((ch: any) => ({
        id: ch.identification ?? ch.Identification,
        sourceId: 'inmanga',
        chapter: ch.friendlyChapterNumber ?? ch.FriendlyChapterNumber,
        volume: null,
        title: null,
        pages: ch.pagesCount ?? ch.PagesCount ?? 0,
        publishAt: ch.registrationDate ?? ch.RegistrationDate ?? '',
        translatedLanguage: 'es',
      }))
      .sort((a: MangaChapterModel, b: MangaChapterModel) =>
        parseFloat(b.chapter || '0') - parseFloat(a.chapter || '0')
      );
  },

  async getChapterPages(chapterId: string): Promise<MangaPagesModel> {
    const res = await proxyGet<string>(`${INMANGA_URL}/chapter/chapterIndexControls?identification=${chapterId}`);

    const parser = new DOMParser();
    const doc = parser.parseFromString(res.data, 'text/html');

    const chapterIdEl = doc.querySelector('input#ChapterIdentification')?.getAttribute('value') || chapterId;
    const mangaId = doc.querySelector('input#MangaIdentification')?.getAttribute('value') || '';

    // Official Tachiyomi method: IMAGE_CDN/i/m/MANGA_ID/c/CHAPTER_ID/o/PAGE_ID.jpg
    const imgEls = doc.querySelectorAll('img.ImageContainer');
    const images: string[] = [];

    imgEls.forEach((img) => {
      const pageId = img.getAttribute('id');
      if (pageId) {
        images.push(`${IMAGE_CDN}/i/m/${mangaId}/c/${chapterIdEl}/o/${pageId}.jpg`);
      }
    });

    // Fallback: use page options
    if (images.length === 0) {
      const mangaName = doc.querySelector('#FriendlyMangaName')?.getAttribute('value');
      const chapterUrlNumber = doc.querySelector('#FriendlyChapterNumberUrl')?.getAttribute('value');
      const pageOptions = doc.querySelectorAll('#PageList option');

      if (pageOptions.length > 0 && mangaName && chapterUrlNumber) {
        pageOptions.forEach((opt) => {
          const pageId = opt.getAttribute('value');
          const pageNum = opt.textContent?.trim();
          if (pageId && pageNum) {
            images.push(
              `https://pack-yak.inmanga.com/images/manga/${mangaName}/chapter/${chapterUrlNumber}/page/${pageNum}_${pageId}`
            );
          }
        });
      }
    }

    return { baseUrl: '', hash: '', data: images, dataSaver: [] };
  },
};
