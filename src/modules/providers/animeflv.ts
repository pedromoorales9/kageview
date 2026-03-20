// ═══════════════════════════════════════════════════════════
// AnimeFLV Provider
// Soporta: ES sub, ES dub
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

export class AnimeFlvProvider implements IProvider {
  readonly id = 'animeflv' as const;
  readonly name = 'AnimeFLV';
  readonly languages: AudioLang[] = ['es', 'ja'];
  readonly supportsDub = true;
  readonly supportsSub = true;

  private baseUrl = 'https://animeflv.net';

  private headers(): Record<string, string> {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
      Referer: 'https://animeflv.net',
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

  async search(query: string, dubbed = false): Promise<ProviderAnime[]> {
    try {
      const { data } = await proxyGet<string>(`${this.baseUrl}/browse`, {
        params: { q: query },
        headers: this.headers(),
        timeout: 10000,
      });
      return this.parseSearch(data as string, dubbed);
    } catch (err) {
      console.error('[AnimeFLV] search failed:', err);
      return [];
    }
  }

  private parseSearch(html: string, _dubbed: boolean): ProviderAnime[] {
    const results: ProviderAnime[] = [];
    const regex = /href="\/anime\/([^"]+)"[^>]*>[\s\S]*?<h3[^>]*class="[^"]*Title[^"]*"[^>]*>([^<]+)<\/h3>/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      results.push({
        id: match[1],
        title: match[2].trim(),
        url: `${this.baseUrl}/anime/${match[1]}`,
      });
    }
    return results;
  }

  async getEpisodes(animeSlug: string): Promise<ProviderEpisode[]> {
    try {
      const { data } = await proxyGet<string>(`${this.baseUrl}/anime/${animeSlug}`, {
        headers: this.headers(),
        timeout: 10000,
      });
      const match = (data as string).match(/var episodes\s*=\s*(\[\[[\s\S]*?\]\])/);
      if (!match) return [];
      const eps: [number, number][] = JSON.parse(match[1]);
      return eps.reverse().map(([num]) => ({
        id: `${animeSlug}-${num}`,
        number: num,
        title: `Episodio ${num}`,
        url: `${this.baseUrl}/ver/${animeSlug}-${num}`,
      }));
    } catch (err) {
      console.error('[AnimeFLV] getEpisodes failed:', err);
      return [];
    }
  }

  async getStreamingSource(episodeId: string, mode: PlayMode): Promise<StreamingSource[]> {
    try {
      const { data } = await proxyGet<string>(`${this.baseUrl}/ver/${episodeId}`, {
        headers: this.headers(),
        timeout: 10000,
      });
      const match = (data as string).match(/var videos\s*=\s*(\{[\s\S]*?\});/);
      if (!match) throw new Error('[AnimeFLV] No se encontraron videos');

      const videos = JSON.parse(match[1]);
      // LAT = Latino doblado, SUB = subtitulado español
      const serverList: Array<{ server?: string; url?: string; code?: string }> = mode === 'dub'
        ? (videos.LAT || videos.SUB || [])
        : (videos.SUB || videos.LAT || []);

      if (!serverList.length) throw new Error('[AnimeFLV] Sin servidores disponibles');

      // Priorizar servidores que dan iframes directos limpios
      const PREFERRED = ['sw', 'fembed', 'okru', 'netu', 'yourupload', 'stape'];
      serverList.sort((a, b) => {
        const aIdx = PREFERRED.indexOf(a.server?.toLowerCase() || '');
        const bIdx = PREFERRED.indexOf(b.server?.toLowerCase() || '');
        if (aIdx === -1 && bIdx === -1) return 0;
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      });

      return serverList
        .filter((s) => s.url || s.code)
        .map((s) => ({
          url: (s.url || s.code) as string,
          type: 'iframe' as const,
          quality: s.server || 'auto',
        }));
    } catch (err) {
      console.error('[AnimeFLV] getStreamingSource failed:', err);
      return [];
    }
  }
}
