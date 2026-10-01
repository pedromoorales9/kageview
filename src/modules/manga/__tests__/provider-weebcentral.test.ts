import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

vi.mock('../../httpProxy', () => ({ proxyGet: vi.fn(), proxyPost: vi.fn(), proxyHead: vi.fn() }));

import { parseHTML } from 'linkedom';
import { proxyGet } from '../../httpProxy';
import { WeebCentralProvider as P } from '../providers/weebcentral';
import { normalizeChapters } from '../chapters';

(globalThis as any).DOMParser = class {
  parseFromString(html: string) {
    return parseHTML(html).document;
  }
};

const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', 'weebcentral', name), 'utf8');
const mockGet = proxyGet as unknown as ReturnType<typeof vi.fn>;
const reply = (data: unknown) => mockGet.mockResolvedValueOnce({ status: 200, data, headers: {} });

beforeEach(() => mockGet.mockReset());

describe('WeebCentral — listado y búsqueda', () => {
  it('parsea tarjetas: id (ULID), título, portada, año, estado, etiquetas', async () => {
    reply(fx('search-popular.html'));
    const list = await P.getPopularManga(1);
    expect(list).toHaveLength(3);
    const blue = list.find((m) => m.title === 'Blue Lock')!;
    expect(blue.id).toBe('01J76XYD7E91K8QP6CY0Y53900');
    expect(blue.sourceId).toBe('weebcentral');
    expect(blue.coverUrl).toMatch(/^https:\/\/temp\.compsci88\.com\/cover\/normal\/01J76XYD7E91K8QP6CY0Y53900\.webp$/);
    expect(blue.year).toBe(2018);
    expect(blue.status).toBe('ongoing');
    expect(blue.tags).toEqual(['Action', 'Drama', 'Shounen', 'Sports']);
    expect(blue.isAdult).toBeUndefined();
  });

  it('marca isAdult en los títulos con insignia +18 / etiqueta Adult', async () => {
    reply(fx('search-popular.html'));
    const list = await P.getPopularManga(1);
    expect(list[0].title).toBe('Rakujitsu no Pathos');
    expect(list[0].isAdult).toBe(true);
  });

  it('pide /search/data con offset según la página y el orden correcto', async () => {
    reply(fx('search-popular.html'));
    await P.getPopularManga(3);
    const [url, cfg] = mockGet.mock.calls[0];
    expect(url).toBe('https://weebcentral.com/search/data');
    expect(cfg.params).toMatchObject({ limit: '32', offset: '64', sort: 'Popularity', order: 'Descending' });

    reply(fx('search-popular.html'));
    await P.getRecentlyUpdatedManga(1);
    expect(mockGet.mock.calls[1][1].params).toMatchObject({ offset: '0', sort: 'Latest Updates' });
  });

  it('búsqueda envía `text` y ordena por coincidencia', async () => {
    reply(fx('search-popular.html'));
    await P.searchManga('  blue lock ', 2);
    expect(mockGet.mock.calls[0][1].params).toMatchObject({ text: 'blue lock', sort: 'Best Match', offset: '32' });
  });

  it('browse con género y orden alfabético', async () => {
    reply(fx('search-popular.html'));
    await P.browse!({ genre: 'Action', sort: 'az', page: 1 });
    expect(mockGet.mock.calls[0][1].params).toMatchObject({ included_tag: 'Action', sort: 'Alphabet', order: 'Ascending' });
    const genres = await P.getGenres!();
    expect(genres.find((g) => g.id === 'Action')).toBeTruthy();
  });

  it('una respuesta vacía devuelve [] y una no-HTML lanza error claro', async () => {
    reply('\n<div role="alert" class="alert">Nothing found</div>');
    expect(await P.searchManga('zzz')).toEqual([]);
    reply({ unexpected: true });
    await expect(P.getPopularManga(1)).rejects.toThrow(/WeebCentral/);
  });
});

describe('WeebCentral — capítulos', () => {
  it('parsea id, número, fecha ISO e idioma', async () => {
    reply(fx('chapter-list.html'));
    const chapters = await P.getMangaChapters('01J76XYD7E91K8QP6CY0Y53900');
    expect(mockGet.mock.calls[0][0]).toBe('https://weebcentral.com/series/01J76XYD7E91K8QP6CY0Y53900/full-chapter-list');
    expect(chapters.length).toBeGreaterThanOrEqual(5);
    const first = chapters[0];
    expect(first).toMatchObject({
      id: '01M3PVERE85N4QXBHWA60VDMQJ',
      chapter: '363',
      translatedLanguage: 'en',
      sourceId: 'weebcentral',
      title: null,
      pages: 0,
    });
    expect(first.publishAt).toBe('2026-09-29T15:10:13.448Z');
  });

  it('normalizeChapters los deja en orden ascendente', async () => {
    reply(fx('chapter-list-one-piece.html'));
    const sorted = normalizeChapters(await P.getMangaChapters('01J76XY7E9FNDZ1DBBM6PBJPFK'));
    const nums = sorted.map((c) => parseFloat(c.chapter ?? '0'));
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
  });

  it('numeración con decimales, prefijos distintos y extras (HTML sintético)', async () => {
    const row = (id: string, label: string) =>
      `<div><a href="/chapters/${id}"><span class="grow flex"><span class="">${label}</span></span><time datetime="2026-01-01T00:00:00.000Z">2026-01-01T00:00:00.000000Z</time></a></div>`;
    reply(
      row('01AAAAAAAAAAAAAAAAAAAAAAA1', 'Mission 140.5') +
        row('01AAAAAAAAAAAAAAAAAAAAAAA2', 'Dragon Ball Z 325') +
        row('01AAAAAAAAAAAAAAAAAAAAAAA3', 'Volume 2 Chapter 12') +
        row('01AAAAAAAAAAAAAAAAAAAAAAA4', 'Special') +
        row('01AAAAAAAAAAAAAAAAAAAAAAA1', 'Mission 140.5') // duplicado
    );
    const ch = await P.getMangaChapters('X');
    expect(ch.map((c) => c.chapter)).toEqual(['140.5', '325', '12', null]);
    expect(ch[0].title).toBe('Mission 140.5');
    expect(ch[2].volume).toBe('2');
    expect(ch[3].title).toBe('Special');
  });

  it('una lista vacía devuelve []', async () => {
    reply('');
    expect(await P.getMangaChapters('X')).toEqual([]);
  });
});

describe('WeebCentral — páginas', () => {
  it('devuelve solo las URLs https absolutas de las imágenes', async () => {
    reply(fx('chapter-images.html'));
    const pages = await P.getChapterPages('01M3PVERE85N4QXBHWA60VDMQJ');
    const [url, cfg] = mockGet.mock.calls[0];
    expect(url).toBe('https://weebcentral.com/chapters/01M3PVERE85N4QXBHWA60VDMQJ/images');
    expect(cfg.params).toMatchObject({ reading_style: 'long_strip', current_page: '1' });
    expect(pages.baseUrl).toBe('');
    expect(pages.data).toEqual([
      'https://scans-hot.planeptune.us/manga/Blue-Lock/0363-001.png',
      'https://scans-hot.planeptune.us/manga/Blue-Lock/0363-002.png',
      'https://scans-hot.planeptune.us/manga/Blue-Lock/0363-003.png',
    ]);
  });

  it('sin imágenes devuelve data vacío', async () => {
    reply('<section id="chapter-images"></section>');
    expect((await P.getChapterPages('X')).data).toEqual([]);
  });
});
