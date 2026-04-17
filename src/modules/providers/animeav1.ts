import { proxyGet, proxyHead } from '../httpProxy';
import { IProvider } from './IProvider';
import {
  AudioLang,
  PlayMode,
  ProviderAnime,
  ProviderEpisode,
  StreamingSource,
} from '../../types/types';

export class AnimeAV1Provider implements IProvider {
  readonly id = 'animeav1' as const;
  readonly name = 'AnimeAV1';
  readonly languages: AudioLang[] = ['es']; // Currently assuming primarily Spanish sub/dub
  readonly supportsDub = true;
  readonly supportsSub = true;

  private baseUrl = 'https://animeav1.com';

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

      const results: ProviderAnime[] = [];
      const regex = /href="\/media\/([^"]+)"><span class="sr-only">Ver ([^<]+)<\/span>/g;
      
      let match;
      while ((match = regex.exec(data)) !== null) {
        results.push({
          id: match[1],
          title: match[2].trim(),
          url: `${this.baseUrl}/media/${match[1]}`,
        });
      }
      return results;
    } catch (err) {
      console.error('[AnimeAV1] search failed:', err);
      return [];
    }
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
      
      let total = 0;
      const rx = new RegExp(`href="/media/${slug}/(\\d+)"`, 'g');
      let m;
      while ((m = rx.exec(data as string)) !== null) {
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
    } catch (err) {
      console.error('[AnimeAV1] getEpisodes failed:', err);
      return [];
    }
  }

  async getStreamingSource(episodeId: string, _mode: PlayMode): Promise<StreamingSource[]> {
    try {
      const { data } = await proxyGet<string>(
        `${this.baseUrl}/media/${episodeId}`,
        { headers: this.headers(), timeout: 10000 }
      );
      
      // Buscar iframes provistos por la web
      const iframeMatch = data.match(/<iframe[^>]*src="([^"]+)"/i);
      
      if (!iframeMatch) {
         throw new Error('No se encontró servidor en AnimeAV1');
      }

      return [
        {
          url: iframeMatch[1],
          type: 'iframe',
          quality: 'auto',
        }
      ];
    } catch (err) {
      console.error('[AnimeAV1] getStreamingSource failed:', err);
      return [];
    }
  }
}
