import { proxyGet, proxyHead } from '../httpProxy';
import { IProvider, ProviderOptions, normalizeBaseUrl } from './IProvider';
import {
  AudioLang,
  PlayMode,
  ProviderAnime,
  ProviderEpisode,
  StreamingSource,
} from '../../types/types';

export class AnimeAV1Provider implements IProvider {
  readonly id: string;
  readonly name: string;
  readonly languages: AudioLang[] = ['es']; // Currently assuming primarily Spanish sub/dub
  readonly supportsDub = true;
  readonly supportsSub = true;

  private baseUrl: string;

  constructor(opts: ProviderOptions = {}) {
    this.id = opts.id ?? 'animeav1';
    this.name = opts.name ?? 'AnimeAV1';
    this.baseUrl = normalizeBaseUrl(opts.baseUrl, 'https://animeav1.com');
  }

  private headers(): Record<string, string> {
    return {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const r = await proxyHead(this.baseUrl, {
        headers: this.headers(),
        timeout: 5000,
      });
      return r.status < 400;
    } catch {
      return false;
    }
  }

  async search(query: string, _dubbed: boolean): Promise<ProviderAnime[]> {
    try {
      const { data } = await proxyGet<string>(
        `${this.baseUrl}/catalogo?search=${encodeURIComponent(query)}`,
        { headers: this.headers(), timeout: 10000 }
      );

      return this.parseSearch(data as string);
    } catch (err) {
      console.error('[AnimeAV1] search failed:', err);
      return [];
    }
  }

  /** Parseo puro del HTML del catálogo (expuesto para tests). */
  parseSearch(html: string): ProviderAnime[] {
    const results: ProviderAnime[] = [];
    const regex = /href="\/media\/([^"]+)"><span class="sr-only">Ver ([^<]+)<\/span>/g;

    let match;
    while ((match = regex.exec(html)) !== null) {
      results.push({
        id: match[1],
        title: match[2].trim(),
        url: `${this.baseUrl}/media/${match[1]}`,
      });
    }
    return results;
  }

  async getEpisodes(slug: string, _dubbed: boolean): Promise<ProviderEpisode[]> {
    // Para simplificar la recoleccion de episodios en un sitio SvelteKit con scroll infinito/paginacion,
    // y como KageView solo necesita resolver el `id` para el episodio específico solicitado por getStreamingSource(),
    // generaremos un array amplio de manera determinista. 
    // Podemos obtener el maximo comprobando la pagina del media.
    try {
      const { data } = await proxyGet<string>(`${this.baseUrl}/media/${slug}`, {
        headers: this.headers(),
        timeout: 10000,
      });
      
      return this.parseEpisodes(data as string, slug);
    } catch (err) {
      console.error('[AnimeAV1] getEpisodes failed:', err);
      return [];
    }
  }

  /** Parseo puro de la página del media (expuesto para tests). */
  parseEpisodes(html: string, slug: string): ProviderEpisode[] {
    let total = 0;
    const rx = new RegExp(`href="/media/${slug}/(\\d+)"`, 'g');
    let m;
    while ((m = rx.exec(html)) !== null) {
      const n = parseInt(m[1]);
      if (n > total) total = n;
    }

    // Fallback seguro si la pagina no lo expone en anchors directamente
    if (total === 0) total = 3000;

    return Array.from({ length: total }, (_, i) => ({
      id: `${slug}/${i + 1}`,
      number: i + 1,
      title: `Episodio ${i + 1}`,
      url: `${this.baseUrl}/media/${slug}/${i + 1}`,
    }));
  }

  async getStreamingSource(episodeId: string, mode: PlayMode): Promise<StreamingSource[]> {
    try {
      const { data } = await proxyGet<string>(
        `${this.baseUrl}/media/${episodeId}`,
        { headers: this.headers(), timeout: 10000 }
      );

      // La página (SvelteKit) embebe la lista completa de servidores:
      // embeds:{SUB:[{server:"HLS",url:"…"},…],LAT:[…]}
      const sources = this.parseEmbeds(data as string, mode);
      if (sources.length > 0) return sources;

      // Fallback al comportamiento antiguo: primer iframe de la página
      const iframeMatch = (data as string).match(/<iframe[^>]*src="([^"]+)"/i);
      if (!iframeMatch) {
        throw new Error('No se encontró servidor en AnimeAV1');
      }
      return [{ url: iframeMatch[1], type: 'iframe', quality: 'auto' }];
    } catch (err) {
      console.error('[AnimeAV1] getStreamingSource failed:', err);
      return [];
    }
  }

  /**
   * Extrae todos los servidores del JSON embebido en la página (expuesto
   * para tests). El servidor "HLS" es el player propio de AnimeAV1
   * (player.zilla-networks.com): su embed se niega a cargar fuera de un
   * iframe ("Content not found."), pero el stream HLS que monta es público
   * y determinista (/m3u8/<id>), así que lo devolvemos como fuente nativa.
   */
  parseEmbeds(html: string, mode: PlayMode): StreamingSource[] {
    const start = html.indexOf('embeds:{');
    if (start === -1) return [];
    // Acotar al bloque de embeds: tras él viene downloads:{SUB:[…]} con la
    // misma estructura (enlaces de descarga, no reproducibles).
    const downloadsIdx = html.indexOf('downloads:{', start);
    const end = downloadsIdx !== -1 ? downloadsIdx : start + 20000;
    const section = html.slice(start, end);

    const byLang: Record<string, Array<{ server: string; url: string }>> = {};
    const langRe = /(SUB|LAT):\[([^\]]*)\]/g;
    let lm: RegExpExecArray | null;
    while ((lm = langRe.exec(section)) !== null) {
      if (byLang[lm[1]]) continue; // primera aparición por idioma gana
      const entries: Array<{ server: string; url: string }> = [];
      const entryRe = /server:"([^"]+)",url:"([^"]+)"/g;
      let em: RegExpExecArray | null;
      while ((em = entryRe.exec(lm[2])) !== null) {
        entries.push({ server: em[1], url: em[2] });
      }
      byLang[lm[1]] = entries;
    }

    const langOrder = mode === 'dub' ? ['LAT', 'SUB'] : ['SUB', 'LAT'];
    let entries: Array<{ server: string; url: string }> = [];
    for (const lang of langOrder) {
      if (byLang[lang]?.length) {
        entries = byLang[lang];
        break;
      }
    }
    if (entries.length === 0) return [];

    const sources: StreamingSource[] = [];
    const iframes: StreamingSource[] = [];

    for (const e of entries) {
      const zilla = e.url.match(/player\.zilla-networks\.com\/play\/([a-f0-9]{32})/);
      if (zilla) {
        // Stream nativo → reproductor propio (controles, progreso, skip)
        sources.push({
          url: `https://player.zilla-networks.com/m3u8/${zilla[1]}`,
          type: 'hls',
          quality: e.server,
        });
      } else {
        iframes.push({ url: e.url, type: 'iframe', quality: e.server });
      }
    }

    // Orden de preferencia para los embeds (más fiables en webview primero)
    const PREFERRED = [
      'yourupload', 'mp4upload', 'sw', 'streamwish', 'streamtape',
      'doodstream', 'vidhide', 'netu', 'mega', 'upnshare', 'terabox',
    ];
    iframes.sort((a, b) => {
      const ai = PREFERRED.indexOf(a.quality.toLowerCase());
      const bi = PREFERRED.indexOf(b.quality.toLowerCase());
      return (ai === -1 ? PREFERRED.length : ai) - (bi === -1 ? PREFERRED.length : bi);
    });

    return [...sources, ...iframes];
  }
}
