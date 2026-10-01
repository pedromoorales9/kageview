import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Fixtures REALES (recortados) de olympusxyz.com / panel.olympusxyz.com
const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures/olympus', name), 'utf8'));

const calls: Array<{ url: string; params?: Record<string, unknown> }> = [];
let responder: (url: string, params?: Record<string, any>) => any = () => ({ data: {} });

vi.mock('../../httpProxy', () => ({
  proxyGet: vi.fn(async (url: string, cfg: { params?: Record<string, any> } = {}) => {
    calls.push({ url, params: cfg.params });
    return responder(url, cfg.params);
  }),
  proxyPost: vi.fn(),
  proxyHead: vi.fn(),
}));

import { OlympusProvider as P, resetOlympusCache } from '../providers/olympus';
import { normalizeChapters } from '../chapters';

beforeEach(() => {
  calls.length = 0;
  resetOlympusCache();
  responder = () => ({ data: {} });
});

describe('Olympus: listados', () => {
  it('el catálogo se parsea: slug como id, portada con espacios codificada, estado', async () => {
    responder = () => ({ data: fx('series_page1.json') });
    const list = await P.getPopularManga(2);
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ sourceId: 'olympus', title: 'Academia de la Ascensión', status: 'ongoing', isAdult: false });
    expect(list[0].id).toMatch(/^academia-de-la-ascension/);
    expect(list[0].coverUrl).toMatch(/^https:\/\/media\.imagesolymp\.xyz\//);
    expect(calls[0].url).toBe('https://olympusxyz.com/api/series');
    expect(calls[0].params).toMatchObject({ page: 2, type: 'comic' });
  });

  it('popular página 1 antepone los populares de la portada y no los repite', async () => {
    const home = fx('homepage.json');
    const cat = fx('series_page1.json');
    const popFirst = JSON.parse(home.data.popular_comics)[0];
    // el primer populares también está en el catálogo → no debe duplicarse
    cat.data.series.data[1] = { ...cat.data.series.data[1], id: popFirst.id, slug: popFirst.slug, name: popFirst.name };
    responder = (url) => ({ data: url.endsWith('/homepage') ? home : cat });
    const list = await P.getPopularManga(1);
    expect(list[0].id).toBe(popFirst.slug);
    expect(list.filter((m) => m.id === popFirst.slug)).toHaveLength(1);
    expect(list.length).toBeGreaterThanOrEqual(3);
  });

  it('popular página 1 sigue funcionando si la portada falla', async () => {
    responder = (url) => {
      if (url.endsWith('/homepage')) throw new Error('boom');
      return { data: fx('series_page1.json') };
    };
    expect(await P.getPopularManga(1)).toHaveLength(3);
  });

  it('recientes: usa new-chapters, página 2 y el último capítulo', async () => {
    responder = () => ({ data: fx('new_chapters.json') });
    const list = await P.getRecentlyUpdatedManga(2);
    expect(calls[0].url).toBe('https://olympusxyz.com/api/new-chapters');
    expect(calls[0].params).toMatchObject({ page: 2 });
    expect(list).toHaveLength(3);
    expect(list[0].lastChapter).toMatch(/^\d+/);
  });

  it('respuestas vacías o rotas no explotan (listas vacías) o lanzan error claro', async () => {
    responder = () => ({ data: { data: { series: { data: [] } } } });
    expect(await P.getPopularManga(3)).toEqual([]);
    responder = () => ({ data: { data: [] } });
    expect(await P.getRecentlyUpdatedManga(1)).toEqual([]);
    responder = () => ({ data: { error: true, statusCode: 404 } });
    await expect(P.getRecentlyUpdatedManga(1)).rejects.toThrow(/inválida/);
    responder = () => ({ data: 'esto no es json' });
    await expect(P.getRecentlyUpdatedManga(1)).rejects.toThrow(/JSON/);
  });
});

describe('Olympus: búsqueda', () => {
  const list = () => ({ data: fx('series_list.json') });

  it('busca sin acentos ni mayúsculas, ordena por relevancia y excluye novelas', async () => {
    responder = list;
    const hits = await P.searchManga('JEFE');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((m) => m.title.toLowerCase().includes('jefe'))).toBe(true);
    expect(hits.some((m) => m.title.includes('Novela'))).toBe(false);
    expect(calls[0].url).toBe('https://olympusxyz.com/api/series/list');
    // acentos: "ascension" encuentra "Ascensión"
    const acc = await P.searchManga('ascension');
    expect(acc.map((m) => m.title)).toContain('Academia de la Ascensión');
  });

  it('descarga la lista una sola vez y pagina localmente', async () => {
    const big = { data: Array.from({ length: 40 }, (_, i) => ({ id: i + 1, name: `Dragón ${i}`, slug: `dragon-${i}`, cover: 'https://media.imagesolymp.xyz/a.webp', type: 'comic' })) };
    responder = () => ({ data: big });
    const p1 = await P.searchManga('dragon', 1);
    const p2 = await P.searchManga('dragon', 2);
    const p3 = await P.searchManga('dragon', 3);
    expect(p1).toHaveLength(15);
    expect(p2).toHaveLength(15);
    expect(p3).toHaveLength(10);
    expect(p2.some((m) => p1.some((x) => x.id === m.id))).toBe(false);
    expect(calls.filter((c) => c.url.endsWith('/series/list'))).toHaveLength(1);
  });

  it('consulta vacía = sin resultados y sin pedir nada; un fallo de red no se cachea', async () => {
    expect(await P.searchManga('   ')).toEqual([]);
    expect(calls).toHaveLength(0);
    responder = () => {
      throw new Error('red caída');
    };
    await expect(P.searchManga('x')).rejects.toThrow('red caída');
    responder = list;
    expect((await P.searchManga('jefe')).length).toBeGreaterThan(0);
  });
});

describe('Olympus: capítulos y páginas', () => {
  it('serie corta: ids {slug}/{id}, decimales y fechas ISO; normalizeChapters los ordena', async () => {
    responder = () => ({ data: fx('chapters_short.json') });
    const chs = await P.getMangaChapters('guerra-de-extincion');
    expect(calls[0].url).toBe('https://panel.olympusxyz.com/api/series/guerra-de-extincion/chapters');
    expect(chs.length).toBeGreaterThan(5);
    expect(chs[0].id).toMatch(/^guerra-de-extincion\/\d+$/);
    expect(chs.every((c) => c.translatedLanguage === 'es' && c.sourceId === 'olympus' && c.pages === 0)).toBe(true);
    expect(chs[0].publishAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const nums = chs.map((c) => c.chapter);
    expect(nums).toContain('7.1');
    const sorted = normalizeChapters(chs).map((c) => c.chapter);
    expect(sorted.indexOf('7')).toBeLessThan(sorted.indexOf('7.1'));
    expect(sorted.indexOf('7.1')).toBeLessThan(sorted.indexOf('8'));
  });

  it('pagina el panel hasta last_page (40 por página)', async () => {
    const mk = (page: number) => {
      const base = fx('chapters_long_p1.json');
      return { ...base, data: base.data.map((c: any, i: number) => ({ ...c, id: page * 1000 + i, name: String(page * 10 + i) })) };
    };
    responder = (_url, params) => ({ data: mk(Number(params?.page)) });
    const chs = await P.getMangaChapters('serie-larga'); // last_page = 3 en el fixture
    expect(calls.map((c) => c.params?.page).sort()).toEqual([1, 2, 3]);
    expect(chs).toHaveLength(12);
    expect(new Set(chs.map((c) => c.id)).size).toBe(12);
  });

  it('serie sin capítulos o respuesta sin datos → lista vacía; error del panel → Error', async () => {
    responder = () => ({ data: { data: [], meta: { last_page: 1 } } });
    expect(await P.getMangaChapters('vacia')).toEqual([]);
    responder = () => ({ data: { error: true } });
    await expect(P.getMangaChapters('rota')).rejects.toThrow(/inválida/);
  });

  it('páginas: usa slug e id del capítulo y devuelve URLs https absolutas', async () => {
    responder = () => ({ data: fx('capitulo.json') });
    const pages = await P.getChapterPages('yo-soy-el-jefe-final/86358');
    expect(calls[0].url).toBe('https://olympusxyz.com/api/capitulo/yo-soy-el-jefe-final/86358');
    expect(calls[0].params).toMatchObject({ type: 'comic' });
    expect(pages.baseUrl).toBe('');
    expect(pages.dataSaver).toEqual([]);
    expect(pages.data).toHaveLength(4);
    expect(pages.data.every((u) => u.startsWith('https://media.imagesolymp.xyz/'))).toBe(true);
  });

  it('páginas: id mal formado o respuesta sin páginas → Error claro', async () => {
    await expect(P.getChapterPages('12345')).rejects.toThrow(/no válido/);
    responder = () => ({ data: { chapter: { id: 1 } } });
    await expect(P.getChapterPages('a/1')).rejects.toThrow(/páginas/);
  });
});

describe('Olympus: géneros y browse', () => {
  it('getGenres devuelve ids como texto, nombres limpios y ordenados', async () => {
    responder = () => ({ data: fx('genres.json') });
    const g = await P.getGenres!();
    expect(g.length).toBe(5);
    expect(g.every((x) => /^\d+$/.test(x.id) && x.name === x.name.trim())).toBe(true);
    expect(g.map((x) => x.name)).toEqual([...g.map((x) => x.name)].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('browse con género filtra el catálogo; sin género delega según el orden', async () => {
    responder = (url) => ({ data: url.endsWith('/new-chapters') ? fx('new_chapters.json') : fx('series_page1.json') });
    await P.browse!({ genre: '7', sort: 'popular', page: 2 });
    expect(calls[0].params).toMatchObject({ genres: '7', page: 2 });
    calls.length = 0;
    await P.browse!({ sort: 'recent', page: 1 });
    expect(calls[0].url).toMatch(/new-chapters$/);
    calls.length = 0;
    await P.browse!({ sort: 'az', page: 3 });
    expect(calls[0].params).toMatchObject({ page: 3, direction: 'asc' });
  });
});
