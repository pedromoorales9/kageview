// ═══════════════════════════════════════════════════════════
// JKAnime Provider
// Soporta: ES dub, ES sub
// ═══════════════════════════════════════════════════════════

import { proxyGet, proxyHead } from '../httpProxy';
import { IProvider } from './IProvider';
import {
  AudioLang,
  PlayMode,
  ProviderAnime,
  ProviderEpisode,
  StreamingSource,
} from '../../types/types';

export class JKAnimeProvider implements IProvider {
  readonly id = 'jkanime' as const;
  readonly name = 'JKAnime';
  readonly languages: AudioLang[] = ['es'];
  readonly supportsDub = true;
  readonly supportsSub = true;

  private baseUrl = 'https://jkanime.net';

  private headers(): Record<string, string> {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
      Referer: 'https://jkanime.net',
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

  async search(query: string): Promise<ProviderAnime[]> {
    try {
      const { data } = await proxyGet<string>(
        `${this.baseUrl}/buscar/${encodeURIComponent(query)}/`,
        { headers: this.headers(), timeout: 10000 }
      );
      
      const results: ProviderAnime[] = [];
      const regex = /<a\s+href="https:\/\/jkanime\.net\/([^/]+)\/">([^<]+)<\/a><\/h5>/g;
      let match;
      while ((match = regex.exec(data)) !== null) {
        results.push({
          id: match[1],
          title: match[2].trim(),
          url: `${this.baseUrl}/${match[1]}/`,
        });
      }
      return results;
    } catch (err) {
      console.error('[JKAnime] search failed:', err);
      return [];
    }
  }

  async getEpisodes(slug: string): Promise<ProviderEpisode[]> {
    try {
      const { data } = await proxyGet<string>(`${this.baseUrl}/${slug}/`, {
        headers: this.headers(),
        timeout: 10000,
      });
      const match = (data as string).match(/episodios.*?(\d+)/i);
      const total = match ? parseInt(match[1]) : 0;
      if (!total) throw new Error('[JKAnime] No se encontró total de episodios');

      return Array.from({ length: total }, (_, i) => ({
        id: `${slug}/${i + 1}`,
        number: i + 1,
        title: `Episodio ${i + 1}`,
        url: `${this.baseUrl}/${slug}/${i + 1}`,
      }));
    } catch (err) {
      console.error('[JKAnime] getEpisodes failed:', err);
      return [];
    }
  }

  async getStreamingSource(episodeId: string, _mode: PlayMode): Promise<StreamingSource[]> {
    try {
      const { data } = await proxyGet<any>(`${this.baseUrl}/stream/${episodeId}/`, {
        headers: this.headers(),
        timeout: 10000,
      });
      const json = typeof data === 'string' ? JSON.parse(data) : data;
      const servers: any[] = json.servers || json.fuentes || [];
      if (!servers.length) throw new Error('[JKAnime] Sin servidores');

      return servers
        .filter((s) => s.remote || s.url)
        .map((s) => ({
          url: s.remote || s.url,
          type: 'iframe' as const,
          quality: 'auto',
        }));
    } catch (err) {
      console.error('[JKAnime] getStreamingSource failed:', err);
      return [];
    }
  }
}
