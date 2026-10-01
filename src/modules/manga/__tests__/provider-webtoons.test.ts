import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Fixtures REALES (recortados) de webtoons.com/es y m.webtoons.com
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures/webtoons', name), 'utf8');
const fxJson = (name: string) => JSON.parse(fx(name));

const calls: Array<{ url: string; params?: Record<string, any>; headers?: Record<string, string> }> = [];
let responder: (url: string, params?: Record<string, any>) => any = () => ({ data: '' });

vi.mock('../../httpProxy', () => ({
  proxyGet: vi.fn(async (url: string, cfg: { params?: Record<string, any>; headers?: Record<string, string> } = {}) => {
    calls.push({ url, params: cfg.params, headers: cfg.headers });
    return responder(url, cfg.params);
  }),
  proxyPost: vi.fn(),
  proxyHead: vi.fn(),
}));

import { installDom } from './liveHarness';
installDom();

import { WebtoonsProvider as P, parseLikes, resetWebtoonsCache } from '../providers/webtoons';
import { normalizeChapters } from '../chapters';

beforeEach(() => {
  calls.length = 0;
  resetWebtoonsCache();
  responder = () => ({ data: '' });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('WEBTOON: utilidades', () => {
  it('parseLikes entiende "606,217", "1.1M" y basura', () => {
    expect(parseLikes('606,217')).toBe(606217);
    expect(parseLikes('1.1M')).toBe(1_100_000);
    expect(parseLikes('12K')).toBe(12_000);
    expect(parseLikes('')).toBe(0);
    expect(parseLikes('abc')).toBe(0);
    expect(parseLikes(undefined)).toBe(0);
  });
});

describe('WEBTOON: listados', () => {
  it('popular página 1: ranking oficial, con id = title_no, portada https y género', async () => {
    responder = () => ({ data: fx('ranking_popular.html') });
    const list = await P.getPopularManga(1);
    expect(calls[0].url).toBe('https://www.webtoons.com/es/ranking/popular');
    expect(calls[0].headers?.Referer).toBe('https://www.webtoons.com/');
    expect(list).toHaveLength(4);
    expect(list[0]).toMatchObject({ sourceId: 'webtoons', isAdult: false, status: 'ongoing' });
    expect(list[0].id).toMatch(/^\d+$/);
    expect(list[0].title.length).toBeGreaterThan(2);
    expect(list[0].coverUrl).toMatch(/^https:\/\/webtoon-phinf\.pstatic\.net\//);
    expect(list[0].tags.length).toBe(1);
    expect(new Set(list.map((m) => m.id)).size).toBe(4);
  });

  it('popular página 2: catálogo (7 días + terminadas) por "me gusta", troceado y sin repetidos', async () => {
    responder = (url) => ({ data: fx(url.endsWith('/complete') ? 'originals_complete.html' : 'originals_thursday.html') });
    const p2 = await P.getPopularManga(2);
    // con tan pocos títulos en los fixtures, la página 2 (posiciones 31-60) queda vacía
    expect(p2).toEqual([]);
    // pidió los 8 listados una sola vez cada uno
    const paths = calls.map((c) => c.url.split('/originals/')[1]).sort();
    expect(paths).toEqual(['complete', 'friday', 'monday', 'saturday', 'sunday', 'thursday', 'tuesday', 'wednesday']);
    // browse 'rating' sin género usa el catálogo en memoria (no vuelve a pedir nada)
    calls.length = 0;
    const rated = await P.browse!({ sort: 'rating', page: 1 });
    expect(calls).toHaveLength(0);
    expect(rated.length).toBe(7); // 4 de jueves + 3 completas, los mismos días repiten los mismos
    const mapped = rated.map((m) => m.id);
    expect(new Set(mapped).size).toBe(mapped.length);
    expect(rated.some((m) => m.status === 'completed')).toBe(true);
    // ordenado por likes descendente (el primero del fixture de jueves tiene 606.217)
    const az = await P.browse!({ sort: 'az', page: 1 });
    expect(az.map((m) => m.title)).toEqual([...az.map((m) => m.title)].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('si el ranking falla, popular cae al catálogo', async () => {
    responder = (url) => {
      if (url.includes('/ranking/')) throw new Error('boom');
      return { data: fx('originals_thursday.html') };
    };
    const list = await P.getPopularManga(1);
    expect(list.length).toBeGreaterThan(0);
  });

  it('recientes: hoy = el día de la semana de hoy; páginas siguientes retroceden; >7 → vacío', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0)); // jueves 1 oct 2026
    responder = () => ({ data: fx('originals_thursday.html') });
    const today = await P.getRecentlyUpdatedManga(1);
    expect(calls[0].url).toBe('https://www.webtoons.com/es/originals/thursday');
    expect(calls[0].params).toMatchObject({ sortOrder: 'UPDATE' });
    expect(today.length).toBe(4);
    await P.getRecentlyUpdatedManga(2);
    expect(calls[1].url).toBe('https://www.webtoons.com/es/originals/wednesday');
    await P.getRecentlyUpdatedManga(5); // jueves-4 = domingo
    expect(calls[2].url).toBe('https://www.webtoons.com/es/originals/sunday');
    await P.getRecentlyUpdatedManga(6);
    expect(calls[3].url).toBe('https://www.webtoons.com/es/originals/saturday'); // cruza el domingo hacia atrás
    expect(await P.getRecentlyUpdatedManga(8)).toEqual([]);
    expect(calls).toHaveLength(4);
  });

  it('HTML vacío o roto → lista vacía; respuesta que no es HTML → error claro', async () => {
    responder = () => ({ data: '<html><body><p>mantenimiento</p></body></html>' });
    expect(await P.getPopularManga(1).catch(() => 'x')).not.toBe('x'); // ranking vacío cae al catálogo (vacío también)
    responder = () => ({ data: '<html></html>' });
    expect(await P.browse!({ genre: 'romance', sort: 'popular', page: 1 })).toEqual([]);
    responder = () => ({ data: { raro: true } });
    await expect(P.browse!({ genre: 'romance', sort: 'popular', page: 1 })).rejects.toThrow(/inesperada/);
  });
});

describe('WEBTOON: búsqueda', () => {
  it('descarta entradas de autores, convierte miniaturas relativas y pagina con start', async () => {
    responder = () => ({ data: fxJson('search_amor.json') });
    const hits = await P.searchManga('amor', 2);
    expect(calls[0].url).toBe('https://www.webtoons.com/es/search/immediate');
    expect(calls[0].params).toMatchObject({ keyword: 'amor', start: 31, display: 30 });
    expect(hits).toHaveLength(3); // la 4ª es de tipo AUTHOR
    expect(hits[0]).toMatchObject({ sourceId: 'webtoons', status: 'ongoing' });
    expect(hits[0].id).toMatch(/^\d+$/);
    expect(hits[0].coverUrl).toMatch(/^https:\/\/swebtoon-phinf\.pstatic\.net\//);
  });

  it('consulta vacía no hace peticiones; resultado vacío y success=false', async () => {
    expect(await P.searchManga('  ')).toEqual([]);
    expect(calls).toHaveLength(0);
    responder = () => ({ data: { result: { searchedList: [] }, success: true } });
    expect(await P.searchManga('zzzz')).toEqual([]);
    responder = () => ({ data: { result: null, success: false } });
    await expect(P.searchManga('x')).rejects.toThrow(/buscador/);
  });
});

describe('WEBTOON: géneros', () => {
  it('getGenres y browse con género (orden y troceo en cliente)', async () => {
    const g = await P.getGenres!();
    expect(g.length).toBe(16);
    expect(g.find((x) => x.id === 'romance')?.name).toBe('Romance');
    responder = () => ({ data: fx('genre_romance.html') });
    const r = await P.browse!({ genre: 'romance', sort: 'recent', page: 1 });
    expect(calls[0].url).toBe('https://www.webtoons.com/es/genres/romance');
    expect(calls[0].params).toMatchObject({ sortOrder: 'UPDATE' });
    expect(r.length).toBe(4);
    expect(await P.browse!({ genre: 'romance', sort: 'popular', page: 2 })).toEqual([]);
    await expect(P.browse!({ genre: 'no-existe', sort: 'popular', page: 1 })).rejects.toThrow(/desconocido/);
  });
});

describe('WEBTOON: capítulos y páginas', () => {
  it('capítulos: id = ruta del lector, número = episodeNo, fecha ISO, sin título genérico', async () => {
    responder = () => ({ data: fxJson('episodes_lookism.json') });
    const chs = await P.getMangaChapters('1930');
    expect(calls[0].url).toBe('https://m.webtoons.com/api/v1/webtoon/1930/episodes');
    expect(calls[0].params).toMatchObject({ pageSize: 500 });
    expect(chs).toHaveLength(6);
    expect(chs[0]).toMatchObject({
      sourceId: 'webtoons',
      chapter: '1',
      title: null, // "EP 1" es genérico
      translatedLanguage: 'es',
      pages: 0,
    });
    expect(chs[0].id).toBe('/es/drama/lookism/ep-1/viewer?title_no=1930&episode_no=1');
    expect(chs[0].publishAt).toMatch(/^2020-03-0\dT/);
    const norm = normalizeChapters([...chs].reverse());
    expect(norm.map((c) => c.chapter)).toEqual(chs.map((c) => c.chapter));
  });

  it('capítulos: sigue el cursor hasta que acaba y no entra en bucle', async () => {
    const mk = (n: number[], next: number) => ({
      success: true,
      result: { nextCursor: next, episodeList: n.map((no) => ({ episodeNo: no, episodeTitle: `Final ${no}`, viewerLink: `/es/x/y/ep-${no}/viewer?title_no=1&episode_no=${no}`, exposureDateMillis: 1583283629000 })) },
    });
    responder = (_u, params) => ({ data: params?.cursor ? mk([3, 4], 0) : mk([1, 2], 2) });
    const chs = await P.getMangaChapters('1');
    expect(chs.map((c) => c.chapter)).toEqual(['1', '2', '3', '4']);
    expect(chs[0].title).toBe('Final 1'); // título no genérico se conserva
    expect(calls).toHaveLength(2);
    // un cursor que no avanza no provoca bucle infinito
    calls.length = 0;
    responder = () => ({ data: mk([1], 5) });
    await P.getMangaChapters('1');
    expect(calls.length).toBeLessThanOrEqual(2);
  });

  it('capítulos: id inválido, success=false o respuesta rota → Error', async () => {
    await expect(P.getMangaChapters('no-es-numero')).rejects.toThrow(/no válido/);
    responder = () => ({ data: { result: null, message: null, success: false } });
    await expect(P.getMangaChapters('999')).rejects.toThrow(/capítulos/);
    responder = () => ({ data: '<html>error</html>' });
    await expect(P.getMangaChapters('999')).rejects.toThrow(/JSON/);
  });

  it('páginas: toma img._images[data-url], omite el aviso inicial y mantiene el orden', async () => {
    responder = () => ({ data: fx('viewer_lookism.html') });
    const pages = await P.getChapterPages('/es/drama/lookism/ep-595/viewer?title_no=1930&episode_no=595');
    expect(calls[0].url).toBe('https://www.webtoons.com/es/drama/lookism/ep-595/viewer?title_no=1930&episode_no=595');
    expect(pages.baseUrl).toBe('');
    expect(pages.dataSaver).toEqual([]);
    expect(pages.data).toHaveLength(4); // 5 en el HTML, menos el aviso de edad
    expect(pages.data.every((u) => u.startsWith('https://webtoon-phinf.pstatic.net/'))).toBe(true);
    expect(pages.data.some((u) => /warning/.test(u))).toBe(false);
    expect(pages.data[0]).toMatch(/EP595_0001/);
    expect(pages.data[3]).toMatch(/EP595_0004/);
  });

  it('páginas: id mal formado o capítulo sin imágenes → Error claro', async () => {
    await expect(P.getChapterPages('https://evil.example/x')).rejects.toThrow(/no válido/);
    await expect(P.getChapterPages('1930')).rejects.toThrow(/no válido/);
    responder = () => ({ data: '<html><body>Inicia sesión</body></html>' });
    await expect(P.getChapterPages('/es/a/b/ep-1/viewer?title_no=1&episode_no=1')).rejects.toThrow(/imágenes/);
  });
});
