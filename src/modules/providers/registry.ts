// ═══════════════════════════════════════════════════════════
// Registry — Registro de providers + lógica de fallback
// ═══════════════════════════════════════════════════════════

import { IProvider } from './IProvider';
import { AnimeFlvProvider } from './animeflv';
import { JKAnimeProvider } from './jkanime';
import { findBestMatch } from '../titleMatcher';
import {
  ProviderId,
  PlayMode,
  StreamingSource,
  UserPreferences,
  AniListAnime,
} from '../../types/types';

export const PROVIDERS: Record<ProviderId, IProvider> = {
  animeflv: new AnimeFlvProvider(),
  jkanime: new JKAnimeProvider(),
};

/**
 * Busca un anime en un provider específico usando title matching
 * con los títulos de AniList (romaji, english, native)
 */
async function findAnimeInProvider(
  anime: AniListAnime,
  provider: IProvider,
  dubbed = false
): Promise<{ id: string; title: string; url: string } | null> {
  // Intentar con cada variante de título
  const titles = [
    anime.title.romaji,
    anime.title.english,
  ].filter(Boolean) as string[];

  for (const title of titles) {
    try {
      const results = await provider.search(title, dubbed);
      if (results.length === 0) continue;

      const best = findBestMatch(anime, results);
      if (best) return best;
    } catch (err) {
      console.warn(`[Registry] Error buscando "${title}" en ${provider.id}:`, err);
    }
  }
  return null;
}

/**
 * Obtener source de streaming con fallback automático entre providers.
 * Intenta el provider preferido primero, luego los demás en orden.
 */
export async function getSourceWithFallback(
  anime: AniListAnime,
  episodeNumber: number,
  mode: PlayMode,
  prefs: UserPreferences
): Promise<{ source: StreamingSource; providerId: ProviderId } | null> {
  const baseOrder: ProviderId[] = prefs.audioLanguage === 'es'
    ? ['animeflv', 'jkanime']
    : ['animeflv', 'jkanime'];

  // Poner el preferido primero (si existe y está habilitado)
  const order: ProviderId[] = [];
  if (prefs.providersEnabled[prefs.preferredProvider]) {
    order.push(prefs.preferredProvider);
  }

  // Añadir el resto respetando el orden base
  for (const pid of baseOrder) {
    if (pid !== prefs.preferredProvider && prefs.providersEnabled[pid]) {
      order.push(pid);
    }
  }

  for (const pid of order) {
    const provider = PROVIDERS[pid];
    if (!provider || !prefs.providersEnabled[pid]) continue;

    try {
      // Verificar que el provider está operativo
      const healthy = await provider.healthCheck();
      if (!healthy) {
        console.warn(`[Registry] Provider ${pid} no está operativo`);
        continue;
      }

      // Buscar el anime en el provider
      const match = await findAnimeInProvider(anime, provider, mode === 'dub');
      if (!match) {
        console.warn(`[Registry] No se encontró match en ${pid}`);
        continue;
      }

      // Obtener episodios
      const episodes = await provider.getEpisodes(match.id, mode === 'dub');
      const ep = episodes.find((e) => e.number === episodeNumber);
      if (!ep) {
        console.warn(
          `[Registry] Episodio ${episodeNumber} no encontrado en ${pid}`
        );
        continue;
      }

      // Obtener sources de streaming
      const sources = await provider.getStreamingSource(ep.id, mode);
      if (sources.length > 0) {
        console.log(`[Registry] Source obtenido de ${pid}`);
        return { source: sources[0], providerId: pid };
      }
    } catch (err) {
      console.warn(`[Registry] Provider ${pid} falló:`, err);
      if (!prefs.fallbackEnabled) return null;
      continue;
    }
  }

  return null;
}
