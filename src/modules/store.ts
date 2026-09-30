// ═══════════════════════════════════════════════════════════
// Zustand Store — Estado global del renderer
// ═══════════════════════════════════════════════════════════

import { create } from 'zustand';
import {
  AppState,
  UserPreferences,
  DEFAULT_PREFERENCES,
  AniListAnime,
  AccountState,
  MyListEntry,
  AuthModalState,
  StreamingSource,
  SkipTime,
} from '../types/types';
import { setCache } from './cache';

export const useAppStore = create<AppState>((set) => ({
  // ─── State ──────────────────────────────────────────────
  account: { status: 'loading', user: null, profile: null },
  myList: {},
  authModal: null,
  profileModalOpen: false,
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
  remoteConfig: null,

  // ─── Acciones ───────────────────────────────────────────
  setAccount: (account: Partial<AccountState>) =>
    set((state) => ({ account: { ...state.account, ...account } })),

  setMyList: (myList: Record<number, MyListEntry>) => set({ myList }),

  patchMyList: (animeId: number, entry: MyListEntry | null) =>
    set((state) => {
      const next = { ...state.myList };
      if (entry) next[animeId] = entry;
      else delete next[animeId];
      return { myList: next };
    }),

  setAuthModal: (authModal: AuthModalState | null) => set({ authModal }),

  setProfileModalOpen: (profileModalOpen: boolean) => set({ profileModalOpen }),

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

  setProviderStatus: (id: string, status: 'online' | 'unstable' | 'offline') =>
    set((state) => ({
      providerStatus: { ...state.providerStatus, [id]: status },
    })),

  setRemoteConfig: (config) => set({ remoteConfig: config }),

  setLoading: (loading: boolean) => set({ isLoading: loading }),

  setError: (error: string | null) => set({ error }),

  clearError: () => set({ error: null }),
}));
