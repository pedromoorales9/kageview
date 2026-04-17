import { autoUpdater } from 'electron-updater';
import { BrowserWindow, ipcMain } from 'electron';
import log from 'electron-log';

export function initUpdater(mainWindow: BrowserWindow) {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  if (process.env.NODE_ENV === 'production') {
    autoUpdater.checkForUpdates();
  }

  autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('updater', { type: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('updater', {
      type: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes ?? null,
    });
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('updater', { type: 'not-available' });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('updater', {
      type: 'progress',
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('updater', {
      type: 'downloaded',
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    mainWindow.webContents.send('updater', {
      type: 'error',
      message: err.message,
    });
  });

  ipcMain.handle('updater-check',    () => autoUpdater.checkForUpdates());
  ipcMain.handle('updater-download', () => autoUpdater.downloadUpdate());
  ipcMain.handle('updater-install',  () => {
    // Destruir agresivamente todas las ventanas para liberar KageView.exe en Windows inmediatamente
    BrowserWindow.getAllWindows().forEach((w) => w.destroy());
    
    // isSilent: true, isForceRunAfter: true para reinicio 100% automático y transparente
    autoUpdater.quitAndInstall(true, true);
  });
}
