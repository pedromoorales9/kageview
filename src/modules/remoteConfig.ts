// ═══════════════════════════════════════════════════════════
// Remote Config — anuncios y servicios desactivados, controlados por el equipo
//
// Antes vivía en un JSON de gh-pages editado con un token de GitHub. Ahora sale
// de Supabase (tablas `announcements` y `provider_switches`): se lee sin sesión
// y solo el staff (admin/owner) puede escribir, verificado por RLS.
//
// SIEMPRE fail-open: si el servidor no responde, la app se comporta como si no
// hubiera avisos ni servicios desactivados (o conserva lo último que supo).
// ═══════════════════════════════════════════════════════════

import { useAppStore } from './store';
import { getBackend } from './backend';
import type { Announcement } from './backend';

export interface RemoteConfig {
  /** Anuncios vigentes ahora mismo (más recientes primero). */
  announcements: Announcement[];
  /** providerId → motivo. Aplica a providers de anime y manga. */
  providersDisabled: Record<string, string>;
}

/** Cada cuánto se vuelve a consultar (los avisos no son en tiempo real). */
export const REMOTE_CONFIG_REFRESH_MS = 5 * 60 * 1000;

/**
 * Lee la configuración pública. Devuelve null si no hay backend o si TODO
 * falla; si solo falla una parte, conserva el valor anterior de esa parte.
 */
export async function fetchRemoteConfig(): Promise<RemoteConfig | null> {
  const backend = getBackend();
  if (!backend) return null;

  const [ann, sw] = await Promise.allSettled([
    backend.listActiveAnnouncements(),
    backend.listProviderSwitches(),
  ]);
  if (ann.status === 'rejected' && sw.status === 'rejected') return null; // fail-open

  const prev = useAppStore.getState().remoteConfig;
  return {
    announcements: ann.status === 'fulfilled' ? ann.value : prev?.announcements ?? [],
    providersDisabled:
      sw.status === 'fulfilled'
        ? Object.fromEntries(sw.value.map((s) => [s.providerId, s.reason || 'Desactivado temporalmente.']))
        : prev?.providersDisabled ?? {},
  };
}

/** Recarga la configuración y la publica en el store (también usado por el panel admin). */
export async function refreshRemoteConfig(): Promise<void> {
  const rc = await fetchRemoteConfig();
  if (rc) useAppStore.getState().setRemoteConfig(rc);
}

/**
 * Motivo por el que un provider está desactivado remotamente,
 * o null si está operativo. Vale para providers de anime y manga.
 */
export function remoteDisableReason(providerId: string): string | null {
  const rc = useAppStore.getState().remoteConfig;
  return rc?.providersDisabled?.[providerId] ?? null;
}
