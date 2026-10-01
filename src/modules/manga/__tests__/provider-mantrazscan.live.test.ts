// Prueba EN VIVO de Mantraz Scan (solo con LIVE=1):
//   LIVE=1 npx vitest run src/modules/manga/__tests__/provider-mantrazscan.live.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../httpProxy', async () => {
  const h = await import('./liveHarness');
  return { proxyGet: h.liveProxyGet, proxyPost: h.liveProxyPost, proxyHead: vi.fn() };
});

import { installDom, fetchImageStatus } from './liveHarness';
installDom();

import { MantrazScanProvider as Provider } from '../providers/mantrazscan';
import { normalizeChapters } from '../chapters';

const live = process.env.LIVE ? describe : describe.skip;

live(`${Provider.name} (en vivo)`, () => {
  it('popular, recientes y búsqueda devuelven mangas con título, id y portada', async () => {
    const popular = await Provider.getPopularManga(1);
    expect(popular.length).toBeGreaterThanOrEqual(5);
    expect(await Provider.getPopularManga(2)).toEqual([]);
    const recent = await Provider.getRecentlyUpdatedManga(1);
    expect(recent.length).toBe(Provider.pageSize);
    for (const m of [...popular.slice(0, 5), ...recent.slice(0, 5)]) {
      expect(m.id).toBeTruthy();
      expect(m.sourceId).toBe(Provider.id);
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.coverUrl).toMatch(/^https:\/\//);
    }
    const hit = await Provider.searchManga('solo');
    expect(hit.length).toBeGreaterThan(0);
    expect(await Provider.searchManga('zzzxqqqzz')).toEqual([]);
  }, 90000);

  it('paginación: la página 2 no repite la 1 (recientes y búsqueda)', async () => {
    const p1 = await Provider.getRecentlyUpdatedManga(1);
    const p2 = await Provider.getRecentlyUpdatedManga(2);
    expect(p2.length).toBeGreaterThan(0);
    expect(p2.some((m) => p1.some((x) => x.id === m.id))).toBe(false);

    const s1 = await Provider.searchManga('solo', 1);
    const s2 = await Provider.searchManga('solo', 2);
    expect(s2.length).toBeGreaterThan(0);
    expect(s2.some((m) => s1.some((x) => x.id === m.id))).toBe(false);
  }, 90000);

  it('géneros y filtro por género', async () => {
    const genres = await Provider.getGenres!();
    expect(genres.length).toBeGreaterThan(10);
    expect(genres.some((g) => g.id === 'romance')).toBe(true);
    const res = await Provider.browse!({ genre: 'romance', sort: 'recent', page: 1 });
    expect(res.length).toBeGreaterThan(0);
  }, 90000);

  it('capítulos (con fechas y decimales) → páginas → la primera imagen se descarga', async () => {
    const [first] = await Provider.getPopularManga(1);
    const chapters = normalizeChapters(await Provider.getMangaChapters(first.id, { languages: ['es'] }));
    expect(chapters.length).toBeGreaterThan(5);
    expect(chapters[0].chapter).toBeTruthy();
    expect(chapters.every((c) => c.id.startsWith(`${first.id}/`))).toBe(true);
    // El último capítulo es reciente
    expect(Date.now() - Date.parse(chapters[chapters.length - 1].publishAt)).toBeLessThan(120 * 86400_000);

    const pages = await Provider.getChapterPages(chapters[0].id);
    expect(pages.data.length).toBeGreaterThan(0);
    const img = await fetchImageStatus(pages.data[0]); // sin Referer
    expect(img.status).toBe(200);
    expect(img.type).toMatch(/image/);
    expect(img.bytes).toBeGreaterThan(1000);

    const cover = await fetchImageStatus(first.coverUrl);
    expect(cover.status).toBe(200);
    expect(cover.type).toMatch(/image/);
  }, 90000);
});
