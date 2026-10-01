// Prueba EN VIVO de BarManga (solo con LIVE=1):
//   LIVE=1 npx vitest run src/modules/manga/__tests__/provider-barmanga.live.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../httpProxy', async () => {
  const h = await import('./liveHarness');
  return { proxyGet: h.liveProxyGet, proxyPost: h.liveProxyPost, proxyHead: vi.fn() };
});

import { installDom, fetchImageStatus } from './liveHarness';
installDom();

import { BarMangaProvider as Provider } from '../providers/barmanga';
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
    // Hay actividad reciente: algún capítulo publicado en los últimos 60 días
    const first = normalizeChapters(await Provider.getMangaChapters(recent[0].id));
    const newest = Date.parse(first[first.length - 1].publishAt);
    expect(Date.now() - newest).toBeLessThan(60 * 86400_000);

    const hit = await Provider.searchManga('solo');
    expect(hit.length).toBeGreaterThan(0);
    expect(hit[0].title.length).toBeGreaterThan(0);
  }, 90000);

  it('paginación: la página 2 no repite la 1 (listado y búsqueda)', async () => {
    const p1 = await Provider.getPopularManga(1);
    const p2 = await Provider.getPopularManga(2);
    expect(p2.length).toBeGreaterThan(0);
    expect(p2.some((m) => p1.some((x) => x.id === m.id))).toBe(false);

    const s1 = await Provider.searchManga('solo', 1);
    const s2 = await Provider.searchManga('solo', 2);
    expect(s2.length).toBeGreaterThan(0);
    expect(s2.some((m) => s1.some((x) => x.id === m.id))).toBe(false);
    expect(await Provider.searchManga('solo', 500)).toEqual([]);
  }, 90000);

  it('géneros y filtro por género', async () => {
    const genres = await Provider.getGenres!();
    expect(genres.length).toBeGreaterThan(10);
    const accion = genres.find((g) => g.id === 'accion');
    expect(accion).toBeTruthy();
    const res = await Provider.browse!({ genre: 'accion', sort: 'recent', page: 1 });
    expect(res.length).toBeGreaterThan(0);
  }, 90000);

  it('capítulos → páginas → la primera imagen se descarga de verdad', async () => {
    const [first] = await Provider.getPopularManga(1);
    const chapters = normalizeChapters(await Provider.getMangaChapters(first.id, { languages: ['es'] }));
    expect(chapters.length).toBeGreaterThan(0);
    expect(chapters[0].chapter).toBeTruthy();
    const pages = await Provider.getChapterPages(chapters[0].id);
    expect(pages.data.length).toBeGreaterThan(0);
    const url = pages.data[0].startsWith('http') ? pages.data[0] : pages.baseUrl + pages.data[0];
    const img = await fetchImageStatus(url); // no exige Referer
    expect(img.status).toBe(200);
    expect(img.type).toMatch(/image/);
    expect(img.bytes).toBeGreaterThan(1000);

    // La portada también se descarga
    const cover = await fetchImageStatus(first.coverUrl);
    expect(cover.status).toBe(200);
    expect(cover.type).toMatch(/image/);
  }, 90000);
});
