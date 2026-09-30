// ═══════════════════════════════════════════════════════════
// KageView — Tipos TypeScript centralizados
// ═══════════════════════════════════════════════════════════

// ─── Anime Relations ──────────────────────────────────────
export type RelationType =
  | 'ADAPTATION' | 'PREQUEL' | 'SEQUEL' | 'PARENT'
  | 'SIDE_STORY' | 'CHARACTER' | 'SUMMARY' | 'ALTERNATIVE'
  | 'SPIN_OFF' | 'OTHER' | 'SOURCE' | 'COMPILATION' | 'CONTAINS';

export interface AnimeRelationNode {
  id: number;
  title: { romaji: string; english: string | null; native: string };
  coverImage: { large: string; color: string | null };
  type: string;
  format: string | null;
  status: string;
  episodes: number | null;
  averageScore: number | null;
}

export interface AnimeRelationEdge {
  relationType: RelationType;
  node: AnimeRelationNode;
}

export interface AnimeRelations {
  edges: AnimeRelationEdge[];
}

// ─── AniList Anime ────────────────────────────────────────
export interface AniListAnime {
  id: number;
  idMal: number | null;
  title: {
    romaji: string;
    english: string | null;
    native: string;
  };
  coverImage: {
    extraLarge: string;
    large: string;
    color: string | null;
  };
  bannerImage: string | null;
  description: string | null;
  episodes: number | null;
  duration: number | null;
  genres: string[];
  averageScore: number | null;
  status: 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED';
  season: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL' | null;
  seasonYear: number | null;
  studios: {
    nodes: { name: string; isAnimationStudio: boolean }[];
  };
  nextAiringEpisode: {
    episode: number;
    timeUntilAiring: number;
  } | null;
  mediaListEntry: MediaListEntry | null;
  relations?: AnimeRelations;
}

// ─── Media List Entry ─────────────────────────────────────
export interface MediaListEntry {
  id: number;
  status: 'CURRENT' | 'COMPLETED' | 'PAUSED' | 'DROPPED' | 'PLANNING' | 'REPEATING';
  progress: number;
  score: number;
}

// ─── AniZip Episode ───────────────────────────────────────
export interface AniZipEpisode {
  episodeNumber: number;
  title: { en: string | null; ja: string | null };
  image: string | null;
  airdate: string | null;
  length: number | null;
  overview: string | null;
}

// ─── Provider Types ───────────────────────────────────────
export interface ProviderAnime {
  id: string;
  title: string;
  url: string;
}

export interface ProviderEpisode {
  id: string;
  number: number;
  title: string | null;
  url: string;
}

export interface StreamingSource {
  url: string;
  type: 'hls' | 'mp4' | 'iframe';
  quality: string;
  subtitles?: SubtitleTrack[];
}

export interface SubtitleTrack {
  url: string;
  lang: string;
  label: string;
}

export type ProviderId = 'animeflv' | 'jkanime' | 'animeav1';

/**
 * Provider de anime definido por el usuario: un sitio alternativo que usa
 * la misma estructura HTML que uno de los providers integrados (clones y
 * mirrors de AnimeFLV/JKAnime/AnimeAV1 son muy comunes). Declarativo a
 * propósito: no se ejecuta código de terceros.
 */
export interface CustomProviderDef {
  /** Id interno único, p. ej. "custom-1751900000000". */
  id: string;
  /** Nombre visible elegido por el usuario. */
  name: string;
  /** URL base del sitio, p. ej. "https://mi-clon-de-animeflv.tv". */
  baseUrl: string;
  /** Plantilla de parsing a reutilizar. */
  template: ProviderId;
}
export type AudioLang = 'ja' | 'en' | 'es';
export type SubLang = 'en' | 'es' | 'off';
export type PlayMode = 'sub' | 'dub';

// ─── Airing Entry (para daemon de notificaciones) ────────
export interface AiringEntry {
  id: number;
  title: string;
  nextEpisode: number;
  airingAt: number; // Unix timestamp (segundos)
}

// ─── User Preferences ────────────────────────────────────
export interface UserPreferences {
  audioLanguage: AudioLang;
  subtitleLanguage: SubLang;
  preferredProvider: ProviderId;
  preferredMangaProvider: string;
  /** Incluir capítulos en inglés en MangaDex (por defecto solo español). */
  mangaIncludeEnglish: boolean;
  fallbackEnabled: boolean;
  skipIntro: boolean;
  skipOutro: boolean;
  discordRpc: boolean;
  providersEnabled: Record<ProviderId, boolean>;
  mangaProvidersEnabled: Record<string, boolean>;
  notificationsEnabled: boolean;
  /** URL base alternativa (mirror) por provider integrado. Vacío = oficial. */
  providerBaseUrls: Partial<Record<ProviderId, string>>;
  /** Sitios añadidos por el usuario basados en plantillas de providers. */
  customProviders: CustomProviderDef[];
}

// ─── AniList Auth ─────────────────────────────────────────
export interface AniListToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expiry: number;
}

// ─── AniSkip ──────────────────────────────────────────────
export interface SkipTime {
  interval: { startTime: number; endTime: number };
  skipType: 'op' | 'ed' | 'mixed-op' | 'mixed-ed' | 'recap';
  skipId: string;
  episodeLength: number;
}

// ─── Cuenta de usuario (Supabase) ─────────────────────────
import type { AuthUser, Profile, ListStatus } from '../modules/backend/types';

export type AccountStatus =
  | 'loading'      // comprobando si hay sesión guardada
  | 'signedOut'
  | 'signedIn'
  | 'unavailable'; // el backend de cuentas no está configurado

export interface AccountState {
  status: AccountStatus;
  user: AuthUser | null;
  profile: Profile | null;
}

/** Estado de un anime en MI lista (índice rápido por id de AniList). */
export interface MyListEntry {
  status: ListStatus;
  progress: number;
  score: number;
}

export type AuthModalMode = 'login' | 'register' | 'reset' | 'recovery';
export interface AuthModalState {
  mode: AuthModalMode;
  /** Motivo mostrado arriba ("Inicia sesión para guardar tu lista"). */
  reason?: string;
}

// ─── Store State ──────────────────────────────────────────
export interface AppState {
  account: AccountState;
  /** Mi lista de anime indexada por id de AniList (vacía si no hay sesión). */
  myList: Record<number, MyListEntry>;
  authModal: AuthModalState | null;
  profileModalOpen: boolean;
  prefs: UserPreferences;
  currentAnime: AniListAnime | null;
  currentEpisode: number | null;
  currentSource: StreamingSource | null;
  skipTimes: SkipTime[];
  isLoading: boolean;
  error: string | null;
  providerStatus: Record<string, 'online' | 'unstable' | 'offline'>;
  /** Config remota (kill-switches/anuncios del dev); null = no cargada. */
  remoteConfig: import('../modules/remoteConfig').RemoteConfig | null;

  // Acciones
  setAccount: (account: Partial<AccountState>) => void;
  setMyList: (list: Record<number, MyListEntry>) => void;
  patchMyList: (animeId: number, entry: MyListEntry | null) => void;
  setAuthModal: (modal: AuthModalState | null) => void;
  setProfileModalOpen: (open: boolean) => void;
  setPrefs: (prefs: Partial<UserPreferences>) => void;
  setCurrentAnime: (anime: AniListAnime | null) => void;
  setCurrentEpisode: (episode: number | null) => void;
  setCurrentSource: (source: StreamingSource | null) => void;
  setSkipTimes: (times: SkipTime[]) => void;
  setProviderStatus: (id: string, status: 'online' | 'unstable' | 'offline') => void;
  setRemoteConfig: (config: import('../modules/remoteConfig').RemoteConfig | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

// ─── Default Preferences ──────────────────────────────────
export const DEFAULT_PREFERENCES: UserPreferences = {
  audioLanguage: 'es',
  subtitleLanguage: 'es',
  preferredProvider: 'animeflv',
  preferredMangaProvider: 'mangadex',
  mangaIncludeEnglish: false,
  fallbackEnabled: true,
  skipIntro: true,
  skipOutro: false,
  discordRpc: true,
  providersEnabled: {
    animeflv: true,
    jkanime: true,
    animeav1: true,
  },
  mangaProvidersEnabled: {
    mangadex: true,
    inmanga: true,
    manhwaweb: true,
    mangaoni: true,
  },
  notificationsEnabled: false,
  providerBaseUrls: {},
  customProviders: [],
};
