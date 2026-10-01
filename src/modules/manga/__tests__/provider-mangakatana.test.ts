import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

vi.mock('../../httpProxy', () => ({ proxyGet: vi.fn(), proxyPost: vi.fn(), proxyHead: vi.fn() }));

import { parseHTML } from 'linkedom';
import { proxyGet } from '../../httpProxy';
import { MangaKatanaProvider as P } from '../providers/mangakatana';
import { normalizeChapters } from '../chapters';

(globalThis as any).DOMParser = class {
  parseFromString(html: string) {
    return parseHTML(html).document;
  }
};

const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', 'mangakatana', name), 'utf8');
const mockGet = proxyGet as unknown as ReturnType<typeof vi.fn>;
const reply = (data: unknown) => mockGet.mockResolvedValueOnce({ status: 200, data, headers: {} });
const fail = (status: number) =>
  mockGet.mockRejectedValueOnce(Object.assign(new Error(`Request failed with status ${status}`), { status }));

beforeEach(() => mockGet.mockReset());

describe('MangaKatana — listados', () => {
  it('parsea tarjetas: id con número, título, portada, estado, géneros, último capítulo', async () => {
    reply(fx('listing.html'));
    const list = await P.getRecentlyUpdatedManga(1);
    expect(list).toHaveLength(4);
    for (const m of list) {
      expect(m.sourceId).toBe('mangakatana');
      expect(m.id).toMatch(/\.\d+$/);
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.coverUrl).toMatch(/^https:\/\//);
    }
    expect(list[0].status).toBe('ongoing');
    expect(list[0].tags.length).toBeGreaterThan(0);
    expect(list[0].lastChapter).toMatch(/^\d+(\.\d+)?$/);
  });

  it('marca isAdult en los géneros +18 (y solo en ellos)', async () => {
    reply(fx('listing.html'));
    const list = await P.getRecentlyUpdatedManga(1);
    expect(list[3].isAdult).toBe(true);
    expect(list[0].isAdult).toBeUndefined();
  });

  it('construye bien las URLs: popular, recientes, búsqueda y género con página', async () => {
    reply(fx('listing.html'));
    await P.getPopularManga(2);
    expect(mockGet.mock.calls[0][0]).toBe('https://mangakatana.com/manga/page/2?filter=1&include_mode=and&chapters=1&order=numc');

    reply(fx('listing.html'));
    await P.getRecentlyUpdatedManga(3);
    expect(mockGet.mock.calls[1][0]).toBe('https://mangakatana.com/latest/page/3');

    reply(fx('listing.html'));
    await P.searchManga(' blue lock ', 1);
    expect(mockGet.mock.calls[2][0]).toBe('https://mangakatana.com/page/1?search=blue+lock&search_by=book_name');

    reply(fx('listing.html'));
    await P.browse!({ genre: 'action', sort: 'az', page: 2 });
    expect(mockGet.mock.calls[3][0]).toBe('https://mangakatana.com/genre/action/page/2?order=az');

    reply(fx('listing.html'));
    await P.browse!({ sort: 'recent', page: 1 });
    expect(mockGet.mock.calls[4][0]).toContain('/manga/page/1?filter=1&include_mode=and&chapters=1&order=latest');
  });

  it('expone géneros', async () => {
    const g = await P.getGenres!();
    expect(g.find((x) => x.id === 'action')?.name).toBe('Action');
  });

  it('un 404 (sin resultados / página pasada del final) devuelve [] pero otros errores se propagan', async () => {
    fail(404);
    expect(await P.searchManga('zzzqqq')).toEqual([]);
    fail(500);
    await expect(P.getPopularManga(1)).rejects.toThrow(/500/);
  });

  it('HTML sin listado devuelve []; una respuesta que no es HTML lanza error claro', async () => {
    reply('<html><body><p>nada</p></body></html>');
    expect(await P.getPopularManga(1)).toEqual([]);
    reply({ raro: 1 });
    await expect(P.getPopularManga(1)).rejects.toThrow(/MangaKatana/);
  });
});

describe('MangaKatana — capítulos', () => {
  it('parsea id `{serie}/c{n}`, número, título y fecha', async () => {
    reply(fx('series.html'));
    const ch = await P.getMangaChapters('one-piece.49');
    expect(mockGet.mock.calls[0][0]).toBe('https://mangakatana.com/manga/one-piece.49');
    expect(ch.length).toBeGreaterThanOrEqual(6);
    expect(ch[0]).toMatchObject({
      id: 'one-piece.49/c1194',
      chapter: '1194',
      title: 'The Impermanence of All Things',
      translatedLanguage: 'en',
      sourceId: 'mangakatana',
      pages: 0,
      publishAt: '2026-09-26T00:00:00.000Z',
    });
  });

  it('normalizeChapters los ordena ascendente', async () => {
    reply(fx('series.html'));
    const sorted = normalizeChapters(await P.getMangaChapters('one-piece.49'));
    const nums = sorted.map((c) => parseFloat(c.chapter ?? '0'));
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
  });

  it('decimales, volúmenes, extras sin número y duplicados (HTML sintético)', async () => {
    const row = (path: string, label: string, date = 'Jan-05-2025') =>
      `<tr><td><div class="chapter"><a href="https://mangakatana.com/manga/${path}">${label}</a></div></td><td><div class="update_time">${date}</div></td></tr>`;
    reply(
      `<div class="chapters"><table><tbody>${
        row('x.1/c12.5', 'Chapter 12.5: Extra') +
        row('x.1/c12', 'Vol.2 Chapter 12') +
        row('x.1/c0', 'Prologue', 'xx') +
        row('x.1/c12', 'Chapter 12 (dup)')
      }</tbody></table></div>`
    );
    const ch = await P.getMangaChapters('x.1');
    expect(ch.map((c) => c.chapter)).toEqual(['12.5', '12', null]);
    expect(ch[0].title).toBe('Extra');
    expect(ch[1].volume).toBe('2');
    expect(ch[2].title).toBe('Prologue');
    expect(ch[2].publishAt).toBe('');
    expect(ch[0].publishAt).toBe('2025-01-05T00:00:00.000Z');
  });

  it('sin tabla de capítulos devuelve []', async () => {
    reply('<html></html>');
    expect(await P.getMangaChapters('x.1')).toEqual([]);
  });
});

describe('MangaKatana — páginas', () => {
  it('toma el array JS más largo (ignora el de una sola imagen) y deja solo https', async () => {
    reply(fx('chapter.html'));
    const pages = await P.getChapterPages('one-piece.49/c1194');
    expect(mockGet.mock.calls[0][0]).toBe('https://mangakatana.com/manga/one-piece.49/c1194');
    expect(pages.baseUrl).toBe('');
    expect(pages.data).toHaveLength(4);
    expect(pages.data.every((u) => u.startsWith('https://i1.mangakatana.com/token/'))).toBe(true);
    expect(pages.data[3]).toMatch(/\/3\.jpg$/);
  });

  it('promueve http a https y devuelve [] si no hay array', async () => {
    reply("<script>var abcd=['http://i1.mangakatana.com/a/0.jpg','http://i1.mangakatana.com/a/1.jpg',];</script>");
    expect((await P.getChapterPages('x/c1')).data).toEqual([
      'https://i1.mangakatana.com/a/0.jpg',
      'https://i1.mangakatana.com/a/1.jpg',
    ]);
    reply('<html></html>');
    expect((await P.getChapterPages('x/c1')).data).toEqual([]);
  });
});
