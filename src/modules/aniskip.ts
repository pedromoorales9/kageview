// ═══════════════════════════════════════════════════════════
// AniSkip — Obtener timestamps para skip de intro/outro
// Usa MAL IDs (no AniList IDs)
// ═══════════════════════════════════════════════════════════

import { proxyGet } from './httpProxy';
import { SkipTime } from '../types/types';

const BASE = 'https://api.aniskip.com/v2';

/**
 * Obtiene los tiempos de skip para un episodio específico.
 * @param malId — ID de MyAnimeList (no AniList)
 * @param episode — Número del episodio
 * @param duration — Duración total del episodio en segundos
 */
export async function getSkipTimes(
  malId: number,
  episode: number,
  duration: number
): Promise<SkipTime[]> {
  try {
    const { data } = await proxyGet<{
      found: boolean;
      results: SkipTime[];
    }>(`${BASE}/skip-times/${malId}/${episode}`, {
      params: {
        types: ['op', 'ed'],
        episodeLength: duration,
      },
      timeout: 5000,
    });
    const typed = data as { found: boolean; results: SkipTime[] };
    return typed.found ? typed.results : [];
  } catch (err) {
    console.warn('[AniSkip] Error obteniendo skip times:', err);
    return [];
  }
}
