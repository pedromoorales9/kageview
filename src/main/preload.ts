import { contextBridge, ipcRenderer } from 'electron';

// Exposición segura de APIs de Electron al renderer via contextBridge
contextBridge.exposeInMainWorld('electron', {
  getStore: (key: string): Promise<unknown> =>
    ipcRenderer.invoke('get-store', key),

  setStore: (key: string, value: unknown): Promise<void> =>
    ipcRenderer.invoke('set-store', key, value),

  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('open-external', url),

  /**
   * Proxy HTTP request through the main process (Node.js).
   * Bypasses CORS and browser restrictions.
   */
  proxyRequest: (config: {
    method: string;
    url: string;
    params?: Record<string, string | number | string[]>;
    headers?: Record<string, string>;
    data?: unknown;
    timeout?: number;
    maxRedirects?: number;
    validateStatus?: string;
  }): Promise<{ status: number; data: unknown; headers: Record<string, unknown>; error?: boolean; message?: string }> =>
    ipcRenderer.invoke('proxy-request', config),

  /** Enlaces kageview://auth-callback (confirmación de correo / recuperación). */
  onAuthCallback: (cb: (url: string) => void): void => {
    ipcRenderer.on('auth-callback', (_event, url: string) => cb(url));
  },

  removeAuthCallbackListener: (): void => {
    ipcRenderer.removeAllListeners('auth-callback');
  },

  /** Enlace recibido mientras la ventana aún cargaba (arranque en frío). */
  consumePendingAuthUrl: (): Promise<string | null> =>
    ipcRenderer.invoke('auth-consume-pending-url'),

  windowControls: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    setFullscreen: (value: boolean) => ipcRenderer.send('window-set-fullscreen', value),
    onFullscreenChanged: (cb: (value: boolean) => void) => ipcRenderer.on('fullscreen-changed', (_e, v) => cb(v)),
    removeFullscreenListener: () => ipcRenderer.removeAllListeners('fullscreen-changed'),
  },

  updaterCheck:            () => ipcRenderer.invoke('updater-check'),
  updaterDownload:         () => ipcRenderer.invoke('updater-download'),
  updaterInstall:          () => ipcRenderer.invoke('updater-install'),
  onUpdater:               (cb: (data: any) => void) => ipcRenderer.on('updater', (_e, d) => cb(d)),
  removeUpdaterListener:   () => ipcRenderer.removeAllListeners('updater'),

  getVersion: (): Promise<string> => ipcRenderer.invoke('get-version'),

  // ─── Notificaciones Nativas ─────────────────────────────
  sendNotification: (opts: { title: string; body: string }): Promise<void> =>
    ipcRenderer.invoke('send-notification', opts),

  getNotificationsEnabled: (): Promise<boolean> =>
    ipcRenderer.invoke('get-notifications-enabled'),

  setNotificationsEnabled: (val: boolean): Promise<void> =>
    ipcRenderer.invoke('set-notifications-enabled', val),

  setAiringAnimes: (entries: Array<{ id: number; title: string; nextEpisode: number; airingAt: number }>): Promise<void> =>
    ipcRenderer.invoke('set-airing-animes', entries),

  // ─── Discord Rich Presence ──────────────────────────────
  discordSetEnabled: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('discord-set-enabled', enabled),

  discordSetActivity: (opts: { details: string; state: string }): Promise<void> =>
    ipcRenderer.invoke('discord-set-activity', opts),

  discordClear: (): Promise<void> =>
    ipcRenderer.invoke('discord-clear'),

  // ─── Progreso de Episodios ───────────────────────────────
  getWatchProgress: (animeId: number): Promise<number | null> =>
    ipcRenderer.invoke('get-watch-progress', animeId),

  setWatchProgress: (animeId: number, episode: number): Promise<void> =>
    ipcRenderer.invoke('set-watch-progress', animeId, episode),

  platform: process.platform,
});
