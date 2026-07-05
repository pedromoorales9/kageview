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
import { setCache } from './cache';

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
    animeav1: 'offline',
    animeflv: 'offline',
    jkanime: 'offline',
  },

  // ─── Acciones ───────────────────────────────────────────
  setToken: (token: string | null) => set({ token }),

  setUser: (user: AniListViewer | null) => set({ user }),

  setPrefs: (partial: Partial<UserPreferences>) =>
    set((state) => {
      const prefs = { ...state.prefs, ...partial };
      // Persistir en electron-store (fire-and-forget); antes las prefs
      // se perdían al cerrar la app.
      setCache('userPrefs', prefs);
      return { prefs };
    }),

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
