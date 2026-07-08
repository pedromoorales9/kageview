// ═══════════════════════════════════════════════════════════
// Remote Config — kill-switches y anuncios controlados por el dev
//
// La app lee un JSON público de la rama gh-pages del repo. El dev lo
// edita desde el Panel de Desarrollador (Ajustes) o a mano en GitHub.
// SIEMPRE fail-open: si el fichero no responde o está corrupto, la app
// se comporta como si no existiera.
// ═══════════════════════════════════════════════════════════

import { useAppStore } from './store';

// raw.githubusercontent sirve el contenido del branch directamente,
// sin depender del despliegue de GitHub Pages (que puede atascarse).
const CONFIG_URL =
  'https://raw.githubusercontent.com/pedromoorales9/kageview/gh-pages/remote-config.json';

const REPO = 'pedromoorales9/kageview';
const BRANCH = 'gh-pages';
const FILE_PATH = 'remote-config.json';

// ─── Tipos ──────────────────────────────────────────────────

export interface RemoteAnnouncement {
  /** Cambia el id para que todos los usuarios vean el aviso nuevo. */
  id: string;
  type?: 'info' | 'warning' | 'error';
  title?: string;
  message: string;
}

export interface RemoteConfig {
  /** Aviso a mostrar a los usuarios (una vez por id). */
  announcement?: RemoteAnnouncement | null;
  /** providerId → mensaje de motivo. Aplica a providers de anime y manga. */
  providersDisabled?: Record<string, string>;
}

// ─── Lectura (todas las apps) ───────────────────────────────

export async function fetchRemoteConfig(): Promise<RemoteConfig | null> {
  try {
    const res = await fetch(`${CONFIG_URL}?t=${Date.now()}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as RemoteConfig;
    return typeof json === 'object' && json !== null ? json : null;
  } catch {
    return null; // fail-open
  }
}

/**
 * Motivo por el que un provider está desactivado remotamente,
 * o null si está operativo. Vale para providers de anime y manga.
 */
export function remoteDisableReason(providerId: string): string | null {
  const rc = useAppStore.getState().remoteConfig;
  return rc?.providersDisabled?.[providerId] ?? null;
}

const SEEN_KEY = 'seenAnnouncementId';

/** true si el anuncio aún no se ha mostrado a este usuario. */
export function isAnnouncementUnseen(a: RemoteAnnouncement): boolean {
  return !!a?.id && localStorage.getItem(SEEN_KEY) !== a.id;
}

export function markAnnouncementSeen(a: RemoteAnnouncement): void {
  if (a?.id) localStorage.setItem(SEEN_KEY, a.id);
}

// ─── Escritura (solo el Panel de Desarrollador) ─────────────
// Usa la API de contenidos de GitHub con un PAT que vive únicamente
// en la máquina del dev (store local); nunca se incluye en la build.

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/** Codifica UTF-8 → base64 (btoa a secas rompe con tildes/emoji). */
function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

/**
 * Publica la configuración en gh-pages. Lanza Error con mensaje legible
 * si el token no vale o la API falla.
 */
export async function publishRemoteConfig(
  token: string,
  config: RemoteConfig
): Promise<void> {
  const apiUrl = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;

  // sha actual del fichero (necesario para actualizar; ausente si no existe)
  let sha: string | undefined;
  const current = await fetch(`${apiUrl}?ref=${BRANCH}`, { headers: ghHeaders(token) });
  if (current.status === 200) {
    sha = ((await current.json()) as { sha: string }).sha;
  } else if (current.status === 401 || current.status === 403) {
    throw new Error('Token de GitHub no válido o sin permisos sobre el repositorio.');
  } else if (current.status !== 404) {
    throw new Error(`GitHub respondió ${current.status} al leer el fichero.`);
  }

  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Panel de desarrollador: actualizar remote-config',
      content: toBase64Utf8(JSON.stringify(config, null, 2) + '\n'),
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub respondió ${res.status} al publicar. ${body.slice(0, 200)}`);
  }
}
