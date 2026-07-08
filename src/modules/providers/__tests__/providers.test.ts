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
import { buildProviders } from '../registry';
import { DEFAULT_PREFERENCES } from '../../../types/types';

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

  it('parseEpisodes lee el total de la ficha (estructura 2026)', () => {
    const html = '<li><span>Idiomas:</span> Japonés</li><li><span>Episodios:</span> 12</li>';
    const eps = provider.parseEpisodes(html, 'dandadan');
    expect(eps).toHaveLength(12);
    expect(eps[0].id).toBe('dandadan/1');
  });

  // Fixture con la estructura real de la página del episodio (2026-07):
  // URLs de embeds codificadas en base64 dentro de `var servers`.
  it('parseServers decodifica base64, filtra descargas y ordena por preferencia', () => {
    const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
    const html = `<script>bgservers(); var servers = [
      {"remote":"${b64('https://mediafire.com/file/abc123/\n')}","server":"Mediafire","lang":1},
      {"remote":"${b64('https://mega.nz/embed/XYZ#key')}","server":"Mega","lang":1},
      {"remote":"${b64('https://sfastwish.com/e/hs0vkx')}","server":"Streamwish","lang":1},
      {"remote":"${b64('https://voe.sx/e/xrl53w')}","server":"VOE","lang":1}
    ];</script>`;
    const sources = provider.parseServers(html);
    // Mediafire (descarga) queda fuera; orden: Streamwish → VOE → Mega
    expect(sources.map((s) => s.quality)).toEqual(['Streamwish', 'VOE', 'Mega']);
    expect(sources[0].url).toBe('https://sfastwish.com/e/hs0vkx');
    expect(sources[0].type).toBe('iframe');
    expect(sources[2].url).toBe('https://mega.nz/embed/XYZ#key');
  });

  it('parseServers devuelve [] sin bloque servers o con JSON corrupto', () => {
    expect(provider.parseServers('<html>nada</html>')).toEqual([]);
    expect(provider.parseServers('var servers = [{rota];')).toEqual([]);
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

  // Fixture con la estructura real de la página SvelteKit (2026-07):
  // embeds (reproducibles) seguido de downloads (misma forma, no embeds).
  const EMBEDS_FIXTURE = `mirrors:void 0},embeds:{SUB:[` +
    `{server:"HLS",url:"https://player.zilla-networks.com/play/aced41de84f231b5095a124e19c63f9c"},` +
    `{server:"Mega",url:"https://mega.nz/embed/rNY2RDBI#xl0"},` +
    `{server:"YourUpload",url:"https://www.yourupload.com/embed/H4dQly801Rou"}],` +
    `LAT:[{server:"MP4Upload",url:"https://www.mp4upload.com/embed-lat.html"}]},` +
    `downloads:{SUB:[{server:"Mega",url:"https://mega.nz/file/rNY2RDBI#xl0"},` +
    `{server:"1Fichier",url:"https://1fichier.com/?abc"}]}`;

  it('parseEmbeds convierte el player HLS propio en fuente nativa y ordena embeds', () => {
    const sources = provider.parseEmbeds(EMBEDS_FIXTURE, 'sub');
    expect(sources).toHaveLength(3);
    // El HLS de zilla va primero como stream nativo /m3u8/<id>
    expect(sources[0].type).toBe('hls');
    expect(sources[0].url).toBe('https://player.zilla-networks.com/m3u8/aced41de84f231b5095a124e19c63f9c');
    // YourUpload va antes que Mega en la lista de preferencia
    expect(sources[1].quality).toBe('YourUpload');
    expect(sources[2].quality).toBe('Mega');
    expect(sources[1].type).toBe('iframe');
  });

  it('parseEmbeds ignora la sección downloads y respeta el idioma', () => {
    const sub = provider.parseEmbeds(EMBEDS_FIXTURE, 'sub');
    // Nada de mega.nz/file ni 1fichier (son descargas, no embeds)
    expect(sub.some((s) => s.url.includes('mega.nz/file'))).toBe(false);
    expect(sub.some((s) => s.url.includes('1fichier'))).toBe(false);

    const dub = provider.parseEmbeds(EMBEDS_FIXTURE, 'dub');
    expect(dub).toHaveLength(1);
    expect(dub[0].quality).toBe('MP4Upload');
  });

  it('parseEmbeds devuelve [] si no hay bloque embeds', () => {
    expect(provider.parseEmbeds('<html>sin datos</html>', 'sub')).toEqual([]);
  });
});

describe('Mirrors y sitios personalizados', () => {
  it('los providers aceptan una URL base alternativa', () => {
    const flv = new AnimeFlvProvider({ baseUrl: 'https://clon-flv.tv/' });
    const html = '<article><a href="/anime/naruto"><h3>Naruto</h3></a></article>';
    const results = flv.parseSearch(html);
    // La barra final se normaliza y las URLs apuntan al mirror
    expect(results[0].url).toBe('https://clon-flv.tv/anime/naruto');
  });

  it('JKAnime parsea búsquedas con el dominio del mirror', () => {
    const jk = new JKAnimeProvider({ baseUrl: 'https://jk-espejo.tv' });
    const html = '<h5><a href="https://jk-espejo.tv/naruto/">Naruto</a></h5>';
    const results = jk.parseSearch(html);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('naruto');
    expect(results[0].url).toBe('https://jk-espejo.tv/naruto/');
  });

  it('una URL base inválida cae al dominio oficial', () => {
    const flv = new AnimeFlvProvider({ baseUrl: 'no-es-una-url' });
    const html = '<article><a href="/anime/naruto"><h3>Naruto</h3></a></article>';
    expect(flv.parseSearch(html)[0].url).toBe('https://animeflv.net/anime/naruto');
  });

  it('buildProviders ordena: favorito → integrados → personalizados', () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      customProviders: [
        { id: 'custom-1', name: 'Mi Clon', baseUrl: 'https://clon.tv', template: 'animeflv' as const },
      ],
    };
    const list = buildProviders(prefs);
    expect(list.map((p) => p.id)).toEqual(['animeflv', 'animeav1', 'jkanime', 'custom-1']);
    expect(list[3].name).toBe('Mi Clon');
  });

  it('buildProviders excluye integrados deshabilitados pero mantiene personalizados', () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      providersEnabled: { animeflv: false, jkanime: false, animeav1: true },
      customProviders: [
        { id: 'custom-2', name: 'Otro', baseUrl: 'https://otro.tv', template: 'jkanime' as const },
      ],
    };
    const list = buildProviders(prefs);
    expect(list.map((p) => p.id)).toEqual(['animeav1', 'custom-2']);
  });
});
