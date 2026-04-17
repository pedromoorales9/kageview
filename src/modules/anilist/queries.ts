// ═══════════════════════════════════════════════════════════
// AniList GraphQL Queries
// ═══════════════════════════════════════════════════════════

// Fragmento reutilizado en todas las queries de anime
const ANIME_FRAGMENT = `
  id
  idMal
  title {
    romaji
    english
    native
  }
  coverImage {
    extraLarge
    large
    color
  }
  bannerImage
  description(asHtml: false)
  episodes
  duration
  genres
  averageScore
  status
  season
  seasonYear
  studios {
    nodes {
      name
      isAnimationStudio
    }
  }
  nextAiringEpisode {
    episode
    timeUntilAiring
  }
  mediaListEntry {
    id
    status
    progress
    score
  }
  relations {
    edges {
      relationType(version: 2)
      node {
        id
        title {
          romaji
          english
          native
        }
        coverImage {
          large
          color
        }
        type
        format
        status
        episodes
        averageScore
      }
    }
  }
`;

/** Trending anime */
export const QUERY_TRENDING = `
  query Trending($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        total
        currentPage
        lastPage
        hasNextPage
      }
      media(sort: TRENDING_DESC, type: ANIME) {
        ${ANIME_FRAGMENT}
      }
    }
  }
`;

/** Anime por temporada */
export const QUERY_SEASONAL = `
  query Seasonal($season: MediaSeason, $year: Int, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        total
        currentPage
        lastPage
        hasNextPage
      }
      media(season: $season, seasonYear: $year, sort: POPULARITY_DESC, type: ANIME) {
        ${ANIME_FRAGMENT}
      }
    }
  }
`;

/** Búsqueda de anime con filtros opcionales */
export const QUERY_SEARCH = `
  query Search($search: String, $page: Int, $perPage: Int, $genre_in: [String], $sort: [MediaSort]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        total
        currentPage
        lastPage
        hasNextPage
      }
      media(search: $search, genre_in: $genre_in, sort: $sort, type: ANIME) {
        ${ANIME_FRAGMENT}
      }
    }
  }
`;

/** Detalle completo de un anime */
export const QUERY_ANIME_DETAIL = `
  query AnimeDetail($id: Int) {
    Media(id: $id, type: ANIME) {
      ${ANIME_FRAGMENT}
    }
  }
`;

/** Lista del usuario (Watching, Completed, etc.) */
export const QUERY_USER_LIST = `
  query UserList($userId: Int, $status: MediaListStatus) {
    MediaListCollection(userId: $userId, type: ANIME, status: $status) {
      lists {
        name
        status
        entries {
          id
          status
          progress
          score
          media {
            ${ANIME_FRAGMENT}
          }
        }
      }
    }
  }
`;

/** Datos del usuario autenticado */
export const QUERY_VIEWER = `
  query Viewer {
    Viewer {
      id
      name
      avatar {
        large
      }
    }
  }
`;

/** Top rated anime */
export const QUERY_TOP_RATED = `
  query TopRated($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        total
        currentPage
        lastPage
        hasNextPage
      }
      media(sort: SCORE_DESC, type: ANIME, averageScore_greater: 70) {
        ${ANIME_FRAGMENT}
      }
    }
  }
`;

/** Horario global de episodios en emisión (AiringSchedule) */
export const QUERY_AIRING_SCHEDULE = `
  query AiringSchedule($page: Int, $perPage: Int, $airingAt_greater: Int, $airingAt_lesser: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        total
        currentPage
        lastPage
        hasNextPage
      }
      airingSchedules(
        airingAt_greater: $airingAt_greater, 
        airingAt_lesser: $airingAt_lesser, 
        sort: TIME
      ) {
        id
        airingAt
        episode
        media {
          ${ANIME_FRAGMENT}
        }
      }
    }
  }
`;
