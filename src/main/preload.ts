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

  onOAuthCode: (cb: (code: string) => void): void => {
    ipcRenderer.on('oauth-code', (_event, code: string) => cb(code));
  },

  removeOAuthListener: (): void => {
    ipcRenderer.removeAllListeners('oauth-code');
  },

  windowControls: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
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

  platform: process.platform,
});
