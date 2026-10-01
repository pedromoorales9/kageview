// Prueba EN VIVO de LeerCapitulo (solo con LIVE=1; en la suite normal se salta):
//   LIVE=1 npx vitest run src/modules/manga/__tests__/provider-leercapitulo.live.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../httpProxy', async () => {
  const h = await import('./liveHarness');
  return { proxyGet: h.liveProxyGet, proxyPost: h.liveProxyPost, proxyHead: vi.fn() };
});

import { installDom, fetchImageStatus } from './liveHarness';
installDom();

import { LeerCapituloProvider as Provider } from '../providers/leercapitulo';
import { normalizeChapters } from '../chapters';

const live = process.env.LIVE ? describe : describe.skip;

live(`${Provider.name} (en vivo)`, () => {
  it('popular, recientes y búsqueda devuelven mangas con título, id y portada', async () => {
    const popular = await Provider.getPopularManga(1);
    expect(popular.length).toBe(Provider.pageSize);
    for (const m of popular.slice(0, 5)) {
      expect(m.id).toMatch(/^[a-z0-9]+\/[^/]+$/);
      expect(m.sourceId).toBe(Provider.id);
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.coverUrl).toMatch(/^https:\/\/.+\/covers\//);
    }
    expect((await Provider.getRecentlyUpdatedManga(1)).length).toBeGreaterThan(0);
    const hit = await Provider.searchManga('naruto');
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.some((m) => /naruto/i.test(m.title))).toBe(true);
  }, 60000);

  it('paginación: la página 2 no repite la 1 y una página inexistente no repite resultados', async () => {
    const p1 = await Provider.getPopularManga(1);
    const p2 = await Provider.getPopularManga(2);
    expect(p2.length).toBeGreaterThan(0);
    expect(p2.some((m) => p1.some((x) => x.id === m.id))).toBe(false);
    // Fuera de rango la web redirige a la página 1: el proveedor debe devolver []
    expect(await Provider.getPopularManga(99999)).toEqual([]);
  }, 60000);

  it('géneros y browse por género', async () => {
    const genres = await Provider.getGenres!();
    expect(genres.length).toBeGreaterThan(20);
    const action = genres.find((g) => g.id === 'action');
    expect(action).toBeTruthy();
    const items = await Provider.browse!({ genre: 'action', sort: 'popular', page: 1 });
    expect(items.length).toBeGreaterThan(5);
  }, 60000);

  it('marca isAdult en los títulos +18 (busca uno del género hentai/adult)', async () => {
    const adult = await Provider.browse!({ genre: 'adult', sort: 'popular', page: 1 });
    expect(adult.length).toBeGreaterThan(0);
    // Si la lista de adultos llegó a tiempo, están marcados; tolera que no (timeout) pero no que falle
    const flagged = adult.filter((m) => m.isAdult).length;
    console.log(`isAdult: ${flagged}/${adult.length} marcados en genre=adult`);
    expect(flagged).toBeGreaterThan(0);
  }, 90000);

  it('capítulos → páginas → la primera imagen se descarga de verdad', async () => {
    const [first] = await Provider.getPopularManga(1);
    const chapters = normalizeChapters(await Provider.getMangaChapters(first.id, { languages: ['es'] }));
    expect(chapters.length).toBeGreaterThan(0);
    expect(chapters[0].translatedLanguage).toBe('es');
    expect(chapters[0].chapter).toMatch(/^\d+(\.\d+)?$/);
    expect(chapters[chapters.length - 1].publishAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const pages = await Provider.getChapterPages(chapters[chapters.length - 1].id);
    expect(pages.data.length).toBeGreaterThan(0);
    for (const u of pages.data) expect(u).toMatch(/^https:\/\//);
    const url = pages.data[0].startsWith('http') ? pages.data[0] : pages.baseUrl + pages.data[0];
    // El CDN no exige Referer: se prueba sin él
    const img = await fetchImageStatus(url);
    expect(img.status).toBe(200);
    expect(img.type).toMatch(/image/);
  }, 90000);
});
