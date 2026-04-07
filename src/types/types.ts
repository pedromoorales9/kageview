// ═══════════════════════════════════════════════════════════
// KageView — Tipos TypeScript centralizados
// ═══════════════════════════════════════════════════════════

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

export type ProviderId = 'animeflv' | 'jkanime';
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
  fallbackEnabled: boolean;
  skipIntro: boolean;
  skipOutro: boolean;
  discordRpc: boolean;
  providersEnabled: Record<ProviderId, boolean>;
  notificationsEnabled: boolean;
}

// ─── AniList Auth ─────────────────────────────────────────
export interface AniListToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expiry: number;
}

export interface ClientData {
  clientId: number;
  clientSecret: string;
  redirectUri: string;
}

// ─── AniSkip ──────────────────────────────────────────────
export interface SkipTime {
  interval: { start_time: number; end_time: number };
  skip_type: 'op' | 'ed' | 'mixed-op' | 'mixed-ed' | 'recap';
}

// ─── User Viewer ──────────────────────────────────────────
export interface AniListViewer {
  id: number;
  name: string;
  avatar: { large: string };
}

// ─── Store State ──────────────────────────────────────────
export interface AppState {
  token: string | null;
  user: AniListViewer | null;
  prefs: UserPreferences;
  currentAnime: AniListAnime | null;
  currentEpisode: number | null;
  currentSource: StreamingSource | null;
  skipTimes: SkipTime[];
  isLoading: boolean;
  error: string | null;
  providerStatus: Record<ProviderId, 'online' | 'unstable' | 'offline'>;

  // Acciones
  setToken: (token: string | null) => void;
  setUser: (user: AniListViewer | null) => void;
  setPrefs: (prefs: Partial<UserPreferences>) => void;
  setCurrentAnime: (anime: AniListAnime | null) => void;
  setCurrentEpisode: (episode: number | null) => void;
  setCurrentSource: (source: StreamingSource | null) => void;
  setSkipTimes: (times: SkipTime[]) => void;
  setProviderStatus: (id: ProviderId, status: 'online' | 'unstable' | 'offline') => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

// ─── Default Preferences ──────────────────────────────────
export const DEFAULT_PREFERENCES: UserPreferences = {
  audioLanguage: 'es',
  subtitleLanguage: 'es',
  preferredProvider: 'animeflv',
  fallbackEnabled: true,
  skipIntro: true,
  skipOutro: false,
  discordRpc: true,
  providersEnabled: {
    animeflv: true,
    jkanime: true,
  },
  notificationsEnabled: false,
};
