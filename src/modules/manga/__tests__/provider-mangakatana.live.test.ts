// Prueba EN VIVO de MangaKatana (solo con LIVE=1).
// Solo se ejecuta con LIVE=1 (contra la web real); en la suite normal se salta.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../httpProxy', async () => {
  const h = await import('./liveHarness');
  return { proxyGet: h.liveProxyGet, proxyPost: h.liveProxyPost, proxyHead: vi.fn() };
});

import { installDom, fetchImageStatus } from './liveHarness';
installDom();

import { MangaKatanaProvider as Provider } from '../providers/mangakatana';
import { normalizeChapters } from '../chapters';

const live = process.env.LIVE ? describe : describe.skip;

live(`${Provider.name} (en vivo)`, () => {
  it('popular, recientes y búsqueda devuelven mangas con título, id y portada', async () => {
    const popular = await Provider.getPopularManga(1);
    expect(popular.length).toBeGreaterThan(5);
    for (const m of popular.slice(0, 5)) {
      expect(m.id).toBeTruthy();
      expect(m.sourceId).toBe(Provider.id);
      expect(m.title.length).toBeGreaterThan(0);
    }
    expect((await Provider.getRecentlyUpdatedManga(1)).length).toBeGreaterThan(0);
    const hit = await Provider.searchManga(popular[0].title.split(' ')[0]);
    expect(hit.length).toBeGreaterThan(0);
  }, 60000);

  it('paginación: la página 2 no repite la 1', async () => {
    const p1 = await Provider.getPopularManga(1);
    const p2 = await Provider.getPopularManga(2);
    expect(p2.length).toBeGreaterThan(0);
    expect(p2.some((m) => p1.some((x) => x.id === m.id))).toBe(false);
  }, 60000);

  it('capítulos → páginas → la primera imagen se descarga de verdad', async () => {
    const [first] = await Provider.getPopularManga(1);
    const chapters = normalizeChapters(await Provider.getMangaChapters(first.id, { languages: ['en'] }));
    expect(chapters.length).toBeGreaterThan(0);
    const pages = await Provider.getChapterPages(chapters[0].id);
    expect(pages.data.length).toBeGreaterThan(0);
    const url = pages.data[0].startsWith('http') ? pages.data[0] : pages.baseUrl + pages.data[0];
    const img = await fetchImageStatus(url /* , 'https://sitio/' (el Referer que añadirás en main.ts) */);
    expect(img.status).toBe(200);
    // El CDN sirve las imágenes como application/octet-stream (el <img> las pinta igual)
    expect(img.type).toMatch(/image|octet-stream/);
    expect(img.bytes).toBeGreaterThan(5000);
  }, 90000);

  it('géneros, browse por género y orden, y recientes paginados', async () => {
    expect((await Provider.getGenres!()).length).toBeGreaterThan(10);
    const action = await Provider.browse!({ genre: 'action', sort: 'recent', page: 1 });
    expect(action.length).toBeGreaterThan(5);
    expect(action.some((m) => m.tags.includes('Action'))).toBe(true);
    const r1 = await Provider.getRecentlyUpdatedManga(1);
    const r2 = await Provider.getRecentlyUpdatedManga(2);
    expect(r1.length).toBe(Provider.pageSize);
    expect(r2.length).toBeGreaterThan(0);
  }, 60000);

  it('una búsqueda sin resultados devuelve lista vacía sin lanzar', async () => {
    expect(await Provider.searchManga('zzzzqqqxxkk')).toEqual([]);
  }, 60000);
});
