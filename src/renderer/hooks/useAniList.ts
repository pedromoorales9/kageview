// ═══════════════════════════════════════════════════════════
// useAniList — Catálogo público de AniList (SIN cuenta)
//
// AniList solo se usa como fuente de datos de anime (tendencias, búsqueda,
// fichas, horario de emisión). Las cuentas, listas y amigos son de KageView
// (Supabase): ver modules/account.ts, library.ts y social.ts.
// ═══════════════════════════════════════════════════════════

import { useCallback } from 'react';
import { gqlRequest } from '../../modules/anilist/client';
import {
  QUERY_TRENDING,
  QUERY_SEASONAL,
  QUERY_SEARCH,
  QUERY_ANIME_DETAIL,
  QUERY_TOP_RATED,
  QUERY_AIRING_SCHEDULE,
  QUERY_MEDIA_BY_IDS,
} from '../../modules/anilist/queries';
import { AniListAnime } from '../../types/types';

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

export default function useAniList() {
  /** Obtener trending animes */
  const getTrending = useCallback(
    async (page = 1, perPage = 20): Promise<AniListAnime[]> => {
      const data = await gqlRequest<PageResult>(
        QUERY_TRENDING,
        { page, perPage }
      );
      return data.Page.media;
    },
    []
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
        { airingAt_greater, airingAt_lesser, page, perPage }
      );
      return data.Page.airingSchedules;
    },
    []
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
        { season, year, page, perPage }
      );
      return data.Page.media;
    },
    []
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
        variables
      );
      return data.Page.media;
    },
    []
  );

  /** Obtener detalle de un anime */
  const getAnimeDetail = useCallback(
    async (id: number): Promise<AniListAnime> => {
      const data = await gqlRequest<DetailResult>(
        QUERY_ANIME_DETAIL,
        { id }
      );
      return data.Media;
    },
    []
  );

  /** Datos ligeros (incluye próximo episodio) de varios animes por id. */
  const getAnimeByIds = useCallback(async (ids: number[]): Promise<AniListAnime[]> => {
    const unique = Array.from(new Set(ids));
    const out: AniListAnime[] = [];
    // AniList admite hasta 50 por página
    for (let i = 0; i < unique.length; i += 50) {
      const chunk = unique.slice(i, i + 50);
      const data = await gqlRequest<PageResult>(QUERY_MEDIA_BY_IDS, {
        ids: chunk,
        perPage: chunk.length,
      });
      out.push(...data.Page.media);
    }
    return out;
  }, []);

  /** Top rated anime */
  const getTopRated = useCallback(
    async (page = 1, perPage = 10): Promise<AniListAnime[]> => {
      const data = await gqlRequest<PageResult>(
        QUERY_TOP_RATED,
        { page, perPage }
      );
      return data.Page.media;
    },
    []
  );

  return {
    getTrending,
    getSeasonal,
    searchAnime,
    getAnimeDetail,
    getTopRated,
    getAnimeByIds,
    getGlobalSchedule,
  };
}
