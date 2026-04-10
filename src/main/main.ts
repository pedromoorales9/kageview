import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  protocol,
  net,
  Notification,
} from 'electron';
import path from 'path';
import axios from 'axios';
import Store from 'electron-store';
import { version } from '../../package.json';
import { initUpdater } from './updater';
import { buildMenu } from './menu';

// ─── Electron Store ───────────────────────────────────────
const store = new Store({
  encryptionKey: 'kageview-secure-store-key-2026',
});

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === '1';

// ─── Spoof Global User-Agent para evadir Cloudflare/Anti-Bots ───
const GENERIC_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── Deep Link Protocol ──────────────────────────────────
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('kageview', process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient('kageview');
}

// ─── Asegurar instancia única ─────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  // Win/Linux: segundo intento de abrir la app llega como second-instance
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // Interceptar deep link kageview://auth?code=XXXX
    const deepLink = commandLine.find((arg) => arg.startsWith('kageview://'));
    if (deepLink) {
      handleDeepLink(deepLink);
    }
  });
}

function handleDeepLink(url: string): void {
  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    if (code && mainWindow) {
      mainWindow.webContents.send('oauth-code', code);
    }
  } catch (err) {
    console.error('[KageView] Error al parsear deep link:', err);
  }
}

ipcMain.handle('get-version', () => version);

// ─── OAuth ──────────────────────────────────────────────
// ─── Crear ventana ────────────────────────────────────────
async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    frame: process.platform === 'darwin' ? true : false,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : undefined,
    backgroundColor: '#0e0e13',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true, // Habilitado para restaurar Secure Contexts requeridos por los reproductores
      webviewTag: true,  // <-- Habilitar el uso de <webview> en React
    },
  });

  // Cargar la aplicación
  if (isDev) {
    await mainWindow.loadURL('http://localhost:1212');
    mainWindow.webContents.openDevTools({ mode: 'detach' }); // Descomenta para abrir DevTools automáticamente
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Inicializar auto-updater con la ventana creada
  initUpdater(mainWindow);

  // ─── Capturar errores del renderer en terminal ─────────
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const prefix = ['LOG', 'WARN', 'ERROR', 'DEBUG', 'INFO'][level] || 'LOG';
    console.log(`[Renderer ${prefix}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Renderer] Process gone:', details.reason, details.exitCode);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Renderer] Failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[Renderer] Preload error:', preloadPath, error);
  });

  // Mostrar cuando esté lista para evitar flash blanco
  mainWindow.on('ready-to-show', () => {
    if (mainWindow) mainWindow.show();
  });
  mainWindow.show(); // Forzar mostrar para debug

  // ─── Spoof Global User-Agent para evadir Cloudflare/Anti-Bots ───
  app.userAgentFallback = GENERIC_USER_AGENT;

  // ─── Interceptar cabeceras para iframes de video ───────
  const { session } = require('electron');
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*/*'] },
    (details: any, callback: any) => {
      const url = details.url.toLowerCase();

      // ─── Bloquear dominios de publicidad conocidos ────────
      const adDomains = [
        'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
        'adnxs.com', 'popads.net', 'popcash.net', 'juicyads.com',
        'exoclick.com', 'trafficjunky.net', 'clickadu.com',
        'propellerads.com', 'adsterra.com', 'hilltopads.net',
        'monetag.com', 'pushground.com', 'a-ads.com',
        'syndication.twitter.com', 'ad.mail.ru',
        'mc.yandex.ru', 'top.mail.ru',
      ];
      if (adDomains.some(d => url.includes(d))) {
        callback({ cancel: true });
        return;
      }

      // No tocar localhost, devtools ni la API de AniList
      const isInternalOrAniList = url.includes('localhost') ||
                                  url.includes('127.0.0.1') ||
                                  url.includes('anilist.co') ||
                                  url.startsWith('devtools://');

      if (!isInternalOrAniList) {
        // Siempre inyectar el User-Agent limpio para scrapers
        details.requestHeaders['User-Agent'] = GENERIC_USER_AGENT;

        // Limpiar headers de Electron que delatan a Cloudflare
        const keys = Object.keys(details.requestHeaders);
        for (const k of keys) {
          const lowK = k.toLowerCase();
          if (lowK === 'sec-ch-ua') {
            details.requestHeaders[k] = '"Google Chrome";v="120", "Chromium";v="120", "Not?A_Brand";v="24"';
          } else if (lowK === 'sec-ch-ua-mobile') {
            details.requestHeaders[k] = '?0';
          } else if (lowK === 'sec-ch-ua-platform') {
            details.requestHeaders[k] = '"Windows"';
          }
        }

        if (url.includes('jkanime') || url.includes('jk.php') || url.includes('desu')) {
          details.requestHeaders['Referer'] = 'https://jkanime.net/';
          details.requestHeaders['Origin'] = 'https://jkanime.net';
        } else {
          // Default it to AnimeFLV for embed servers like Streamwish, Okru, Mega, Fembed etc.
          details.requestHeaders['Referer'] = 'https://animeflv.net/';
          details.requestHeaders['Origin'] = 'https://animeflv.net';
        }
      }
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    }
  );

  // ─── Forzar Cookies de Terceros en Iframes (SameSite=None) ───
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['*://*/*'] },
    (details: any, callback: any) => {
      if (details.responseHeaders) {
        const setCookieKey = Object.keys(details.responseHeaders).find(
          (k) => k.toLowerCase() === 'set-cookie'
        );
        if (setCookieKey) {
          const cookies = details.responseHeaders[setCookieKey];
          details.responseHeaders[setCookieKey] = cookies.map((c: string) => {
            let patched = c;
            if (!patched.toLowerCase().includes('samesite=none')) patched += '; SameSite=None';
            if (!patched.toLowerCase().includes('secure')) patched += '; Secure';
            return patched;
          });
        }
      }
      callback({ cancel: false, responseHeaders: details.responseHeaders });
    }
  );

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Abrir links externos en el navegador del sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // ─── Bloquear popups/ads de webviews (reproductores embed) ───
  mainWindow.webContents.on('did-attach-webview' as any, (_event: any, webContents: any) => {
    // Bloquear TODOS los intentos de abrir ventanas nuevas (ads)
    webContents.setWindowOpenHandler(() => {
      return { action: 'deny' };
    });

    // Bloquear navegación a dominios de publicidad
    const adDomainPatterns = [
      'doubleclick', 'googlesyndication', 'googleadservices',
      'adservice', 'adsense', 'ad-delivery', 'adnxs', 'ads.',
      'popads', 'popcash', 'popunder', 'juicyads', 'exoclick',
      'trafficjunky', 'clickadu', 'propellerads', 'adsterra',
      'hilltopads', 'monetag', 'a-ads', 'pushground',
    ];

    webContents.on('will-navigate', (e: any, url: string) => {
      const lower = url.toLowerCase();
      if (adDomainPatterns.some(p => lower.includes(p))) {
        e.preventDefault();
      }
    });

    // Interceptar fullscreen del webview desde el proceso principal
    // Cuando el player embebido pide fullscreen, lo cancelamos y ponemos
    // la ventana en fullscreen nosotros — así nuestros overlays siguen visibles
    let ignoringLeave = false;
    webContents.on('enter-html-full-screen', () => {
      ignoringLeave = true;
      webContents.executeJavaScript('document.exitFullscreen && document.exitFullscreen()').catch(() => {});
      if (mainWindow) mainWindow.setFullScreen(true);
      mainWindow?.webContents.send('fullscreen-changed', true);
    });
    webContents.on('leave-html-full-screen', () => {
      if (ignoringLeave) { ignoringLeave = false; return; }
      if (mainWindow) mainWindow.setFullScreen(false);
      mainWindow?.webContents.send('fullscreen-changed', false);
    });
  });
}

// ─── IPC Handlers ─────────────────────────────────────────
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on('window-set-fullscreen', (_event, value: boolean) => {
  if (mainWindow) mainWindow.setFullScreen(value);
});

ipcMain.handle('get-store', (_event, key: string) => {
  return store.get(key);
});

ipcMain.handle('set-store', (_event, key: string, value: unknown) => {
  store.set(key, value);
});

ipcMain.handle('open-external', (_event, url: string) => {
  return shell.openExternal(url);
});

// ─── Notificaciones Nativas de Windows ────────────────────
ipcMain.handle('send-notification', (_event, opts: { title: string; body: string }) => {
  if (Notification.isSupported()) {
    const n = new Notification({
      title: opts.title,
      body: opts.body,
      icon: path.join(__dirname, '../../assets/icon.png'),
      silent: false,
    });
    n.show();
  }
});

ipcMain.handle('get-notifications-enabled', () => {
  return store.get('notifications-enabled', false) as boolean;
});

ipcMain.handle('set-notifications-enabled', (_event, val: boolean) => {
  store.set('notifications-enabled', val);
  if (val) {
    startDaemon();
  } else {
    stopDaemon();
  }
});

// ─── Progreso de Episodios ────────────────────────────────
// Guarda el último episodio visto por anime (persistido entre sesiones)
ipcMain.handle('get-watch-progress', (_event, animeId: number) => {
  return store.get(`watch-progress-${animeId}`, null) as number | null;
});

ipcMain.handle('set-watch-progress', (_event, animeId: number, episode: number) => {
  store.set(`watch-progress-${animeId}`, episode);
});

// Almacenar animes en emision para el daemon
let airingAnimes: Array<{ id: number; title: string; nextEpisode: number; airingAt: number }> = [];

ipcMain.handle('set-airing-animes', (_event, entries: typeof airingAnimes) => {
  airingAnimes = entries || [];
});

// ─── Daemon de Fondo ──────────────────────────────────────
let daemonInterval: ReturnType<typeof setInterval> | null = null;

function startDaemon() {
  if (daemonInterval) return; // ya corriendo
  daemonInterval = setInterval(() => {
    const enabled = store.get('notifications-enabled', false) as boolean;
    if (!enabled || airingAnimes.length === 0) return;

    const now = Math.floor(Date.now() / 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const todayStartSec = Math.floor(todayStart.getTime() / 1000);
    const todayEndSec = Math.floor(todayEnd.getTime() / 1000);

    for (const anime of airingAnimes) {
      // Solo si aira hoy y ya es la hora de emisión (o pasó hace menos de 1 hora)
      if (anime.airingAt >= todayStartSec && anime.airingAt <= todayEndSec && anime.airingAt <= now + 60) {
        const notifKey = `notified-${anime.id}-${anime.nextEpisode}`;
        const alreadyNotified = store.get(notifKey, false) as boolean;
        if (!alreadyNotified) {
          if (Notification.isSupported()) {
            const n = new Notification({
              title: '🎌 KageView — Nuevo episodio',
              body: `${anime.title} — Episodio ${anime.nextEpisode} ya disponible!`,
              icon: path.join(__dirname, '../../assets/icon.png'),
              silent: false,
            });
            n.show();
          }
          store.set(notifKey, true);
          // Limpiar la clave al día siguiente (86400 s)
          setTimeout(() => store.delete(notifKey as never), 86400 * 1000);
        }
      }
    }
  }, 60_000); // revisar cada minuto
}

function stopDaemon() {
  if (daemonInterval) {
    clearInterval(daemonInterval);
    daemonInterval = null;
  }
}

/**
 * Proxy HTTP requests through the main process.
 * The renderer can't make cross-origin requests to anime sites
 * because of CORS/anti-bot protections. This handler uses Node.js
 * axios which has no such restrictions.
 */
ipcMain.handle(
  'proxy-request',
  async (
    _event,
    config: {
      method: string;
      url: string;
      params?: Record<string, unknown>;
      headers?: Record<string, string>;
      data?: unknown;
      timeout?: number;
      maxRedirects?: number;
      validateStatus?: string; // serialized
    }
  ) => {
    try {
      let fullUrl = config.url;
      if (config.params) {
        const urlObj = new URL(fullUrl);
        for (const [k, v] of Object.entries(config.params)) {
          if (v !== undefined) urlObj.searchParams.append(k, String(v));
        }
        fullUrl = urlObj.toString();
      }

      const fetchOptions: RequestInit = {
        method: config.method || 'GET',
        headers: { 'User-Agent': GENERIC_USER_AGENT, ...(config.headers || {}) },
      };

      if (config.data) {
        if (typeof config.data === 'string') {
          fetchOptions.body = config.data;
        } else {
          fetchOptions.body = JSON.stringify(config.data);
          const hdrs: Record<string, string> = (fetchOptions.headers as Record<string, string>) || {};
          const hasCT = Object.keys(hdrs).some(k => k.toLowerCase() === 'content-type');
          if (!hasCT) {
            hdrs['Content-Type'] = 'application/json';
          }
          fetchOptions.headers = hdrs;
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout || 15000);
      fetchOptions.signal = controller.signal;

      const response = await net.fetch(fullUrl, fetchOptions);
      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      let responseData: unknown;
      if (contentType.includes('application/json')) {
        try { responseData = await response.json(); } catch { responseData = null; }
      } else {
        responseData = await response.text();
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((val, key) => { responseHeaders[key] = val; });

      const isLenient = config.validateStatus === 'lenient';
      const isOk = isLenient 
        ? (response.status >= 200 && response.status < 400) 
        : (response.status >= 200 && response.status < 300);

      if (!isOk) {
        return {
          status: response.status,
          data: responseData,
          headers: responseHeaders,
          error: true,
          message: `Request failed with status ${response.status}`,
        };
      }

      return {
        status: response.status,
        data: responseData,
        headers: responseHeaders,
      };
    } catch (err: unknown) {
      const e = err as Error;
      return { status: 0, data: null, headers: {}, error: true, message: e.message };
    }
  }
);

// ─── App Lifecycle ────────────────────────────────────────
app.whenReady().then(async () => {
  buildMenu();
  await createWindow();

  // macOS: deep link
  app.on('open-url', (_event, url) => {
    handleDeepLink(url);
  });

  // Arrancar el daemon si las notificaciones ya estaban activas
  const notifEnabled = store.get('notifications-enabled', false) as boolean;
  if (notifEnabled) {
    startDaemon();
  }

  // El auto-update ya se inicializó en createWindow()
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
