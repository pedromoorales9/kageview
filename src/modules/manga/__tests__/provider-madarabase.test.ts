import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';

// Fixtures REALES de otras webs Madara (manhwa-online.com y vermanhwa.com) para comprobar que
// la base es reutilizable: modo `archive` (HTML), portadas con carga diferida, fechas en español…
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', 'madara-archive', name), 'utf8');

type Call = { method: string; url: string; params?: Record<string, any> };
const calls: Call[] = [];
let responder: (c: Call) => { data: unknown };

vi.mock('../../httpProxy', () => ({
  proxyGet: vi.fn(async (url: string, cfg?: any) => {
    const c = { method: 'GET', url, params: cfg?.params };
    calls.push(c);
    return responder(c);
  }),
  proxyPost: vi.fn(async (url: string) => {
    const c = { method: 'POST', url };
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

import { createMadaraProvider, parseChapterLabel, parseMadaraDate } from '../providers/madaraBase';

const P = createMadaraProvider({
  id: 'ejemplo',
  name: 'Ejemplo',
  baseUrl: 'https://manhwa-online.com/',
  pageSize: 20,
  listing: 'archive',
  isAdult: (title) => /sin censura/i.test(title),
});

beforeEach(() => {
  calls.length = 0;
  responder = () => ({ data: '' });
});

describe('Madara base: listado en modo archive (HTML)', () => {
  it('popular: /manga/?m_orderby=views; página N → /manga/page/N/', async () => {
    responder = () => ({ data: fx('manhwa-online-list.html') });
    const list = await P.getPopularManga(1);
    expect(calls[0].url).toBe('https://manhwa-online.com/manga/');
    expect(calls[0].params).toEqual({ m_orderby: 'views' });
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: 'jinx-23', sourceId: 'ejemplo', title: 'Jinx', coverUrl: 'https://manhwa-online.com/wp-content/uploads/2024/07/Jinx-175x238.jpg' });
    expect(list[0].tags).toContain('Manhwa');

    await P.getRecentlyUpdatedManga(4);
    expect(calls[1].url).toBe('https://manhwa-online.com/manga/page/4/');
    expect(calls[1].params).toEqual({ m_orderby: 'latest' });
  });

  it('browse por género usa /manga-genre/{slug}/page/N/', async () => {
    responder = () => ({ data: fx('manhwa-online-list.html') });
    await P.browse!({ genre: 'romance', sort: 'popular', page: 2 });
    expect(calls[0].url).toBe('https://manhwa-online.com/manga-genre/romance/page/2/');
  });

  it('portadas con carga diferida: usa data-src y descarta el placeholder; +18 por callback', async () => {
    responder = () => ({ data: fx('lazy-list.html') });
    const list = await P.getRecentlyUpdatedManga(1);
    expect(list).toHaveLength(2);
    for (const m of list) {
      expect(m.coverUrl).toMatch(/^https:\/\/vermanhwa\.com\/wp-content\/uploads\//);
      expect(m.coverUrl).not.toContain('dflazy');
      expect(m.lastChapter).toBeTruthy();
    }
    expect(list.map((m) => m.isAdult)).toEqual(list.map((m) => /sin censura/i.test(m.title)));
  });

  it('HTML vacío o sin tarjetas → []', async () => {
    responder = () => ({ data: '<html></html>' });
    expect(await P.getPopularManga(1)).toEqual([]);
  });
});

describe('Madara base: capítulos con extras y fechas en español', () => {
  it('"Capítulo 73 Extra 03" → número 73 + título "Extra 03"; fechas relativas y escritas', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    responder = () => ({ data: fx('chapters.html') });
    const chs = await P.getMangaChapters('el-espiritu-de-mu-ryeong-comics');
    expect(chs.map((c) => [c.chapter, c.title])).toEqual([
      ['73', 'Extra 03'],
      ['72', 'Extra 02'],
      ['10', null],
    ]);
    expect(chs[0].id).toBe('el-espiritu-de-mu-ryeong-comics/capitulo-73-extra-03');
    expect(chs[0].publishAt).toBe('2026-09-30T10:00:00.000Z'); // "2 horas ago"
    expect(chs[2].publishAt).toBe('2025-02-07T00:00:00.000Z'); // "febrero 7, 2025"
    vi.useRealTimers();
  });
});

describe('Madara base: utilidades', () => {
  it('parseChapterLabel', () => {
    expect(parseChapterLabel('Capítulo 12')).toEqual({ chapter: '12', title: null });
    expect(parseChapterLabel('Capitulo 139 - FIN')).toEqual({ chapter: '139', title: 'FIN' });
    expect(parseChapterLabel('Capítulo 12.5')).toEqual({ chapter: '12.5', title: null });
    expect(parseChapterLabel('Cap. 7,5: El regreso')).toEqual({ chapter: '7.5', title: 'El regreso' });
    expect(parseChapterLabel('Capítulo 007')).toEqual({ chapter: '7', title: null });
    expect(parseChapterLabel('Chapter 3')).toEqual({ chapter: '3', title: null });
    expect(parseChapterLabel('Oneshot')).toEqual({ chapter: null, title: 'Oneshot' });
    expect(parseChapterLabel('  ')).toEqual({ chapter: null, title: null });
  });

  it('parseMadaraDate', () => {
    const now = new Date('2026-09-30T12:00:00Z');
    expect(parseMadaraDate('24/09/2026', now)).toBe('2026-09-24T00:00:00.000Z');
    expect(parseMadaraDate('septiembre 25, 2026', now)).toBe('2026-09-25T00:00:00.000Z');
    expect(parseMadaraDate('2026-09-25 10:00:00', now)).toBe('2026-09-25T00:00:00.000Z');
    expect(parseMadaraDate('2 horas ago', now)).toBe('2026-09-30T10:00:00.000Z');
    expect(parseMadaraDate('hace 3 días', now)).toBe('2026-09-27T12:00:00.000Z');
    expect(parseMadaraDate('hace 1 semana', now)).toBe('2026-09-23T12:00:00.000Z');
    expect(parseMadaraDate('hace 14 h', now)).toBe('2026-09-29T22:00:00.000Z');
    expect(parseMadaraDate('', now)).toBe('');
    expect(parseMadaraDate('fecha rara', now)).toBe('');
  });
});
