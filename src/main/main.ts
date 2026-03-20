import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  protocol,
} from 'electron';
import path from 'path';
import axios from 'axios';
import Store from 'electron-store';
import { initUpdater } from './updater';
import { buildMenu } from './menu';

// ─── Electron Store ───────────────────────────────────────
const store = new Store({
  encryptionKey: 'kageview-secure-store-key-2026',
});

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === '1';

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

ipcMain.handle('get-version', () => app.getVersion());

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
    mainWindow.webContents.openDevTools({ mode: 'detach' });
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

  // ─── Spoof Global User-Agent para evadir Cloudflare/Anti-Bots ───
  const genericUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  app.userAgentFallback = genericUserAgent;

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

      // Siempre inyectar el User-Agent limpio
      details.requestHeaders['User-Agent'] = genericUserAgent;

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

      // No tocar localhost, devtools ni la API de AniList
      if (
        !url.includes('localhost') &&
        !url.includes('127.0.0.1') &&
        !url.includes('anilist.co') &&
        !url.startsWith('devtools://')
      ) {
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

ipcMain.handle('get-store', (_event, key: string) => {
  return store.get(key);
});

ipcMain.handle('set-store', (_event, key: string, value: unknown) => {
  store.set(key, value);
});

ipcMain.handle('open-external', (_event, url: string) => {
  return shell.openExternal(url);
});

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
      const axiosConfig: Record<string, unknown> = {
        method: config.method || 'GET',
        url: config.url,
        params: config.params,
        headers: config.headers || {},
        timeout: config.timeout || 15000,
      };
      if (config.data) axiosConfig.data = config.data;
      if (config.maxRedirects !== undefined)
        axiosConfig.maxRedirects = config.maxRedirects;
      if (config.validateStatus === 'lenient') {
        axiosConfig.validateStatus = (s: number) => s >= 200 && s < 400;
      }

      const response = await axios(axiosConfig as import('axios').AxiosRequestConfig);
      return {
        status: response.status,
        data: response.data,
        headers: response.headers,
      };
    } catch (err: unknown) {
      const axErr = err as { response?: { status: number; data: unknown }; message?: string };
      if (axErr.response) {
        return {
          status: axErr.response.status,
          data: axErr.response.data,
          headers: {},
          error: true,
        };
      }
      return { status: 0, data: null, headers: {}, error: true, message: axErr.message };
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
