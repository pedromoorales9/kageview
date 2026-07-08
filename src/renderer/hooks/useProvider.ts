// ═══════════════════════════════════════════════════════════
// useProvider — Hook para obtener streams con fallback
// ═══════════════════════════════════════════════════════════

import { useState, useCallback, useRef } from 'react';
import { getSourceWithFallback } from '../../modules/providers/registry';
import { useAppStore } from '../../modules/store';
import { AniListAnime, StreamingSource, ProviderId, PlayMode } from '../../types/types';

interface UseProviderResult {
  source: StreamingSource | null;
  loading: boolean;
  error: string | null;
  providerUsed: string | null;
  loadSource: (anime: AniListAnime, episode: number, mode: PlayMode) => Promise<void>;
  /**
   * Salta al siguiente servidor disponible del episodio actual.
   * Devuelve false si ya no quedan servidores (y deja `error` puesto).
   */
  tryNextSource: () => boolean;
}

export default function useProvider(): UseProviderResult {
  const prefs = useAppStore((s) => s.prefs);
  const setCurrentSource = useAppStore((s) => s.setCurrentSource);

  const [sources, setSources] = useState<StreamingSource[]>([]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerUsed, setProviderUsed] = useState<string | null>(null);

  // Refs para que tryNextSource sea estable aunque se llame desde callbacks
  // del reproductor (evita cierres obsoletos).
  const sourcesRef = useRef<StreamingSource[]>([]);
  const indexRef = useRef(0);

  const loadSource = useCallback(
    async (anime: AniListAnime, episode: number, mode: PlayMode) => {
      try {
        setLoading(true);
        setError(null);
        setSources([]);
        setSourceIndex(0);
        sourcesRef.current = [];
        indexRef.current = 0;
        setProviderUsed(null);

        const result = await getSourceWithFallback(anime, episode, mode, prefs);

        if (result && result.sources.length > 0) {
          sourcesRef.current = result.sources;
          indexRef.current = 0;
          setSources(result.sources);
          setSourceIndex(0);
          setProviderUsed(result.providerId);
          setCurrentSource(result.sources[0]);
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

  const tryNextSource = useCallback((): boolean => {
    const next = indexRef.current + 1;
    if (next < sourcesRef.current.length) {
      indexRef.current = next;
      setSourceIndex(next);
      setCurrentSource(sourcesRef.current[next]);
      console.warn(`[useProvider] Servidor caído; probando el ${next + 1}/${sourcesRef.current.length}`);
      return true;
    }
    // Sin más servidores: vaciar para desmontar el player y mostrar el error.
    sourcesRef.current = [];
    indexRef.current = 0;
    setSources([]);
    setSourceIndex(0);
    setError('No streaming source found. All servers failed.');
    return false;
  }, [setCurrentSource]);

  return {
    source: sources[sourceIndex] ?? null,
    loading,
    error,
    providerUsed,
    loadSource,
    tryNextSource,
  };
}
