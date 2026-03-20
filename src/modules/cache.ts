// ═══════════════════════════════════════════════════════════
// Cache — Acceso a electron-store via IPC bridge (window.electron)
// NO importar electron-store ni ningún módulo Node.js aquí.
// ═══════════════════════════════════════════════════════════

/**
 * Lee un valor del store persistente via IPC.
 */
export async function getCache<T>(key: string): Promise<T | undefined> {
  try {
    if (!window.electron) return undefined;
    return (await window.electron.getStore(key)) as T;
  } catch {
    return undefined;
  }
}

/**
 * Escribe un valor en el store persistente via IPC.
 */
export async function setCache(key: string, value: unknown): Promise<void> {
  try {
    if (!window.electron) return;
    await window.electron.setStore(key, value);
  } catch {
    // Silenciar errores de IPC en desarrollo
  }
}

/**
 * Limpia todas las claves del store.
 */
export async function clearCache(): Promise<void> {
  const keys = ['token', 'userPrefs', 'providerCache', 'watchProgress'];
  await Promise.all(keys.map((k) => setCache(k, undefined)));
}
