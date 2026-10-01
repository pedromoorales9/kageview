// Prueba EN VIVO de Olympus Scanlation. Solo con LIVE=1:
//   LIVE=1 npx vitest run src/modules/manga/__tests__/provider-olympus.live.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../httpProxy', async () => {
  const h = await import('./liveHarness');
  return { proxyGet: h.liveProxyGet, proxyPost: h.liveProxyPost, proxyHead: vi.fn() };
});

import { installDom, fetchImageStatus } from './liveHarness';
installDom();

import { OlympusProvider as Provider } from '../providers/olympus';
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
      expect(m.coverUrl).toMatch(/^https:\/\//);
    }
    const recent = await Provider.getRecentlyUpdatedManga(1);
    expect(recent.length).toBeGreaterThan(0);
    const hit = await Provider.searchManga(popular[0].title.split(' ')[0]);
    expect(hit.length).toBeGreaterThan(0);
  }, 60000);

  it('paginación: la página 2 no repite la 1 (recientes y catálogo)', async () => {
    const r1 = await Provider.getRecentlyUpdatedManga(1);
    const r2 = await Provider.getRecentlyUpdatedManga(2);
    expect(r2.length).toBeGreaterThan(0);
    // el orden "recientes" cambia en vivo (una publicación entre peticiones desplaza 1-2 series)
    expect(r2.filter((m) => r1.some((x) => x.id === m.id)).length).toBeLessThan(3);
    const c2 = await Provider.getPopularManga(2);
    const c3 = await Provider.getPopularManga(3);
    expect(c3.length).toBeGreaterThan(0);
    expect(c3.some((m) => c2.some((x) => x.id === m.id))).toBe(false);
  }, 60000);

  it('géneros y navegación por género', async () => {
    const genres = await Provider.getGenres!();
    expect(genres.length).toBeGreaterThan(10);
    const accion = genres.find((g) => /acci/i.test(g.name))!;
    const list = await Provider.browse!({ genre: accion.id, sort: 'az', page: 1 });
    expect(list.length).toBeGreaterThan(0);
  }, 60000);

  it('capítulos → páginas → la primera imagen se descarga de verdad', async () => {
    const [first] = await Provider.getRecentlyUpdatedManga(1);
    const chapters = normalizeChapters(await Provider.getMangaChapters(first.id, { languages: ['es'] }));
    expect(chapters.length).toBeGreaterThan(0);
    const last = chapters[chapters.length - 1];
    expect(last.publishAt).toMatch(/^\d{4}-/);
    const pages = await Provider.getChapterPages(chapters[0].id);
    expect(pages.data.length).toBeGreaterThan(0);
    const url = pages.data[0].startsWith('http') ? pages.data[0] : pages.baseUrl + pages.data[0];
    expect(url.startsWith('https://')).toBe(true);
    const img = await fetchImageStatus(url); // no necesita Referer
    expect(img.status).toBe(200);
    expect(img.type).toMatch(/image/);
    // la portada también
    const cover = await fetchImageStatus(first.coverUrl);
    expect(cover.status).toBe(200);
  }, 90000);

  it('una serie con muchos capítulos los pagina todos (>40)', async () => {
    const hits = await Provider.searchManga('Nueva cara');
    const big = hits[0];
    const chapters = await Provider.getMangaChapters(big.id);
    expect(chapters.length).toBeGreaterThan(40);
    expect(new Set(chapters.map((c) => c.id)).size).toBe(chapters.length);
  }, 90000);
});
