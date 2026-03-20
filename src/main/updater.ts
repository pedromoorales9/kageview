// Auto-update con electron-updater (solo en producción)
export function checkForUpdates(): void {
  try {
    // Importar dinámicamente para evitar errores en desarrollo
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { autoUpdater } = require('electron-updater');

    autoUpdater.checkForUpdatesAndNotify();

    autoUpdater.on('update-available', () => {
      console.log('[KageView] Actualización disponible');
    });

    autoUpdater.on('update-downloaded', () => {
      console.log('[KageView] Actualización descargada. Se instalará al reiniciar.');
    });

    autoUpdater.on('error', (err: Error) => {
      console.error('[KageView] Error en auto-update:', err.message);
    });
  } catch (err) {
    console.warn('[KageView] electron-updater no disponible:', err);
  }
}
