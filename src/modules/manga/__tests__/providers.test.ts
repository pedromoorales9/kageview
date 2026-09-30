import { describe, it, expect, beforeEach, vi } from 'vitest';

// Las fuentes hacen sus peticiones por proxyGet (proceso principal de Electron):
// aquí se sustituye por un servidor de mentira.
const calls: string[] = [];
let responder: (url: string) => any = () => ({ data: { data: [], total: 0 } });

vi.mock('../../httpProxy', () => ({
  proxyGet: vi.fn(async (url: string) => {
    calls.push(url);
    return responder(url);
  }),
  proxyPost: vi.fn(),
  proxyHead: vi.fn(),
}));

// Entorno de pruebas sin navegador: un DOMParser mínimo (sin tarjetas que leer)
(globalThis as any).DOMParser = class {
  parseFromString() {
    return { querySelectorAll: () => [] };
  }
};

import { MangaDexProvider, buildGenres, mergeChapters, setMangaDexIncludeEnglish } from '../providers/mangadex';
import { ManhwaWebProvider } from '../providers/manhwaweb';
import { InMangaProvider } from '../providers/inmanga';
import { MangaOniProvider } from '../providers/mangaoni';
import { loadMangaChapters, searchAllProviders, MANGA_PROVIDERS } from '../index';
import type { MangaProvider } from '../types';

const rawCh = (id: string, chapter: string | null, lang: string, pages = 10) => ({
  id, attributes: { chapter, volume: null, title: null, pages, publishAt: '2026-01-01T00:00:00Z', translatedLanguage: lang },
});

beforeEach(() => {
  calls.length = 0;
  responder = () => ({ data: { data: [], total: 0 } });
  setMangaDexIncludeEnglish(false);
});

describe('MangaDex: capítulos', () => {
  it('un capítulo por número, prefiriendo español sobre español latino sobre inglés', () => {
    const out = mergeChapters(
      [rawCh('en1', '1', 'en'), rawCh('la1', '1', 'es-la'), rawCh('es2', '2', 'es'), rawCh('en2', '2', 'en'), rawCh('en3', '3', 'en')],
      ['es', 'es-la', 'en']
    );
    const byNum = Object.fromEntries(out.map((c) => [c.chapter, c.id]));
    expect(byNum).toEqual({ '1': 'la1', '2': 'es2', '3': 'en3' });
  });

  it('con solo español, el inglés no se cuela', () => {
    const out = mergeChapters([rawCh('en1', '1', 'en'), rawCh('es1', '1', 'es')], ['es', 'es-la']);
    expect(out.map((c) => c.id)).toEqual(['es1']);
  });

  it('descarta capítulos de 0 páginas (enlaces externos) y respeta los extras sin número', () => {
    const out = mergeChapters([rawCh('ext', '5', 'es', 0), rawCh('ok', '5', 'es'), rawCh('x1', null, 'es'), rawCh('x2', null, 'es')], ['es']);
    expect(out.map((c) => c.id)).toEqual(['ok', 'x1', 'x2']); // los extras usan su id como clave: no se fusionan
  });

  it('pide TODAS las páginas del feed (no se corta en 500) y pasa los idiomas', async () => {
    const total = 1234;
    responder = (url) => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      const n = Math.min(500, total - offset);
      return { data: { total, data: Array.from({ length: n }, (_, i) => rawCh(`c${offset + i}`, String(offset + i + 1), 'es')) } };
    };
    const chapters = await MangaDexProvider.getMangaChapters('abc', { languages: ['es', 'en'] });
    expect(chapters).toHaveLength(total);
    expect(calls).toHaveLength(3); // 500 + 500 + 234
    const first = new URL(calls[0]).searchParams;
    expect(first.getAll('translatedLanguage[]')).toEqual(['es', 'es-la', 'en']);
    expect(first.get('includeExternalUrl')).toBe('0');
    expect(first.get('limit')).toBe('500');
    expect(calls.map((u) => new URL(u).searchParams.get('offset'))).toEqual(['0', '500', '1000']);
  });

  it('se detiene si el servidor no devuelve nada (sin bucle infinito)', async () => {
    responder = () => ({ data: { total: 99999, data: [] } });
    expect(await MangaDexProvider.getMangaChapters('abc')).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('con un tope de peticiones aunque el total sea absurdo', async () => {
    responder = () => ({ data: { total: 10_000_000, data: [rawCh(`c${calls.length}`, String(calls.length), 'es')] } });
    await MangaDexProvider.getMangaChapters('abc');
    expect(calls.length).toBeLessThanOrEqual(20);
  });
});

describe('MangaDex: listados', () => {
  it('pagina con offset y filtra por idioma (y admite inglés si se activa)', async () => {
    await MangaDexProvider.getPopularManga(3);
    let q = new URL(calls[0]).searchParams;
    expect(q.get('offset')).toBe('48');
    expect(q.get('limit')).toBe('24');
    expect(q.getAll('availableTranslatedLanguage[]')).toEqual(['es', 'es-la']);
    expect(q.get('order[followedCount]')).toBe('desc');
    expect(q.getAll('contentRating[]')).toEqual(['safe', 'suggestive']);

    setMangaDexIncludeEnglish(true);
    await MangaDexProvider.searchManga('naruto', 1);
    q = new URL(calls[1]).searchParams;
    expect(q.getAll('availableTranslatedLanguage[]')).toEqual(['es', 'es-la', 'en']);
    expect(q.get('title')).toBe('naruto');
    expect(q.get('offset')).toBe('0');
  });

  it('browse: género y orden', async () => {
    await MangaDexProvider.browse!({ genre: 'tag-uuid', sort: 'rating', page: 2 });
    const q = new URL(calls[0]).searchParams;
    expect(q.getAll('includedTags[]')).toEqual(['tag-uuid']);
    expect(q.get('order[rating]')).toBe('desc');
    expect(q.get('offset')).toBe('24');
    await MangaDexProvider.browse!({ sort: 'az', page: 1 });
    const q2 = new URL(calls[1]).searchParams;
    expect(q2.get('order[title]')).toBe('asc');
    expect(q2.has('includedTags[]')).toBe(false);
  });

  it('géneros: solo los que existen, con etiqueta en español y en orden', () => {
    const tags = [
      { id: 't-drama', attributes: { name: { en: 'Drama' } } },
      { id: 't-action', attributes: { name: { en: 'Action' } } },
      { id: 't-raro', attributes: { name: { en: 'Algo Raro' } } },
      { id: 't-sci', attributes: { name: { en: 'Sci-Fi' } } },
    ];
    expect(buildGenres(tags)).toEqual([
      { id: 't-action', name: 'Acción' },
      { id: 't-drama', name: 'Drama' },
      { id: 't-sci', name: 'Ciencia ficción' },
    ]);
    expect(buildGenres([])).toEqual([]);
    expect(buildGenres(undefined as any)).toEqual([]);
  });

  it('los géneros se piden una sola vez', async () => {
    responder = () => ({ data: { data: [{ id: 'x', attributes: { name: { en: 'Action' } } }] } });
    await MangaDexProvider.getGenres!();
    await MangaDexProvider.getGenres!();
    expect(calls.filter((u) => u.includes('/manga/tag'))).toHaveLength(1);
  });
});

describe('paginación en las otras fuentes', () => {
  it('ManhwaWeb usa `page`', async () => {
    responder = () => ({ data: { data: [], next: true } });
    await ManhwaWebProvider.getPopularManga(4);
    const { proxyGet } = await import('../../httpProxy');
    const last = (proxyGet as any).mock.calls.at(-1);
    expect(last[1].params.page).toBe('4');
    expect(ManhwaWebProvider.pageSize).toBe(30);
  });

  it('MangaOni usa `p` solo a partir de la página 2 y su búsqueda no pagina', async () => {
    responder = () => ({ data: '<html></html>' });
    await MangaOniProvider.getPopularManga(1);
    await MangaOniProvider.getPopularManga(3);
    const { proxyGet } = await import('../../httpProxy');
    const [c1, c2] = (proxyGet as any).mock.calls.slice(-2);
    expect(c1[1].params.p).toBeUndefined();
    expect(c2[1].params.p).toBe('3');
    expect(await MangaOniProvider.searchManga('one', 2)).toEqual([]);
    expect(MangaOniProvider.pageSize).toBe(18);
  });

  it('todas declaran su tamaño de página', () => {
    for (const p of Object.values(MANGA_PROVIDERS)) expect(p.pageSize).toBeGreaterThan(0);
    expect(InMangaProvider.pageSize).toBe(24);
  });
});

describe('loadMangaChapters: el orden es igual en todas las fuentes', () => {
  const fake = (id: string, order: 'asc' | 'desc'): MangaProvider => ({
    id, name: id, pageSize: 10,
    searchManga: async () => [], getPopularManga: async () => [], getRecentlyUpdatedManga: async () => [],
    getChapterPages: async () => ({ baseUrl: '', hash: '', data: [], dataSaver: [] }),
    getMangaChapters: async () => {
      const list = ['1', '2', '3', '10'].map((n) => ({ id: `${id}-${n}`, sourceId: id, chapter: n, volume: null, title: null, pages: 5, publishAt: '', translatedLanguage: 'es' }));
      return order === 'asc' ? list : list.reverse();
    },
  });

  it('InManga (descendente) y el resto (ascendente) acaban igual: siguiente = índice + 1', async () => {
    MANGA_PROVIDERS.fake_desc = fake('fake_desc', 'desc');
    MANGA_PROVIDERS.fake_asc = fake('fake_asc', 'asc');
    const a = await loadMangaChapters({ id: 'm', sourceId: 'fake_desc' });
    const b = await loadMangaChapters({ id: 'm', sourceId: 'fake_asc' });
    expect(a.map((c) => c.chapter)).toEqual(['1', '2', '3', '10']);
    expect(b.map((c) => c.chapter)).toEqual(['1', '2', '3', '10']);
    delete MANGA_PROVIDERS.fake_desc;
    delete MANGA_PROVIDERS.fake_asc;
  });
});

describe('searchAllProviders', () => {
  const p = (id: string, fn: () => Promise<any[]>): MangaProvider => ({
    id, name: id, pageSize: 10, searchManga: fn, getPopularManga: async () => [], getRecentlyUpdatedManga: async () => [],
    getMangaChapters: async () => [], getChapterPages: async () => ({ baseUrl: '', hash: '', data: [], dataSaver: [] }),
  });
  const m = (id: string, sourceId: string) => ({ id, sourceId, title: id, description: '', coverUrl: '', status: 'ongoing' as const, tags: [], year: null, lastChapter: null });

  it('una fuente caída no bloquea a las demás y se mantiene el orden', async () => {
    const res = await searchAllProviders('x', [
      p('a', async () => [m('1', 'a')]),
      p('b', async () => { throw new Error('caído'); }),
      p('c', async () => [m('3', 'c'), m('4', 'c')]),
    ]);
    expect(res.map((r) => r.provider.id)).toEqual(['a', 'b', 'c']);
    expect(res.map((r) => r.items.length)).toEqual([1, 0, 2]);
    expect(res[1].error).toBe('caído');
    expect(res[0].error).toBeUndefined();
  });

  it('una fuente lenta se corta por tiempo', async () => {
    const res = await searchAllProviders('x', [p('lenta', () => new Promise(() => undefined)), p('rapida', async () => [m('1', 'rapida')])], 50);
    expect(res[0].error).toMatch(/demasiado/);
    expect(res[1].items).toHaveLength(1);
  });
});
