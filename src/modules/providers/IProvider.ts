// ═══════════════════════════════════════════════════════════
// IProvider — Interfaz común para todos los providers de anime
// ═══════════════════════════════════════════════════════════

import {
  ProviderId,
  AudioLang,
  PlayMode,
  ProviderAnime,
  ProviderEpisode,
  StreamingSource,
} from '../../types/types';

export interface IProvider {
  readonly id: ProviderId;
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
