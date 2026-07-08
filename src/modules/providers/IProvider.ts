// ═══════════════════════════════════════════════════════════
// IProvider — Interfaz común para todos los providers de anime
// ═══════════════════════════════════════════════════════════

import {
  AudioLang,
  PlayMode,
  ProviderAnime,
  ProviderEpisode,
  StreamingSource,
} from '../../types/types';

/** Overrides para instanciar un provider contra un mirror o sitio clon. */
export interface ProviderOptions {
  id?: string;
  name?: string;
  baseUrl?: string;
}

/** Normaliza una URL base de usuario: sin barra final ni espacios. */
export function normalizeBaseUrl(url: string | undefined, fallback: string): string {
  const trimmed = (url ?? '').trim().replace(/\/+$/, '');
  return /^https?:\/\/./.test(trimmed) ? trimmed : fallback;
}

export interface IProvider {
  /** Id de provider integrado ('animeflv'…) o de uno personalizado ('custom-…'). */
  readonly id: string;
  readonly name: string;
  readonly languages: AudioLang[];
  readonly supportsDub: boolean;
  readonly supportsSub: boolean;

  /** Busca anime por texto, devuelve lista de resultados del provider */
  search(query: string, dubbed?: boolean): Promise<ProviderAnime[]>;

  /** Obtiene la lista de episodios dado el ID del provider */
  getEpisodes(animeId: string, dubbed?: boolean): Promise<ProviderEpisode[]>;

  /** Obtiene la URL de streaming de un episodio concreto */
  getStreamingSource(
    episodeId: string,
    mode: PlayMode,
    lang?: AudioLang
  ): Promise<StreamingSource[]>;

  /** Verifica en <=3s si el provider está operativo */
  healthCheck(): Promise<boolean>;
}
