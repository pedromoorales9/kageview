// ═══════════════════════════════════════════════════════════
// useProvider — Hook para obtener streams con fallback
// ═══════════════════════════════════════════════════════════

import { useState, useCallback } from 'react';
import { getSourceWithFallback } from '../../modules/providers/registry';
import { useAppStore } from '../../modules/store';
import { AniListAnime, StreamingSource, ProviderId, PlayMode } from '../../types/types';

interface UseProviderResult {
  source: StreamingSource | null;
  loading: boolean;
  error: string | null;
  providerUsed: ProviderId | null;
  loadSource: (anime: AniListAnime, episode: number, mode: PlayMode) => Promise<void>;
}

export default function useProvider(): UseProviderResult {
  const prefs = useAppStore((s) => s.prefs);
  const setCurrentSource = useAppStore((s) => s.setCurrentSource);

  const [source, setSource] = useState<StreamingSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerUsed, setProviderUsed] = useState<ProviderId | null>(null);

  const loadSource = useCallback(
    async (anime: AniListAnime, episode: number, mode: PlayMode) => {
      try {
        setLoading(true);
        setError(null);
        setSource(null);
        setProviderUsed(null);

        const result = await getSourceWithFallback(anime, episode, mode, prefs);

        if (result) {
          setSource(result.source);
          setProviderUsed(result.providerId);
          setCurrentSource(result.source);
        } else {
          setError('No streaming source found. All providers failed.');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(`Failed to load stream: ${message}`);
        console.error('[useProvider] Error:', err);
      } finally {
        setLoading(false);
      }
    },
    [prefs, setCurrentSource]
  );

  return { source, loading, error, providerUsed, loadSource };
}
