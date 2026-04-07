// ═══════════════════════════════════════════════════════════
// useAniList — Hook centralizado para AniList API
// ═══════════════════════════════════════════════════════════

import { useCallback } from 'react';
import { proxyPost } from '../../modules/httpProxy';
import { gqlRequest } from '../../modules/anilist/client';
import {
  QUERY_TRENDING,
  QUERY_SEASONAL,
  QUERY_SEARCH,
  QUERY_ANIME_DETAIL,
  QUERY_USER_LIST,
  QUERY_VIEWER,
  QUERY_TOP_RATED,
  QUERY_AIRING_SCHEDULE,
} from '../../modules/anilist/queries';
import { MUTATION_SAVE_PROGRESS, MUTATION_SAVE_SCORE } from '../../modules/anilist/mutations';
import { clientData } from '../../modules/clientData';
import { useAppStore } from '../../modules/store';
import { AniListAnime, AniListViewer } from '../../types/types';

interface PageResult {
  Page: {
    pageInfo: {
      total: number;
      currentPage: number;
      lastPage: number;
      hasNextPage: boolean;
    };
    media: AniListAnime[];
  };
}

interface DetailResult {
  Media: AniListAnime;
}

interface ScheduleResult {
  Page: {
    pageInfo: {
      hasNextPage: boolean;
    };
    airingSchedules: Array<{
      id: number;
      airingAt: number;
      episode: number;
      media: AniListAnime;
    }>;
  };
}

interface ViewerResult {
  Viewer: AniListViewer;
}

interface MediaListResult {
  MediaListCollection: {
    lists: Array<{
      name: string;
      status: string;
      entries: Array<{
        id: number;
        status: string;
        progress: number;
        score: number;
        media: AniListAnime;
      }>;
    }>;
  };
}

export default function useAniList() {
  const token = useAppStore((s) => s.token);
  const setToken = useAppStore((s) => s.setToken);
  const setUser = useAppStore((s) => s.setUser);
  const user = useAppStore((s) => s.user);

  /** Obtener trending animes */
  const getTrending = useCallback(
    async (page = 1, perPage = 20): Promise<AniListAnime[]> => {
      const data = await gqlRequest<PageResult>(
        QUERY_TRENDING,
        { page, perPage },
        token || undefined
      );
      return data.Page.media;
    },
    [token]
  );

  /** Obtener el horario global de emisión de todos los animes */
  const getGlobalSchedule = useCallback(
    async (
      airingAt_greater: number,
      airingAt_lesser: number,
      page = 1,
      perPage = 50
    ): Promise<ScheduleResult['Page']['airingSchedules']> => {
      const data = await gqlRequest<ScheduleResult>(
        QUERY_AIRING_SCHEDULE,
        { airingAt_greater, airingAt_lesser, page, perPage },
        token || undefined
      );
      return data.Page.airingSchedules;
    },
    [token]
  );

  /** Obtener anime por temporada */
  const getSeasonal = useCallback(
    async (
      season: string,
      year: number,
      page = 1,
      perPage = 20
    ): Promise<AniListAnime[]> => {
      const data = await gqlRequest<PageResult>(
        QUERY_SEASONAL,
        { season, year, page, perPage },
        token || undefined
      );
      return data.Page.media;
    },
    [token]
  );

  /** Buscar anime */
  const searchAnime = useCallback(
    async (
      query: string,
      page = 1,
      perPage = 20,
      genres?: string[]
    ): Promise<AniListAnime[]> => {
      const variables: Record<string, unknown> = { page, perPage };
      
      if (query.trim()) {
        variables.search = query.trim();
        variables.sort = ['SEARCH_MATCH'];
      } else {
        variables.sort = ['TRENDING_DESC']; // Default sort if just browsing by genre
      }
      
      if (genres && genres.length > 0) {
        variables.genre_in = genres;
      }

      const data = await gqlRequest<PageResult>(
        QUERY_SEARCH,
        variables,
        token || undefined
      );
      return data.Page.media;
    },
    [token]
  );

  /** Obtener detalle de un anime */
  const getAnimeDetail = useCallback(
    async (id: number): Promise<AniListAnime> => {
      const data = await gqlRequest<DetailResult>(
        QUERY_ANIME_DETAIL,
        { id },
        token || undefined
      );
      return data.Media;
    },
    [token]
  );

  /** Obtener lista del usuario */
  const getUserList = useCallback(
    async (status?: string): Promise<AniListAnime[]> => {
      if (!token || !user) return [];
      const data = await gqlRequest<MediaListResult>(
        QUERY_USER_LIST,
        { userId: user.id, status },
        token
      );
      const allEntries = data.MediaListCollection.lists.flatMap((list) =>
        list.entries.map((entry) => ({
          ...entry.media,
          mediaListEntry: {
            id: entry.id,
            status: entry.status as AniListAnime['mediaListEntry'] extends null
              ? never
              : NonNullable<AniListAnime['mediaListEntry']>['status'],
            progress: entry.progress,
            score: entry.score,
          },
        }))
      );
      return allEntries as AniListAnime[];
    },
    [token, user]
  );

  /** Top rated anime */
  const getTopRated = useCallback(
    async (page = 1, perPage = 10): Promise<AniListAnime[]> => {
      const data = await gqlRequest<PageResult>(
        QUERY_TOP_RATED,
        { page, perPage },
        token || undefined
      );
      return data.Page.media;
    },
    [token]
  );

  /** Guardar progreso de episodio */
  const saveProgress = useCallback(
    async (mediaId: number, progress: number, status = 'CURRENT') => {
      if (!token) return;
      await gqlRequest(
        MUTATION_SAVE_PROGRESS,
        { mediaId, progress, status },
        token
      );
    },
    [token]
  );

  /** Cambiar estado en la lista (Viendo, Por Ver, Completado, etc.) */
  const updateListStatus = useCallback(
    async (mediaId: number, status: string) => {
      if (!token) return;
      await gqlRequest(
        MUTATION_SAVE_PROGRESS,
        { mediaId, status },
        token
      );
    },
    [token]
  );

  /** Guardar puntuación */
  const saveScore = useCallback(
    async (mediaId: number, score: number) => {
      if (!token) return;
      await gqlRequest(MUTATION_SAVE_SCORE, { mediaId, score }, token);
    },
    [token]
  );

  /** Login: intercambiar authorization code por token */
  const login = useCallback(
    async (code: string) => {
      try {
        const { data } = await proxyPost<{
          access_token: string;
          token_type: string;
          expires_in: number;
        }>('https://anilist.co/api/v2/oauth/token', {
          grant_type: 'authorization_code',
          client_id: clientData.clientId,
          client_secret: clientData.clientSecret,
          redirect_uri: clientData.redirectUri,
          code,
        }, {
          headers: { 'Content-Type': 'application/json' },
        });

        const typed = data as { access_token: string; token_type: string; expires_in: number };
        const tokenValue = typed.access_token;
        setToken(tokenValue);

        // Guardar en electron-store
        if (window.electron) {
           await window.electron.setStore('token', {
            access_token: tokenValue,
            token_type: typed.token_type,
            expires_in: typed.expires_in,
            expiry: Date.now() + typed.expires_in * 1000,
          });
        }

        // Obtener datos del usuario autenticado
        const viewer = await gqlRequest<ViewerResult>(
          QUERY_VIEWER,
          {},
          tokenValue
        );
        setUser(viewer.Viewer);
      } catch (err) {
        console.error('[useAniList] Login error:', err);
        throw err;
      }
    },
    [setToken, setUser]
  );

  /** Logout */
  const logout = useCallback(async () => {
    setToken(null);
    setUser(null);
    if (window.electron) {
      await window.electron.setStore('token', null);
    }
  }, [setToken, setUser]);

  /** Inicializar sesión desde token persistido */
  const initSession = useCallback(async () => {
    try {
      if (!window.electron) return;
      const stored = (await window.electron.getStore('token')) as {
        access_token: string;
        expiry: number;
      } | null;

      if (stored && stored.access_token && stored.expiry > Date.now()) {
        setToken(stored.access_token);
        const viewer = await gqlRequest<ViewerResult>(
          QUERY_VIEWER,
          {},
          stored.access_token
        );
        setUser(viewer.Viewer);
      }
    } catch (err) {
      console.warn('[useAniList] Failed to restore session:', err);
    }
  }, [setToken, setUser]);

  return {
    getTrending,
    getSeasonal,
    searchAnime,
    getAnimeDetail,
    getUserList,
    getTopRated,
    saveProgress,
    updateListStatus,
    saveScore,
    login,
    logout,
    initSession,
    getGlobalSchedule,
  };
}
