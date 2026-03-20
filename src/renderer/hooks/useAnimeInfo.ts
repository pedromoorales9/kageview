// ═══════════════════════════════════════════════════════════
// useAnimeInfo — Obtener episodios y thumbnails desde AniZip
// ═══════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import axios from 'axios';
import { AniZipEpisode } from '../../types/types';

interface UseAnimeInfoResult {
  episodes: AniZipEpisode[];
  loading: boolean;
  error: string | null;
}

// Cache en sesión por anilistId
const sessionCache: Record<number, AniZipEpisode[]> = {};

export default function useAnimeInfo(anilistId: number): UseAnimeInfoResult {
  const [episodes, setEpisodes] = useState<AniZipEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!anilistId) {
      setLoading(false);
      return;
    }

    // Usar cache si disponible
    if (sessionCache[anilistId]) {
      setEpisodes(sessionCache[anilistId]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchInfo() {
      try {
        setLoading(true);
        setError(null);

        const { data } = await axios.get(
          `https://api.ani.zip/mappings?anilist_id=${anilistId}`,
          { timeout: 10000 }
        );

        if (cancelled) return;

        if (data?.episodes) {
          const episodeMap = data.episodes as Record<string, {
            title?: { en?: string; ja?: string };
            image?: string;
            airdate?: string;
            length?: number;
            overview?: string;
          }>;

          const eps: AniZipEpisode[] = Object.entries(episodeMap)
            .filter(([key]) => !isNaN(Number(key)) && Number(key) > 0)
            .map(([key, val]) => ({
              episodeNumber: parseInt(key, 10),
              title: {
                en: val.title?.en || null,
                ja: val.title?.ja || null,
              },
              image: val.image || null,
              airdate: val.airdate || null,
              length: val.length || null,
              overview: val.overview || null,
            }))
            .sort((a, b) => a.episodeNumber - b.episodeNumber);

          sessionCache[anilistId] = eps;
          setEpisodes(eps);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[useAnimeInfo] Error:', err);
          setError('Failed to load episode info');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchInfo();
    return () => { cancelled = true; };
  }, [anilistId]);

  return { episodes, loading, error };
}
