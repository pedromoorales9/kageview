// ═══════════════════════════════════════════════════════════
// macUpdater — actualización automática en macOS SIN certificado de Apple
//
// Mismo comportamiento que en Windows (comprobar → descargar → reiniciar e
// instalar) y mismos eventos hacia la interfaz, pero sin Squirrel.Mac (que exige
// firma de Developer ID). Ver el porqué y las reglas en macUpdaterCore.ts.
//
// Flujo:
//   check     lee latest-mac.yml y compara con la versión instalada
//   download  baja el .zip, verifica tamaño + SHA-512, lo descomprime junto a la
//             app instalada y comprueba que es KageView (id, versión, firma)
//   install   lanza un script que espera a que la app cierre, sustituye el
//             bundle (con vuelta atrás si falla) y la vuelve a abrir
// ═══════════════════════════════════════════════════════════

import { app, BrowserWindow, ipcMain, net } from 'electron';
import { execFile, spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import log from 'electron-log';
import {
  BUNDLE_ID,
  MacFeed,
  REPO,
  SWAP_SCRIPT,
  bundlePathFromExe,
  feedLocation,
  installBlockReason,
  isNewer,
  parseLatestMac,
  releaseNotesFromBody,
} from './macUpdaterCore';

const STAGE_DIR_NAME = '.kageview-update';

const run = (cmd: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) =>
      err ? reject(new Error((stderr || err.message).toString().trim())) : resolve(stdout.toString().trim())
    );
  });

/** Carpeta contenedora de la app instalada (donde se prepara la nueva: mismo volumen). */
function installInfo() {
  const bundlePath = bundlePathFromExe(app.getPath('exe'));
  let writable = false;
  if (bundlePath) {
    try {
      fs.accessSync(path.dirname(bundlePath), fs.constants.W_OK);
      fs.accessSync(bundlePath, fs.constants.W_OK);
      writable = true;
    } catch {
      writable = false;
    }
  }
  return { bundlePath, writable, blockReason: installBlockReason({ isPackaged: app.isPackaged, bundlePath, writable }) };
}

export function initMacUpdater(mainWindow: BrowserWindow): void {
  const send = (payload: Record<string, unknown>) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('updater', payload);
  };
  const loc = feedLocation(process.env.KAGEVIEW_UPDATE_FEED);

  let feed: MacFeed | null = null;
  let stagedApp: string | null = null;
  let busy = false;

  /** Restos de una actualización interrumpida (carpeta de preparación y app apartada). */
  const cleanLeftovers = () => {
    const { bundlePath } = installInfo();
    if (!bundlePath) return;
    const dir = path.dirname(bundlePath);
    for (const leftover of [path.join(dir, STAGE_DIR_NAME), `${bundlePath}.kageview-old`]) {
      try {
        fs.rmSync(leftover, { recursive: true, force: true });
      } catch {
        /* sin permisos: no pasa nada */
      }
    }
  };

  // ─── 1. Comprobar ───────────────────────────────────────
  async function check(): Promise<void> {
    if (busy) return;
    busy = true;
    send({ type: 'checking' });
    try {
      const res = await net.fetch(loc.feedUrl, { headers: { 'Cache-Control': 'no-cache' } });
      if (!res.ok) throw new Error(`El servidor de actualizaciones respondió ${res.status}`);
      const parsed = parseLatestMac(await res.text());
      if (!parsed) throw new Error('El archivo de versiones no es válido.');

      if (!isNewer(app.getVersion(), parsed.version)) {
        feed = null;
        send({ type: 'not-available' });
        return;
      }
      feed = parsed;
      stagedApp = null;
      send({ type: 'available', version: parsed.version, releaseNotes: await fetchNotes(parsed.version) });
    } catch (err) {
      log.warn('[macUpdater] comprobación fallida:', err);
      send({ type: 'error', message: friendly(err) });
    } finally {
      busy = false;
    }
  }

  /** Novedades de la release (solo con el feed oficial; tolera cualquier fallo). */
  async function fetchNotes(version: string): Promise<string | null> {
    if (process.env.KAGEVIEW_UPDATE_FEED) return null;
    try {
      const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/tags/v${version}`, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) return null;
      return releaseNotesFromBody(((await res.json()) as { body?: string }).body);
    } catch {
      return null;
    }
  }

  // ─── 2. Descargar y preparar ────────────────────────────
  async function download(): Promise<void> {
    if (busy || !feed) return;
    const info = installInfo();
    if (info.blockReason || !info.bundlePath) {
      send({ type: 'error', message: info.blockReason ?? 'No se puede actualizar automáticamente.' });
      return;
    }
    busy = true;
    const target = feed;
    const tmpDir = path.join(os.tmpdir(), 'kageview-update');
    const zipPath = path.join(tmpDir, target.file);
    const stageDir = path.join(path.dirname(info.bundlePath), STAGE_DIR_NAME);

    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.rmSync(stageDir, { recursive: true, force: true });
      fs.mkdirSync(tmpDir, { recursive: true });

      await downloadVerified(loc.fileUrl(target.version, target.file), zipPath, target, (percent, transferred, bps) =>
        send({ type: 'progress', percent, transferred, total: target.size, bytesPerSecond: bps })
      );

      // Descomprimir junto a la app instalada (mismo volumen → el cambio final es un renombrado)
      fs.mkdirSync(stageDir, { recursive: true });
      await run('/usr/bin/ditto', ['-x', '-k', zipPath, stageDir]);
      const appName = fs.readdirSync(stageDir).find((n) => n.endsWith('.app'));
      if (!appName) throw new Error('El paquete descargado no contiene la app.');
      const candidate = path.join(stageDir, appName);
      await verifyStagedApp(candidate, target.version);

      stagedApp = candidate;
      fs.rmSync(tmpDir, { recursive: true, force: true });
      send({ type: 'downloaded', version: target.version });
    } catch (err) {
      log.error('[macUpdater] descarga fallida:', err);
      stagedApp = null;
      for (const d of [tmpDir, stageDir]) fs.rmSync(d, { recursive: true, force: true });
      send({ type: 'error', message: friendly(err) });
    } finally {
      busy = false;
    }
  }

  // ─── 3. Instalar ────────────────────────────────────────
  function install(): void {
    const info = installInfo();
    if (!stagedApp || !info.bundlePath || info.blockReason || !fs.existsSync(stagedApp)) {
      send({ type: 'error', message: info.blockReason ?? 'La actualización ya no está preparada. Vuelve a comprobarlo.' });
      return;
    }
    log.info(`[macUpdater] instalando ${stagedApp} sobre ${info.bundlePath}`);
    const child = spawn('/bin/sh', ['-c', SWAP_SCRIPT, 'sh', String(process.pid), info.bundlePath, stagedApp], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    BrowserWindow.getAllWindows().forEach((w) => w.destroy());
    app.quit();
    // Si algo retrasara el cierre, asegurarlo: el script solo espera 30 s
    setTimeout(() => app.exit(0), 2500);
  }

  ipcMain.handle('updater-check', () => check());
  ipcMain.handle('updater-download', () => download());
  ipcMain.handle('updater-install', () => install());

  cleanLeftovers();
  // Solo en la app instalada y sin molestar durante el arranque
  if (app.isPackaged) setTimeout(() => void check(), 8000);
}

// ─── Utilidades ────────────────────────────────────────────
/** Descarga a disco comprobando tamaño y SHA-512; falla (y borra) si no coincide. */
async function downloadVerified(
  url: string,
  dest: string,
  expected: MacFeed,
  onProgress: (percent: number, transferred: number, bytesPerSecond: number) => void
): Promise<void> {
  const res = await net.fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`No se pudo descargar la actualización (${res.status}).`);

  const hash = crypto.createHash('sha512');
  const out = fs.createWriteStream(dest);
  const reader = res.body.getReader();
  const started = Date.now();
  let transferred = 0;
  let lastEmit = 0;
  let lastData = Date.now();

  // Si la conexión se queda parada 30 s, abortar
  const watchdog = setInterval(() => {
    if (Date.now() - lastData > 30_000) void reader.cancel('sin datos');
  }, 5000);

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      lastData = Date.now();
      transferred += value.byteLength;
      if (transferred > expected.size) throw new Error('El archivo descargado es más grande de lo esperado.');
      hash.update(value);
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
      const now = Date.now();
      if (now - lastEmit > 200) {
        lastEmit = now;
        const bps = transferred / Math.max(1, (now - started) / 1000);
        onProgress(Math.min(99, Math.round((transferred / expected.size) * 100)), transferred, bps);
      }
    }
  } finally {
    clearInterval(watchdog);
    await new Promise<void>((r) => out.end(() => r()));
  }

  if (transferred !== expected.size) throw new Error('La descarga quedó incompleta. Inténtalo de nuevo.');
  if (hash.digest('base64') !== expected.sha512) {
    fs.rmSync(dest, { force: true });
    throw new Error('La huella (SHA-512) de la descarga no coincide: se descarta por seguridad.');
  }
  onProgress(100, transferred, transferred / Math.max(1, (Date.now() - started) / 1000));
}

/** La app preparada debe ser KageView, de la versión anunciada y con la firma íntegra. */
async function verifyStagedApp(appPath: string, expectedVersion: string): Promise<void> {
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  const read = (key: string) => run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist]);
  const [id, version] = await Promise.all([read('CFBundleIdentifier'), read('CFBundleShortVersionString')]);
  if (id !== BUNDLE_ID) throw new Error('El paquete descargado no es KageView.');
  if (version !== expectedVersion) throw new Error(`La versión del paquete (${version}) no coincide con la anunciada (${expectedVersion}).`);
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath]).catch(() => {
    throw new Error('La firma del paquete descargado no es válida.');
  });
}

function friendly(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/fetch failed|ENOTFOUND|ECONN|network|net::/i.test(msg)) return 'Sin conexión con el servidor de actualizaciones.';
  return msg.slice(0, 240);
}
