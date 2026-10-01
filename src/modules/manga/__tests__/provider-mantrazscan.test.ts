import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';

// Fixtures REALES (recortados) de mantrazscan.co: directorio, búsqueda, portada, ficha y lector.
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', 'mantrazscan', name), 'utf8');

type Call = { url: string; params?: Record<string, string | number | string[]> };
const calls: Call[] = [];
let responder: (url: string, params?: Call['params']) => { data: unknown } | Promise<{ data: unknown }>;

vi.mock('../../httpProxy', () => ({
  proxyGet: vi.fn(async (url: string, cfg?: { params?: Call['params'] }) => {
    calls.push({ url, params: cfg?.params });
    return responder(url, cfg?.params);
  }),
  proxyPost: vi.fn(),
  proxyHead: vi.fn(),
}));

(globalThis as any).DOMParser = class {
  parseFromString(html: string) {
    return parseHTML(html).document;
  }
};

import { MantrazScanProvider as P } from '../providers/mantrazscan';
import { normalizeChapters } from '../chapters';

beforeEach(() => {
  calls.length = 0;
  responder = () => ({ data: '' });
});

describe('MantrazScan: listados', () => {
  it('recientes: lee las tarjetas del directorio (título, portada, último capítulo, insignias)', async () => {
    responder = () => ({ data: fx('explorar.html') });
    const list = await P.getRecentlyUpdatedManga(1);
    expect(list).toHaveLength(4);
    expect(list[0]).toMatchObject({
      id: 'amor-de-la-ciencia-espacial',
      sourceId: 'mantrazscan',
      title: 'Amor de la ciencia espacial',
      lastChapter: '48',
      isAdult: false,
      tags: ['bl'],
    });
    expect(list[0].coverUrl).toMatch(/^https:\/\/img\.mantrazscan\.co\/img\/images\//);
    expect(new Set(list.map((m) => m.id)).size).toBe(4);
    // la página 1 se pide con un parámetro para esquivar la copia en caché
    expect(calls[0].url).toBe('https://mantrazscan.co/explorar/');
    expect(calls[0].params).toMatchObject({ p: '1' });
  });

  it('paginación: la página N usa /explorar/page/N/', async () => {
    responder = () => ({ data: fx('explorar.html') });
    await P.getRecentlyUpdatedManga(3);
    expect(calls[0].url).toBe('https://mantrazscan.co/explorar/page/3/');
  });

  it('una página fuera de rango (404) devuelve lista vacía; otros fallos lanzan Error', async () => {
    responder = () => {
      throw Object.assign(new Error('Request failed with status 404'), { status: 404 });
    };
    expect(await P.getRecentlyUpdatedManga(999)).toEqual([]);
    await expect(P.getRecentlyUpdatedManga(1)).rejects.toThrow();
    responder = () => {
      throw Object.assign(new Error('Request failed with status 503'), { status: 503 });
    };
    await expect(P.getRecentlyUpdatedManga(2)).rejects.toThrow('503');
  });

  it('respuesta vacía o rota → []', async () => {
    responder = () => ({ data: '' });
    expect(await P.getRecentlyUpdatedManga(1)).toEqual([]);
    responder = () => ({ data: '<html><body><p>Mantenimiento</p></body></html>' });
    expect(await P.getRecentlyUpdatedManga(1)).toEqual([]);
    responder = () => ({ data: { not: 'html' } });
    expect(await P.getRecentlyUpdatedManga(1)).toEqual([]);
  });

  it('búsqueda: pasa ?q= y marca +18 por la insignia "adult"', async () => {
    responder = () => ({ data: fx('search.html') });
    const res = await P.searchManga('  solo ', 2);
    expect(calls[0].url).toBe('https://mantrazscan.co/explorar/page/2/');
    expect(calls[0].params).toMatchObject({ q: 'solo' });
    expect(res.map((m) => m.title)).toEqual([
      'Conquistando la Academia con solo un Cuchillo de Sashimi',
      'Mi Invocación es de Clase EX',
      'Nunca seremos solo amigos',
    ]);
    expect(res.map((m) => m.isAdult)).toEqual([false, false, true]);
  });

  it('búsqueda vacía no hace ninguna petición', async () => {
    expect(await P.searchManga('   ')).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('populares: top "Más vistos hoy" de la portada, una sola página', async () => {
    responder = () => ({ data: fx('home.html') });
    const top = await P.getPopularManga(1);
    expect(top).toHaveLength(3);
    expect(top[0]).toMatchObject({
      id: 'el-numero-uno-bajo-el-cielo-del-clan-marcial-de-tercera-clase',
      title: 'El Número Uno Bajo el Cielo del Clan Marcial de Tercera Clase',
      lastChapter: '28',
    });
    expect(top[0].coverUrl).toMatch(/^https:\/\//);
    expect(await P.getPopularManga(2)).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

describe('MantrazScan: géneros y browse', () => {
  it('getGenres lee los filtros (sin "Todos" ni slugs mal codificados) y los cachea', async () => {
    responder = () => ({ data: fx('explorar.html') });
    const g = await P.getGenres!();
    expect(g.map((x) => x.id)).toEqual(['romance', 'drama', '18', 'boys-love', '18-sin-censura', 'romance-de-oficina', 'romance-quien-sabe']);
    expect(g[0]).toEqual({ id: 'romance', name: 'Romance' });
    await P.getGenres!();
    expect(calls).toHaveLength(1);
  });

  it('browse con género filtra por ?genero= y pagina', async () => {
    responder = () => ({ data: fx('explorar.html') });
    const res = await P.browse!({ genre: 'romance', sort: 'popular', page: 2 });
    expect(res.length).toBeGreaterThan(0);
    expect(calls[0].url).toBe('https://mantrazscan.co/explorar/page/2/');
    expect(calls[0].params).toMatchObject({ genero: 'romance' });
  });

  it('browse sin género: popular = portada; el resto = recientes', async () => {
    responder = (url) => ({ data: url.endsWith('/explorar/') ? fx('explorar.html') : fx('home.html') });
    expect((await P.browse!({ sort: 'popular', page: 1 }))[0].id).toContain('el-numero-uno');
    expect((await P.browse!({ sort: 'recent', page: 1 }))[0].id).toBe('amor-de-la-ciencia-espacial');
  });
});

describe('MantrazScan: capítulos', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lee todas las filas (también las ocultas), con decimales y ids "{slug}/{capítulo}"', async () => {
    responder = () => ({ data: fx('manga.html') });
    const chs = await P.getMangaChapters('nigromante-yo-soy-la-plaga');
    expect(calls[0].url).toBe('https://mantrazscan.co/manga/nigromante-yo-soy-la-plaga/');
    expect(chs).toHaveLength(7);
    expect(chs.every((c) => c.translatedLanguage === 'es' && c.sourceId === 'mantrazscan' && c.pages === 0)).toBe(true);
    const half = chs.find((c) => c.chapter === '127.5')!;
    expect(half.id).toBe('nigromante-yo-soy-la-plaga/capitulo-127.5');
    expect(chs.find((c) => c.chapter === '92.5')!.id).toBe('nigromante-yo-soy-la-plaga/capitulo-92.5');
    // "hace 6 meses" → fecha aproximada (~180 días antes)
    const days = (Date.parse('2026-09-30T12:00:00Z') - Date.parse(half.publishAt)) / 86400_000;
    expect(days).toBeGreaterThan(170);
    expect(days).toBeLessThan(190);
  });

  it('normalizeChapters las deja en orden ascendente con los decimales en su sitio', async () => {
    responder = () => ({ data: fx('manga.html') });
    const chs = normalizeChapters(await P.getMangaChapters('nigromante-yo-soy-la-plaga'));
    expect(chs.map((c) => c.chapter)).toEqual(['1', '92', '92.5', '93', '126', '127', '127.5']);
  });

  it('ficha vacía → []', async () => {
    responder = () => ({ data: '<html><body></body></html>' });
    expect(await P.getMangaChapters('x')).toEqual([]);
  });
});

describe('MantrazScan: páginas del capítulo', () => {
  it('devuelve solo las imágenes de página, absolutas y sin duplicados', async () => {
    responder = () => ({ data: fx('chapter.html') });
    const pages = await P.getChapterPages('abuelo-guerrero-y-nieta-suprema/capitulo-111');
    expect(calls[0].url).toBe('https://mantrazscan.co/manga/abuelo-guerrero-y-nieta-suprema/capitulo-111/');
    expect(pages.baseUrl).toBe('');
    expect(pages.dataSaver).toEqual([]);
    expect(pages.data).toHaveLength(4); // el logo y el avatar no cuentan; la repetida tampoco
    expect(pages.data.every((u) => /^https:\/\/img\.mantrazscan\.co\/img\/WP-manga\/data\//.test(u))).toBe(true);
    expect(pages.data[0]).toMatch(/\/capitulo-111\/1\.webp$/);
  });

  it('capítulo sin imágenes → data vacío', async () => {
    responder = () => ({ data: '<html><body><p>nada</p></body></html>' });
    expect((await P.getChapterPages('a/capitulo-1')).data).toEqual([]);
  });
});

describe('MantrazScan: contrato', () => {
  it('id válido, nombre y tamaño de página', () => {
    expect(P.id).toMatch(/^[a-z0-9_-]{2,30}$/);
    expect(P.name).toBe('Mantraz Scan');
    expect(P.pageSize).toBe(15);
  });
});
