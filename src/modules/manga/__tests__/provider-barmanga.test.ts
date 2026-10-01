import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';

// Fixtures REALES (recortados) de archiviumbar.com (BarManga, Madara)
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', 'barmanga', name), 'utf8');

type Call = { method: 'GET' | 'POST'; url: string; params?: Record<string, any>; body?: unknown; headers?: Record<string, string> };
const calls: Call[] = [];
let responder: (c: Call) => { data: unknown };

vi.mock('../../httpProxy', () => ({
  proxyGet: vi.fn(async (url: string, cfg?: any) => {
    const c: Call = { method: 'GET', url, params: cfg?.params, headers: cfg?.headers };
    calls.push(c);
    return responder(c);
  }),
  proxyPost: vi.fn(async (url: string, body: unknown, cfg?: any) => {
    const c: Call = { method: 'POST', url, body, headers: cfg?.headers };
    calls.push(c);
    return responder(c);
  }),
  proxyHead: vi.fn(),
}));

(globalThis as any).DOMParser = class {
  parseFromString(html: string) {
    return parseHTML(html).document;
  }
};

import { BarMangaProvider as P } from '../providers/barmanga';
import { normalizeChapters } from '../chapters';

const form = (c: Call) => Object.fromEntries(new URLSearchParams(String(c.body)));

beforeEach(() => {
  calls.length = 0;
  responder = () => ({ data: '' });
});

describe('BarManga: listados (admin-ajax madara_load_more)', () => {
  it('popular: POST con orden por visitas y `page` base 0', async () => {
    responder = () => ({ data: fx('listing.html') });
    const list = await P.getPopularManga(1);
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({
      id: 'el-villano-rubio-de-la-novela-de-la-protagonista-femenina-quiere-ser-feliz',
      sourceId: 'barmanga',
      title: 'El Villano Rubio De La Novela De La Protagonista Femenina Quiere Ser Feliz.',
      lastChapter: '89',
      isAdult: false,
    });
    expect(list[0].tags).toContain('Manhua');
    expect(list[0].coverUrl).toMatch(/^https:\/\/archiviumbar\.com\/wp-content\/uploads\//);
    expect(list[2].tags).toContain('Manhwa');
    expect(new Set(list.map((m) => m.id)).size).toBe(3);

    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('https://archiviumbar.com/wp-admin/admin-ajax.php');
    expect(calls[0].headers?.['Content-Type']).toContain('application/x-www-form-urlencoded');
    expect(form(calls[0])).toMatchObject({
      action: 'madara_load_more',
      page: '0',
      'vars[post_type]': 'wp-manga',
      'vars[meta_key]': '_wp_manga_views',
      'vars[order]': 'desc',
      'vars[posts_per_page]': '16',
    });
  });

  it('recientes y paginación: página N → `page` = N-1 y orden por última actualización', async () => {
    responder = () => ({ data: fx('listing.html') });
    await P.getRecentlyUpdatedManga(3);
    expect(form(calls[0])).toMatchObject({ page: '2', 'vars[meta_key]': '_latest_update' });
  });

  it('página sin resultados (cuerpo vacío) → []', async () => {
    responder = () => ({ data: '' });
    expect(await P.getPopularManga(99)).toEqual([]);
    responder = () => ({ data: '0' });
    expect(await P.getRecentlyUpdatedManga(99)).toEqual([]);
    responder = () => ({ data: null });
    expect(await P.getPopularManga(1)).toEqual([]);
  });

  it('un fallo de la web se propaga como Error', async () => {
    responder = () => {
      throw Object.assign(new Error('Request failed with status 403'), { status: 403 });
    };
    await expect(P.getPopularManga(1)).rejects.toThrow('403');
  });

  it('browse con género y orden', async () => {
    responder = () => ({ data: fx('listing.html') });
    await P.browse!({ genre: 'accion', sort: 'az', page: 2 });
    expect(form(calls[0])).toMatchObject({ 'vars[wp-manga-genre]': 'accion', 'vars[orderby]': 'title', 'vars[order]': 'asc', page: '1' });
    await P.browse!({ sort: 'rating', page: 1 });
    expect(form(calls[1])['vars[wp-manga-genre]']).toBeUndefined();
    expect(form(calls[1])['vars[meta_key]']).toBe('_manga_avarage_reviews');
  });
});

describe('BarManga: búsqueda (plantilla propia .sr-card)', () => {
  it('lee título, portada, estado y géneros; usa /?s=…&post_type=wp-manga', async () => {
    responder = () => ({ data: fx('search.html') });
    const res = await P.searchManga('solo');
    expect(calls[0].url).toBe('https://archiviumbar.com/');
    expect(calls[0].params).toEqual({ s: 'solo', post_type: 'wp-manga' });
    expect(res).toHaveLength(3);
    expect(res[0]).toMatchObject({
      id: 'mi-maestro-solo-se-abre-paso-cada-vez-que-se-alcanza-el-limite',
      title: 'Mi Maestro Solo Se Abre Paso Cada Vez Que Se Alcanza El Limite',
      status: 'ongoing',
    });
    expect(res[0].tags).toEqual(expect.arrayContaining(['Acción', 'Manhua']));
    expect(res[0].coverUrl).toMatch(/^https:\/\//);
    expect(res[1].status).toBe('completed'); // "Finalizado"
  });

  it('paginación: /page/N/ y 404 fuera de rango → []', async () => {
    responder = () => ({ data: fx('search.html') });
    await P.searchManga('solo', 2);
    expect(calls[0].url).toBe('https://archiviumbar.com/page/2/');
    responder = () => {
      throw Object.assign(new Error('Request failed with status 404'), { status: 404 });
    };
    expect(await P.searchManga('solo', 9)).toEqual([]);
    await expect(P.searchManga('solo', 1)).rejects.toThrow();
  });

  it('sin resultados o consulta vacía → []', async () => {
    responder = () => ({ data: '<html><body><div class="sr-empty">Sin resultados</div></body></html>' });
    expect(await P.searchManga('zzzz')).toEqual([]);
    calls.length = 0;
    expect(await P.searchManga('  ')).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('BarManga: capítulos', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('POST ajax/chapters/: id "{slug}/{capítulo}", número, fecha dd/mm/aaaa y ceros a la izquierda', async () => {
    responder = () => ({ data: fx('chapters.html') });
    const chs = await P.getMangaChapters('me-vi-inmerso-en-un-manga-desconocido');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('https://archiviumbar.com/manga/me-vi-inmerso-en-un-manga-desconocido/ajax/chapters/');
    expect(chs).toHaveLength(5);
    expect(chs[0]).toEqual({
      id: 'me-vi-inmerso-en-un-manga-desconocido/capitulo-40',
      sourceId: 'barmanga',
      chapter: '40',
      volume: null,
      title: null,
      pages: 0,
      publishAt: '2026-09-24T00:00:00.000Z',
      translatedLanguage: 'es',
    });
    // "Capítulo 09" → "9" (sin cero a la izquierda)
    expect(chs.map((c) => c.chapter)).toEqual(['40', '38', '10', '4', '9']);
  });

  it('normalizeChapters los deja ascendentes (el 09 antes del 10)', async () => {
    responder = () => ({ data: fx('chapters.html') });
    const chs = normalizeChapters(await P.getMangaChapters('x'));
    expect(chs.map((c) => c.chapter)).toEqual(['4', '9', '10', '38', '40']);
  });

  it('si el ajax viene vacío, usa la lista de la propia ficha', async () => {
    responder = (c) => ({ data: c.method === 'POST' ? '' : fx('chapters.html') });
    const chs = await P.getMangaChapters('x');
    expect(chs).toHaveLength(5);
    expect(calls.map((c) => c.method)).toEqual(['POST', 'GET']);
    expect(calls[1].url).toBe('https://archiviumbar.com/manga/x/');
  });

  it('manga sin capítulos → []', async () => {
    responder = () => ({ data: '<html><body></body></html>' });
    expect(await P.getMangaChapters('x')).toEqual([]);
  });
});

describe('BarManga: páginas del capítulo', () => {
  it('devuelve las imágenes del lector (absolutas, en orden) y pide style=list', async () => {
    responder = () => ({ data: fx('chapter.html') });
    const pages = await P.getChapterPages('me-vi-inmerso-en-un-manga-desconocido/capitulo-38');
    expect(calls[0].url).toBe('https://archiviumbar.com/manga/me-vi-inmerso-en-un-manga-desconocido/capitulo-38/');
    expect(calls[0].params).toEqual({ style: 'list' });
    expect(pages.baseUrl).toBe('');
    expect(pages.hash).toBe('');
    expect(pages.dataSaver).toEqual([]);
    expect(pages.data).toHaveLength(3);
    expect(pages.data[0]).toMatch(/^https:\/\/archiviumbar\.com\/wp-content\/uploads\/WP-manga\/data\/.*\/001\.webp$/);
    expect(pages.data.map((u) => u.split('/').pop())).toEqual(['001.webp', '002.webp', '003.webp']);
  });

  it('capítulo sin imágenes → data vacío', async () => {
    responder = () => ({ data: '<html><body><div class="reading-content"></div></body></html>' });
    expect((await P.getChapterPages('a/capitulo-1')).data).toEqual([]);
  });
});

describe('BarManga: géneros', () => {
  it('lee los enlaces /manga-genre/ de la portada, sin duplicados, y los cachea', async () => {
    responder = () => ({ data: fx('home.html') });
    const g = await P.getGenres!();
    expect(g).toContainEqual({ id: 'accion', name: 'Acción' });
    expect(g.filter((x) => x.id === 'accion')).toHaveLength(1);
    expect(g.length).toBeGreaterThanOrEqual(10);
    await P.getGenres!();
    expect(calls).toHaveLength(1);
  });
});

describe('BarManga: contrato', () => {
  it('id válido, nombre y tamaño de página', () => {
    expect(P.id).toMatch(/^[a-z0-9_-]{2,30}$/);
    expect(P.name).toBe('BarManga');
    expect(P.pageSize).toBe(16);
  });
});
