// ═══════════════════════════════════════════════════════════
// Zustand Store — Estado global del renderer
// ═══════════════════════════════════════════════════════════

import { create } from 'zustand';
import {
  AppState,
  UserPreferences,
  DEFAULT_PREFERENCES,
  AniListAnime,
  AniListViewer,
  StreamingSource,
  SkipTime,
  ProviderId,
} from '../types/types';

export const useAppStore = create<AppState>((set) => ({
  // ─── State ──────────────────────────────────────────────
  token: null,
  user: null,
  prefs: DEFAULT_PREFERENCES,
  currentAnime: null,
  currentEpisode: null,
  currentSource: null,
  skipTimes: [],
  isLoading: false,
  error: null,
  providerStatus: {
    hianime: 'offline',
    gogoanime: 'offline',
    animepahe: 'offline',
    animeflv: 'offline',
    jkanime: 'offline',
  },

  // ─── Acciones ───────────────────────────────────────────
  setToken: (token: string | null) => set({ token }),

  setUser: (user: AniListViewer | null) => set({ user }),

  setPrefs: (partial: Partial<UserPreferences>) =>
    set((state) => ({
      prefs: { ...state.prefs, ...partial },
    })),

  setCurrentAnime: (anime: AniListAnime | null) => set({ currentAnime: anime }),

  setCurrentEpisode: (episode: number | null) => set({ currentEpisode: episode }),

  setCurrentSource: (source: StreamingSource | null) => set({ currentSource: source }),

  setSkipTimes: (times: SkipTime[]) => set({ skipTimes: times }),

  setProviderStatus: (id: ProviderId, status: 'online' | 'unstable' | 'offline') =>
    set((state) => ({
      providerStatus: { ...state.providerStatus, [id]: status },
    })),

  setLoading: (loading: boolean) => set({ isLoading: loading }),

  setError: (error: string | null) => set({ error }),

  clearError: () => set({ error: null }),
}));
