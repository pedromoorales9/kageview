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
 * @param duration — Duración total del episodio en segundos (0 = auto)
 */
export async function getSkipTimes(
  malId: number,
  episode: number,
  duration: number
): Promise<SkipTime[]> {
  try {
    // Construir URL con query params manualmente para evitar
    // problemas de serialización de arrays en el proxy
    const url = `${BASE}/skip-times/${malId}/${episode}?types=op&types=ed&episodeLength=${duration}`;

    const { data } = await proxyGet<{
      found: boolean;
      results: SkipTime[];
      message: string;
      statusCode: number;
    }>(url, {
      timeout: 5000,
    });
    const typed = data as { found: boolean; results: SkipTime[] };
    if (typed.found && typed.results?.length > 0) {
      console.log(`[AniSkip] Encontrados ${typed.results.length} skip times para MAL:${malId} EP:${episode}`);
      return typed.results;
    }
    console.log(`[AniSkip] No se encontraron skip times para MAL:${malId} EP:${episode}`);
    return [];
  } catch (err) {
    console.warn('[AniSkip] Error obteniendo skip times:', err);
    return [];
  }
}

