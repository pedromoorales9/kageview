import { AiringEntry } from './types';

declare global {
  interface Window {
    electron: {
      getStore: (key: string) => Promise<unknown>;
      setStore: (key: string, value: unknown) => Promise<void>;
      openExternal: (url: string) => Promise<void>;
      proxyRequest: (config: {
        method: string;
        url: string;
        params?: Record<string, string | number | string[]>;
        headers?: Record<string, string>;
        data?: unknown;
        timeout?: number;
        maxRedirects?: number;
        validateStatus?: string;
      }) => Promise<{
        status: number;
        data: unknown;
        headers: Record<string, unknown>;
        error?: boolean;
        message?: string;
      }>;
      onAuthCallback: (cb: (url: string) => void) => void;
      removeAuthCallbackListener: () => void;
      consumePendingAuthUrl: () => Promise<string | null>;
      // Cuenta de AniList
      anilistStatus: () => Promise<import('../modules/anilist/sync/bridge').AniListStatus | null>;
      anilistLogin: () => Promise<{ ok: boolean; error?: string }>;
      anilistSubmitToken: (text: string) => Promise<{ ok: boolean; error?: string }>;
      anilistLogout: () => Promise<boolean>;
      anilistRequest: (query: string, variables?: Record<string, unknown>) => Promise<import('../modules/anilist/sync/bridge').BridgeResult>;
      onAnilistStatus: (cb: (status: import('../modules/anilist/sync/bridge').AniListStatus) => void) => void;
      onAnilistLoginResult: (cb: (result: { ok: boolean; error?: string }) => void) => void;

      windowControls: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        setFullscreen: (value: boolean) => void;
        onFullscreenChanged: (cb: (value: boolean) => void) => void;
        removeFullscreenListener: () => void;
      };
      platform: string;
      getVersion: () => Promise<string>;
      
      updaterCheck: () => Promise<void>;
      updaterDownload: () => Promise<void>;
      updaterInstall: () => Promise<void>;
      onUpdater: (cb: (data: UpdaterEvent) => void) => void;
      removeUpdaterListener: () => void;

      // Notificaciones nativas de Windows
      sendNotification: (opts: { title: string; body: string }) => Promise<void>;
      getNotificationsEnabled: () => Promise<boolean>;
      setNotificationsEnabled: (val: boolean) => Promise<void>;
      setAiringAnimes: (entries: AiringEntry[]) => Promise<void>;

      // Discord Rich Presence
      discordSetEnabled: (enabled: boolean) => Promise<void>;
      discordSetActivity: (opts: { details: string; state: string }) => Promise<void>;
      discordClear: () => Promise<void>;

      // Progreso de episodios persistido
      getWatchProgress: (animeId: number) => Promise<number | null>;
      setWatchProgress: (animeId: number, episode: number) => Promise<void>;
    };
  }
}

export interface UpdaterEvent {
  type: 'checking' | 'available' | 'not-available' | 'progress' | 'downloaded' | 'error';
  version?: string;
  releaseNotes?: string | null;
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
  message?: string;
}
