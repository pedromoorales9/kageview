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
      onOAuthCode: (cb: (code: string) => void) => void;
      removeOAuthListener: () => void;
      windowControls: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
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
