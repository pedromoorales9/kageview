import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';

// Fixtures REALES (recortados) de https://www.leercapitulo.co
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures/leercapitulo', name), 'utf-8');

interface Call {
  url: string;
  params: Record<string, string>;
}
const calls: Call[] = [];
let router: (c: Call) => string | Error = () => '';

vi.mock('../../httpProxy', () => ({
  proxyGet: vi.fn(async (url: string, cfg: { params?: Record<string, string> } = {}) => {
    const call = { url, params: { ...(cfg.params ?? {}) } };
    calls.push(call);
    const out = router(call);
    if (out instanceof Error) throw out;
    return { status: 200, data: out, headers: {} };
  }),
  proxyPost: vi.fn(),
  proxyHead: vi.fn(),
}));

// DOMParser real, como en el renderizador
(globalThis as any).DOMParser = class {
  parseFromString(html: string) {
    return parseHTML(html).document;
  }
};

import { normalizeChapters } from '../chapters';
import type { MangaProvider } from '../types';

/** Servidor de mentira: directorio (listados/búsqueda/géneros +18/filtros), ficha y lector. */
const defaultRouter = (c: Call): string => {
  if (c.url.endsWith('/manga/')) {
    if (c.params.genre) return fx('genre-adult.html'); // el paginador anuncia 10 páginas; solo existe la 1
    if (c.params.q) return fx('search-naruto.html');
    if (!c.params.sort && !c.params.page) return fx('directory-filters.html');
    return fx('popular-p2.html'); // su paginador marca la página 2 como activa
  }
  if (c.url.includes('/manga/5ks2r35xze/naruto/')) return fx('manga-detail.html');
  if (c.url.includes('/leer/')) return fx('chapter-reader.html');
  return '';
};

let P: MangaProvider;

beforeEach(async () => {
  calls.length = 0;
  router = defaultRouter;
  // Módulo nuevo en cada test: la caché de ids +18 y la de géneros son de módulo
  vi.resetModules();
  P = (await import('../providers/leercapitulo')).LeerCapituloProvider;
});

describe('LeerCapitulo: identidad', () => {
  it('id válido, nombre y tamaño de página', () => {
    expect(P.id).toMatch(/^[a-z0-9_-]{2,30}$/);
    expect(P.name).toBe('LeerCapitulo');
    expect(P.pageSize).toBe(30);
  });
});

describe('LeerCapitulo: listados', () => {
  it('parsea las tarjetas: id, título, portada absoluta https, estado, tipo y último capítulo', async () => {
    const items = await P.getPopularManga(2);
    expect(items).toHaveLength(5);
    const first = items[0];
    expect(first).toMatchObject({
      id: 'lk84jy4imk/black-clover',
      sourceId: 'leercapitulo',
      title: 'Black Clover',
      status: 'completed',
      tags: ['Manga'],
      lastChapter: '393',
    });
    expect(first.coverUrl).toBe('https://www.leercapitulo.co/covers/78/06a40e7dd3005160f76e918f5452e4.jpg?v1789655554701');
    for (const m of items) {
      expect(m.coverUrl.startsWith('https://')).toBe(true);
      expect(m.id).toMatch(/^[a-z0-9]+\/[^/]+$/);
    }
  });

  it('popular y recientes piden el orden correcto; la página 1 no manda `page`', async () => {
    router = (c) => (c.url.endsWith('/manga/') && c.params.genre ? fx('genre-adult.html') : fx('popular-p2.html'));
    await P.getPopularManga(2);
    await P.getRecentlyUpdatedManga(2);
    const listing = calls.filter((c) => !c.params.genre);
    expect(listing[0].params).toEqual({ sort: 'popular', page: '2' });
    expect(listing[1].params).toEqual({ sort: 'latest', page: '2' });
  });

  it('una página que la web redirige a la 1 (fuera de rango) devuelve [] en vez de repetir resultados', async () => {
    // pedimos la 7 pero el paginador dice que la activa es la 2
    expect(await P.getPopularManga(7)).toEqual([]);
  });

  it('búsqueda: manda `q` y rechaza consultas vacías sin hacer peticiones', async () => {
    expect(await P.searchManga('   ')).toEqual([]);
    expect(calls).toHaveLength(0);
    const res = await P.searchManga(' naruto ');
    expect(res.length).toBeGreaterThan(0);
    expect(calls.find((c) => c.params.q)?.params.q).toBe('naruto');
    expect(res.some((m) => /naruto/i.test(m.title))).toBe(true);
  });

  it('browse: género y orden (recent → latest, rating → popular)', async () => {
    await P.browse!({ genre: 'comedy', sort: 'recent', page: 1 });
    await P.browse!({ sort: 'rating', page: 1 });
    const q = calls.filter((c) => c.params.genre === 'comedy' || (c.params.sort === 'popular' && !c.params.genre));
    expect(q.some((c) => c.params.genre === 'comedy' && c.params.sort === 'latest')).toBe(true);
    expect(q.some((c) => !c.params.genre && c.params.sort === 'popular')).toBe(true);
  });

  it('marca isAdult con los ids de los géneros +18 y limita las peticiones de esa carga', async () => {
    // Los títulos del fixture de género "adult" salen marcados también en el listado normal
    router = (c) => {
      if (c.url.endsWith('/manga/') && c.params.genre) return fx('genre-adult.html');
      return fx('genre-adult.html'); // el listado reutiliza las mismas tarjetas
    };
    const items = await P.getPopularManga(1);
    expect(items.length).toBe(3);
    expect(items.every((m) => m.isAdult)).toBe(true);
    // 5 géneros × página 1 (+ las páginas siguientes que el paginador anuncia, máx. 15 por género)
    expect(calls.length).toBeLessThan(90);
  });

  it('sin marca de adultos (carga de géneros +18 falla) el listado sigue funcionando', async () => {
    router = (c) => (c.params.genre ? new Error('boom') : fx('popular-p2.html'));
    const items = await P.getPopularManga(2);
    expect(items).toHaveLength(5);
    expect(items.every((m) => m.isAdult === false)).toBe(true);
  });

  it('respuesta vacía / pantalla anti-bot → error claro; HTML sin tarjetas → []', async () => {
    router = () => '';
    await expect(P.getPopularManga(1)).rejects.toThrow(/vacía/);
    router = () => '<html><head><title>Just a moment...</title></head></html>';
    await expect(P.getPopularManga(1)).rejects.toThrow(/anti-bot/);
    router = () => new Error('Request failed with status 503');
    await expect(P.getPopularManga(1)).rejects.toThrow(/503/);
  });

  it('HTML roto sin tarjetas devuelve lista vacía', async () => {
    router = () => '<html><body><p>Mantenimiento</p></body></html>';
    expect(await P.searchManga('x')).toEqual([]);
  });
});

describe('LeerCapitulo: géneros', () => {
  it('lee los géneros del filtro del directorio (id = slug)', async () => {
    const genres = await P.getGenres!();
    expect(genres.length).toBeGreaterThanOrEqual(6);
    expect(genres[0]).toEqual({ id: 'action', name: 'Action' });
    expect(genres.some((g) => g.id === 'boys-love' && g.name === "Boys' Love")).toBe(true);
    await P.getGenres!();
    expect(calls.filter((c) => !c.params.sort && !c.params.q && !c.params.genre)).toHaveLength(1); // cacheado
  });
});

describe('LeerCapitulo: capítulos', () => {
  it('lee id, número (con decimales), fecha ISO e idioma', async () => {
    const chapters = await P.getMangaChapters('5ks2r35xze/naruto');
    expect(calls[0].url).toBe('https://www.leercapitulo.co/manga/5ks2r35xze/naruto/');
    expect(chapters).toHaveLength(9);
    expect(chapters[0]).toMatchObject({
      id: '5ks2r35xze/naruto/702',
      sourceId: 'leercapitulo',
      chapter: '702',
      volume: null,
      pages: 0,
      translatedLanguage: 'es',
    });
    expect(chapters[0].publishAt).toBe('2026-09-22T00:00:00.000Z');
    expect(chapters.map((c) => c.chapter)).toContain('701.05');
    expect(chapters.find((c) => c.id.endsWith('/701.01'))?.chapter).toBe('701.01');
  });

  it('normalizeChapters los deja en orden ascendente respetando los decimales', async () => {
    const sorted = normalizeChapters(await P.getMangaChapters('5ks2r35xze/naruto'));
    expect(sorted.map((c) => c.chapter)).toEqual(['1', '2', '3', '700', '700.05', '701', '701.01', '701.05', '702']);
  });

  it('ficha sin capítulos → lista vacía; error de red → lanza', async () => {
    router = () => '<html><body><div id="chapterList"></div></body></html>';
    expect(await P.getMangaChapters('a/b')).toEqual([]);
    router = () => new Error('Request failed with status 404');
    await expect(P.getMangaChapters('a/b')).rejects.toThrow(/404/);
  });
});

describe('LeerCapitulo: páginas', () => {
  it('devuelve las URLs absolutas https en orden', async () => {
    const pages = await P.getChapterPages('5ks2r35xze/naruto/1');
    expect(calls[0].url).toBe('https://www.leercapitulo.co/leer/5ks2r35xze/naruto/1/');
    expect(pages.baseUrl).toBe('');
    expect(pages.dataSaver).toEqual([]);
    expect(pages.data).toHaveLength(4);
    for (const u of pages.data) expect(u).toMatch(/^https:\/\/es1s11-95168\.t34798ndc\.com\/.+\.webp$/);
    expect(new Set(pages.data).size).toBe(4);
  });

  it('convierte http a https y descarta imágenes repetidas', async () => {
    router = () =>
      '<main id="lcPages"><img data-src="http://cdn.example.com/a.webp"><img data-src="http://cdn.example.com/a.webp"><img data-src="/p/b.webp"></main>';
    const pages = await P.getChapterPages('x/y/1');
    expect(pages.data).toEqual(['https://cdn.example.com/a.webp', 'https://www.leercapitulo.co/p/b.webp']);
  });

  it('capítulo sin imágenes → páginas vacías; respuesta vacía → error', async () => {
    router = () => '<html><body><main id="lcPages"></main></body></html>';
    expect((await P.getChapterPages('x/y/1')).data).toEqual([]);
    router = () => '';
    await expect(P.getChapterPages('x/y/1')).rejects.toThrow(/vacía/);
  });
});
