// ═══════════════════════════════════════════════════════════
// Title Matcher — Levenshtein distance para emparejar
// títulos de AniList con resultados de providers
// ═══════════════════════════════════════════════════════════

import { distance } from 'fastest-levenshtein';
import { AniListAnime, ProviderAnime } from '../types/types';

/** Normaliza un título para comparación: minúsculas, sin caracteres especiales */
export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Calcula similitud entre 0 y 1 usando distancia de Levenshtein */
export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - distance(na, nb) / maxLen;
}

/**
 * Devuelve el mejor match de results para el anime de AniList.
 * Compara contra romaji, english y native titles.
 * @param threshold — similaridad mínima (0-1), por defecto 0.7
 */
export function findBestMatch(
  anime: AniListAnime,
  results: ProviderAnime[],
  threshold = 0.7
): ProviderAnime | null {
  const titles = [
    anime.title.romaji,
    anime.title.english,
    anime.title.native,
  ].filter(Boolean) as string[];

  let best: ProviderAnime | null = null;
  let bestScore = 0;

  for (const result of results) {
    for (const title of titles) {
      const score = titleSimilarity(title, result.title);
      if (score > bestScore) {
        bestScore = score;
        best = result;
      }
    }
  }

  return bestScore >= threshold ? best : null;
}
