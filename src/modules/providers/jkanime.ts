// ═══════════════════════════════════════════════════════════
// JKAnime Provider
// Soporta: ES dub, ES sub
// ═══════════════════════════════════════════════════════════

import { proxyGet, proxyHead } from '../httpProxy';
import { IProvider, ProviderOptions, normalizeBaseUrl } from './IProvider';
import {
  AudioLang,
  PlayMode,
  ProviderAnime,
  ProviderEpisode,
  StreamingSource,
} from '../../types/types';

export class JKAnimeProvider implements IProvider {
  readonly id: string;
  readonly name: string;
  readonly languages: AudioLang[] = ['es'];
  readonly supportsDub = true;
  readonly supportsSub = true;

  private baseUrl: string;

  constructor(opts: ProviderOptions = {}) {
    this.id = opts.id ?? 'jkanime';
    this.name = opts.name ?? 'JKAnime';
    this.baseUrl = normalizeBaseUrl(opts.baseUrl, 'https://jkanime.net');
  }

  private headers(): Record<string, string> {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
      Referer: this.baseUrl,
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
      
      return this.parseSearch(data as string);
    } catch (err) {
      console.error('[JKAnime] search failed:', err);
      return [];
    }
  }

  /** Parseo puro del HTML de búsqueda (expuesto para tests). */
  parseSearch(html: string): ProviderAnime[] {
    const results: ProviderAnime[] = [];
    // El dominio del enlace depende de la URL base (mirrors/clones)
    const host = this.baseUrl
      .replace(/^https?:\/\//, '')
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `<a\\s+href="https?:\\/\\/${host}\\/([^/]+)\\/">([^<]+)<\\/a><\\/h5>`,
      'g'
    );
    let match;
    while ((match = regex.exec(html)) !== null) {
      results.push({
        id: match[1],
        title: match[2].trim(),
        url: `${this.baseUrl}/${match[1]}/`,
      });
    }
    return results;
  }

  async getEpisodes(slug: string): Promise<ProviderEpisode[]> {
    try {
      const { data } = await proxyGet<string>(`${this.baseUrl}/${slug}/`, {
        headers: this.headers(),
        timeout: 10000,
      });
      return this.parseEpisodes(data as string, slug);
    } catch (err) {
      console.error('[JKAnime] getEpisodes failed:', err);
      return [];
    }
  }

  /** Parseo puro de la página del anime (expuesto para tests). */
  parseEpisodes(html: string, slug: string): ProviderEpisode[] {
    // La ficha del anime declara el total: <li><span>Episodios:</span> 12</li>
    let total = 0;
    const infoMatch = html.match(/Episodios:<\/span>\s*(\d+)/i);
    if (infoMatch) total = parseInt(infoMatch[1]);

    // Alternativa: enlaces de episodios en el HTML (estructura antigua)
    if (total === 0) {
      const rx = new RegExp(`href="[^"]*/${slug}/(\\d+)[/"]`, 'g');
      let m;
      while ((m = rx.exec(html)) !== null) {
        const n = parseInt(m[1]);
        if (n > total) total = n;
      }
    }
    // Si no logramos parsearlo, asumimos un límite alto porque
    // KageView solo necesita generar el ID para consultar el getStreamingSource
    if (total === 0) total = 3000;

    return Array.from({ length: total }, (_, i) => ({
      id: `${slug}/${i + 1}`,
      number: i + 1,
      title: `Episodio ${i + 1}`,
      url: `${this.baseUrl}/${slug}/${i + 1}`,
    }));
  }

  async getStreamingSource(episodeId: string, _mode: PlayMode): Promise<StreamingSource[]> {
    try {
      // Estructura actual (2026): la propia página del episodio embebe
      // `var servers = [...]` con las URLs de los embeds en base64.
      const { data } = await proxyGet<string>(`${this.baseUrl}/${episodeId}/`, {
        headers: this.headers(),
        timeout: 10000,
      });
      const fromPage = this.parseServers(data as string);
      if (fromPage.length > 0) return fromPage;

      // Estructura antigua: endpoint JSON /stream/ (mirrors desactualizados)
      const legacy = await proxyGet<any>(`${this.baseUrl}/stream/${episodeId}/`, {
        headers: this.headers(),
        timeout: 10000,
      });
      const json = typeof legacy.data === 'string' ? JSON.parse(legacy.data) : legacy.data;
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

  /**
   * Extrae los servidores del `var servers = [...]` de la página del
   * episodio (expuesto para tests). Cada entrada lleva la URL del embed
   * codificada en base64 en el campo `remote`.
   */
  parseServers(html: string): StreamingSource[] {
    const m = html.match(/var servers\s*=\s*(\[[\s\S]*?\]);/);
    if (!m) return [];

    let entries: Array<{ remote?: string; server?: string }> = [];
    try {
      entries = JSON.parse(m[1]);
    } catch {
      return [];
    }

    const decoded = entries
      .map((e) => {
        let url = '';
        try {
          url = atob(e.remote ?? '').trim();
        } catch { /* base64 corrupto: descartar */ }
        return { url, server: e.server ?? 'auto' };
      })
      .filter((e) => /^https?:\/\//.test(e.url))
      // Páginas de descarga: no reproducibles en un iframe
      .filter((e) => !/mediafire\.com\/file/i.test(e.url));

    // Embeds más fiables en webview primero
    const PREFERRED = [
      'streamwish', 'voe', 'filemoon', 'vidhide', 'mp4upload',
      'streamtape', 'doodstream', 'mixdrop', 'mega',
    ];
    const rank = (server: string) => {
      const i = PREFERRED.indexOf(server.toLowerCase());
      return i === -1 ? PREFERRED.length : i;
    };
    decoded.sort((a, b) => rank(a.server) - rank(b.server));

    return decoded.map((e) => ({
      url: e.url,
      type: 'iframe' as const,
      quality: e.server,
    }));
  }
}
