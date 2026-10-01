// Prueba EN VIVO de WEBTOON (es). Solo con LIVE=1:
//   LIVE=1 npx vitest run src/modules/manga/__tests__/provider-webtoons.live.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../httpProxy', async () => {
  const h = await import('./liveHarness');
  return { proxyGet: h.liveProxyGet, proxyPost: h.liveProxyPost, proxyHead: vi.fn() };
});

import { installDom, fetchImageStatus } from './liveHarness';
installDom();

import { WebtoonsProvider as Provider } from '../providers/webtoons';
import { normalizeChapters } from '../chapters';

const live = process.env.LIVE ? describe : describe.skip;
const REFERER = 'https://www.webtoons.com/'; // lo que main.ts añadirá a *.pstatic.net

live(`${Provider.name} (en vivo)`, () => {
  it('popular, recientes y búsqueda devuelven mangas con título, id y portada', async () => {
    const popular = await Provider.getPopularManga(1);
    expect(popular.length).toBeGreaterThan(5);
    for (const m of popular.slice(0, 5)) {
      expect(m.id).toMatch(/^\d+$/);
      expect(m.sourceId).toBe(Provider.id);
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.coverUrl).toMatch(/^https:\/\//);
    }
    const recent = await Provider.getRecentlyUpdatedManga(1);
    expect(recent.length).toBeGreaterThan(5);
    const hit = await Provider.searchManga(popular[0].title.split(' ')[0]);
    expect(hit.length).toBeGreaterThan(0);
  }, 60000);

  it('paginación: popular p2 no repite p1 y recientes p2 (día anterior) es otra lista', async () => {
    const p1 = await Provider.getPopularManga(1);
    const p2 = await Provider.getPopularManga(2);
    expect(p2.length).toBeGreaterThan(0);
    const r1 = await Provider.getRecentlyUpdatedManga(1);
    const r2 = await Provider.getRecentlyUpdatedManga(2);
    expect(r2.length).toBeGreaterThan(0);
    // algunas series salen 2 días por semana (repiten); lo que importa es que sea otro día
    expect(r2.every((m) => r1.some((x) => x.id === m.id))).toBe(false);
    // la p2 sale del catálogo ordenado: puede repetir algo del ranking, pero no todo
    expect(p2.every((m) => p1.some((x) => x.id === m.id))).toBe(false);
  }, 120000);

  it('géneros y navegación por género', async () => {
    const genres = await Provider.getGenres!();
    expect(genres.length).toBeGreaterThan(5);
    const list = await Provider.browse!({ genre: 'romance', sort: 'popular', page: 1 });
    expect(list.length).toBeGreaterThan(10);
    const list2 = await Provider.browse!({ genre: 'romance', sort: 'popular', page: 2 });
    expect(list2.some((m) => list.some((x) => x.id === m.id))).toBe(false);
  }, 60000);

  it('capítulos → páginas → portada e imagen se descargan de verdad (con Referer)', async () => {
    const [first] = await Provider.getPopularManga(1);
    const chapters = normalizeChapters(await Provider.getMangaChapters(first.id, { languages: ['es'] }));
    expect(chapters.length).toBeGreaterThan(0);
    expect(chapters[0].publishAt).toMatch(/^\d{4}-/);
    const pages = await Provider.getChapterPages(chapters[0].id);
    expect(pages.data.length).toBeGreaterThan(0);
    const url = pages.data[0];
    expect(url.startsWith('https://')).toBe(true);
    const img = await fetchImageStatus(url, REFERER);
    expect(img.status).toBe(200);
    expect(img.type).toMatch(/image/);
    const cover = await fetchImageStatus(first.coverUrl, REFERER);
    expect(cover.status).toBe(200);
    // y sin Referer el CDN lo rechaza (por eso hace falta la regla en main.ts)
    const bare = await fetchImageStatus(url);
    expect(bare.status).toBe(403);
  }, 90000);

  it('una serie larga trae todos sus capítulos de una vez (>300)', async () => {
    const [lookism] = await Provider.searchManga('apari3ncias');
    expect(lookism).toBeTruthy();
    const chapters = await Provider.getMangaChapters(lookism.id);
    expect(chapters.length).toBeGreaterThan(300);
    expect(new Set(chapters.map((c) => c.id)).size).toBe(chapters.length);
  }, 90000);
});
