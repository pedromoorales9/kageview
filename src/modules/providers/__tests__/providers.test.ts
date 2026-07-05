// ═══════════════════════════════════════════════════════════
// Tests de parsers de providers de anime — port de
// AnimeProviderParsingTests.swift (versión nativa de macOS).
//
// Las regex de parseo son la parte más frágil de la app (dependen del
// HTML de sitios de terceros); estos tests con fixtures fijan su
// comportamiento actual.
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { AnimeFlvProvider } from '../animeflv';
import { JKAnimeProvider } from '../jkanime';
import { AnimeAV1Provider } from '../animeav1';

describe('AnimeFlvProvider', () => {
  const provider = new AnimeFlvProvider();

  it('parseSearch extrae slug, título y URL de cada <article>', () => {
    const html = `
      <div class="ListAnimes">
        <article class="Anime"><a href="/anime/naruto"><h3 class="Title">Naruto</h3></a></article>
        <article class="Anime"><a href="/anime/bleach"><h3>Bleach</h3></a></article>
      </div>`;
    const results = provider.parseSearch(html);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('naruto');
    expect(results[0].title).toBe('Naruto');
    expect(results[0].url).toBe('https://animeflv.net/anime/naruto');
    expect(results[1].id).toBe('bleach');
  });

  it('parseEpisodes lee `var episodes` y los invierte (último primero)', () => {
    const html = '<script>var episodes = [[1,1001],[2,1002],[3,1003]];</script>';
    const eps = provider.parseEpisodes(html, 'naruto');
    expect(eps).toHaveLength(3);
    expect(new Set(eps.map((e) => e.number))).toEqual(new Set([1, 2, 3]));
    // El original invierte: el episodio más alto va primero
    expect(eps[0].number).toBe(3);
    const ep1 = eps.find((e) => e.number === 1)!;
    expect(ep1.id).toBe('naruto-1');
    expect(ep1.url).toBe('https://animeflv.net/ver/naruto-1');
  });

  it('parseSources respeta el modo y el orden PREFERRED', () => {
    const html = `var videos = {"SUB":[
      {"server":"yourupload","code":"https://yu.example/x"},
      {"server":"sw","url":"https://sw.example/abc"}
    ],"LAT":[{"server":"okru","url":"https://ok.ru/v"}]};`;

    const sub = provider.parseSources(html, 'sub');
    expect(sub).toHaveLength(2);
    // 'sw' está antes que 'yourupload' en la lista PREFERRED
    expect(sub[0].url).toBe('https://sw.example/abc');
    expect(sub[0].type).toBe('iframe');
    expect(sub[0].quality).toBe('sw');
    expect(sub[1].url).toBe('https://yu.example/x'); // cae a `code`

    const dub = provider.parseSources(html, 'dub');
    expect(dub[0].url).toBe('https://ok.ru/v');
  });
});

describe('JKAnimeProvider', () => {
  const provider = new JKAnimeProvider();

  it('parseSearch extrae slug y título de los <h5><a>', () => {
    const html = `
      <div class="anime__item">
        <h5><a href="https://jkanime.net/naruto/">Naruto</a></h5>
        <h5><a href="https://jkanime.net/one-piece/">One Piece</a></h5>
      </div>`;
    const results = provider.parseSearch(html);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('naruto');
    expect(results[0].title).toBe('Naruto');
    expect(results[1].id).toBe('one-piece');
    expect(results[1].url).toBe('https://jkanime.net/one-piece/');
  });

  it('parseEpisodes genera 1..N con el máximo encontrado', () => {
    const html = `
      <a href="https://jkanime.net/naruto/1/">1</a>
      <a href="https://jkanime.net/naruto/2/">2</a>
      <a href="https://jkanime.net/naruto/12/">12</a>`;
    const eps = provider.parseEpisodes(html, 'naruto');
    expect(eps).toHaveLength(12);
    expect(eps[0].id).toBe('naruto/1');
    expect(eps[eps.length - 1].number).toBe(12);
  });

  it('parseEpisodes cae al límite 3000 si no hay enlaces', () => {
    const eps = provider.parseEpisodes('<div>no links</div>', 'ghost');
    expect(eps).toHaveLength(3000);
  });
});

describe('AnimeAV1Provider', () => {
  const provider = new AnimeAV1Provider();

  it('parseSearch extrae slug y título del catálogo', () => {
    const html = `
      <a href="/media/one-piece"><span class="sr-only">Ver One Piece</span></a>
      <a href="/media/naruto-shippuden"><span class="sr-only">Ver Naruto Shippuden</span></a>`;
    const results = provider.parseSearch(html);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('one-piece');
    expect(results[0].title).toBe('One Piece');
    expect(results[0].url).toBe('https://animeav1.com/media/one-piece');
    expect(results[1].title).toBe('Naruto Shippuden');
  });

  it('parseEpisodes genera 1..N con el máximo encontrado', () => {
    const html = `
      <a href="/media/one-piece/1">1</a>
      <a href="/media/one-piece/5">5</a>`;
    const eps = provider.parseEpisodes(html, 'one-piece');
    expect(eps).toHaveLength(5);
    expect(eps[0].id).toBe('one-piece/1');
    expect(eps[0].url).toBe('https://animeav1.com/media/one-piece/1');
  });
});
