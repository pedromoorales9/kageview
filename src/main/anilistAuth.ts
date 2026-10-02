// ═══════════════════════════════════════════════════════════
// anilistAuth — conexión del usuario con su cuenta de AniList (proceso principal)
//
//  · Flujo OAuth «implícito»: se abre el navegador en AniList y vuelve con
//    kageview://anilist-auth#access_token=… (no hace falta ningún secreto).
//  · El token vive SOLO aquí: se guarda cifrado con el llavero del sistema
//    (safeStorage) en un archivo propio que la interfaz no puede leer, y nunca se
//    envía a la interfaz ni a Supabase. La interfaz pide operaciones y aquí se les
//    añade la cabecera Authorization.
//  · Solo se aceptan operaciones de una lista cerrada (ver anilistAuthCore).
// ═══════════════════════════════════════════════════════════

import { BrowserWindow, ipcMain, net, safeStorage, shell } from 'electron';
import crypto from 'crypto';
import Store from 'electron-store';
import {
  ANILIST_AUTH_HOST,
  PendingLogin,
  RateLimiter,
  buildAuthorizeUrl,
  isAllowedOperation,
  isPlausibleToken,
  isValidClientId,
  parseAuthCallback,
  parseManualToken,
  retryAfterMs,
} from './anilistAuthCore';
import { VIEWER_QUERY } from '../modules/anilist/sync/queries';
import type { AniListStatus, AniListUser } from '../modules/anilist/sync/bridge';

const GRAPHQL = 'https://graphql.anilist.co';
const CLIENT_ID = process.env.ANILIST_CLIENT_ID ?? '';

// Archivo propio: el IPC genérico `get-store` solo lee el almacén principal
const authStore = new Store<{ auth?: PersistedAuth }>({ name: 'anilist-auth' });

interface PersistedAuth {
  v: 1;
  /** Token cifrado con safeStorage (base64). */
  enc: string;
  expiresAt: number;
  user: AniListUser;
}

let token: string | null = null;
let user: AniListUser | null = null;
let expiresAt: number | null = null;
let persistent = true;

const pending = new PendingLogin();
const limiter = new RateLimiter();
let getWindow: () => BrowserWindow | null = () => null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function getStatus(): AniListStatus {
  return { configured: isValidClientId(CLIENT_ID), connected: !!token && !!user, user, expiresAt, persistent };
}

function broadcast(): void {
  const win = getWindow();
  if (win && !win.isDestroyed()) win.webContents.send('anilist-status', getStatus());
}

// ─── Persistencia (cifrada) ────────────────────────────────
function persist(): void {
  if (!token || !user || !expiresAt) return;
  if (!safeStorage.isEncryptionAvailable()) {
    persistent = false; // sin llavero no se guarda en disco: solo en memoria
    return;
  }
  persistent = true;
  authStore.set('auth', {
    v: 1,
    enc: safeStorage.encryptString(token).toString('base64'),
    expiresAt,
    user,
  });
}

function load(): void {
  const saved = authStore.get('auth');
  if (!saved || saved.v !== 1 || !saved.enc || !saved.user || !saved.expiresAt) return;
  if (saved.expiresAt <= Date.now() || !safeStorage.isEncryptionAvailable()) {
    authStore.delete('auth');
    return;
  }
  try {
    const t = safeStorage.decryptString(Buffer.from(saved.enc, 'base64'));
    if (!isPlausibleToken(t)) throw new Error('token no válido');
    token = t;
    user = saved.user;
    expiresAt = saved.expiresAt;
  } catch {
    authStore.delete('auth'); // cambió la cuenta del sistema o el archivo está dañado
  }
}

function clear(): void {
  token = null;
  user = null;
  expiresAt = null;
  authStore.delete('auth');
  broadcast();
}

// ─── Peticiones a AniList ──────────────────────────────────
type GqlResult = { ok: true; status: number; data: unknown } | { ok: false; status: number; error: string; message?: string };

async function gql(query: string, variables: unknown, bearer: string, allowRetry = true): Promise<GqlResult> {
  await sleep(limiter.reserve(Date.now()));
  let res: Response;
  try {
    res = await net.fetch(GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ query, variables: variables ?? {} }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false, status: 0, error: 'network' };
  }

  if (res.status === 429) {
    const wait = retryAfterMs(res.headers.get('retry-after'));
    limiter.penalize(Date.now(), wait);
    return allowRetry && wait <= 60_000 ? gql(query, variables, bearer, false) : { ok: false, status: 429, error: 'rate_limited' };
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* cuerpo no JSON (p. ej. página de Cloudflare) */
  }
  if (res.status === 401 || res.status === 400 && /invalid token|unauthor/i.test(JSON.stringify(body?.errors ?? ''))) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }
  if (res.status === 403 || /temporarily disabled|api has been/i.test(JSON.stringify(body?.errors ?? ''))) {
    return { ok: false, status: res.status, error: 'down' };
  }
  if (!res.ok) return { ok: false, status: res.status, error: 'http', message: body?.errors?.[0]?.message };
  return { ok: true, status: res.status, data: body };
}

/** Comprueba el token contra AniList y, si vale, lo guarda. */
async function verifyAndStore(candidate: string, expiresIn: number): Promise<{ ok: boolean; error?: string }> {
  const res = await gql(VIEWER_QUERY, {}, candidate);
  if (!res.ok) return { ok: false, error: res.error === 'unauthorized' ? 'invalid_token' : res.error };
  const v = (res.data as { data?: { Viewer?: { id?: number; name?: string; avatar?: { large?: string; medium?: string } } } })?.data?.Viewer;
  if (!v || typeof v.id !== 'number' || typeof v.name !== 'string') return { ok: false, error: 'invalid_token' };
  token = candidate;
  user = { id: v.id, name: v.name.slice(0, 60), avatar: v.avatar?.large ?? v.avatar?.medium ?? null };
  expiresAt = Date.now() + expiresIn * 1000;
  persist();
  broadcast();
  return { ok: true };
}

// ─── Enlace de vuelta ──────────────────────────────────────
export function isAniListCallbackUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'kageview:' && u.hostname === ANILIST_AUTH_HOST;
  } catch {
    return false;
  }
}

/** kageview://anilist-auth#access_token=… (solo vale tras pulsar «Conectar», una vez y dentro del plazo). */
export function handleAniListCallback(url: string): void {
  const parsed = parseAuthCallback(url);
  if (!pending.consume(Date.now(), parsed?.state ?? null)) {
    console.warn('[AniList] Enlace de vuelta ignorado (sin inicio de sesión en curso, caducado o no válido)');
    return;
  }
  if (!parsed) {
    console.warn('[AniList] La vuelta de AniList no traía un token válido');
    return;
  }
  void verifyAndStore(parsed.token, parsed.expiresIn).then((r) => {
    if (!r.ok) console.warn('[AniList] Token rechazado:', r.error);
    getWindow()?.webContents.send('anilist-login-result', r);
  });
}

// ─── IPC ───────────────────────────────────────────────────
export function initAniList(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter;
  // Solo desarrollo: AniList de mentira (la condición debe ser LITERAL para que no entre en producción)
  if (process.env.KAGEVIEW_ANILIST === 'mock') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('./anilistMock').registerAniListMock(getWindow);
    return;
  }
  load();

  /** Solo la ventana principal puede usar estas funciones (no los reproductores incrustados). */
  const fromMain = (e: Electron.IpcMainInvokeEvent) => {
    const w = getWindow();
    return !!w && e.sender === w.webContents;
  };

  ipcMain.handle('anilist-status', (e) => (fromMain(e) ? getStatus() : null));

  ipcMain.handle('anilist-login', async (e) => {
    if (!fromMain(e)) return { ok: false, error: 'forbidden' };
    const state = crypto.randomBytes(16).toString('hex');
    const url = buildAuthorizeUrl(CLIENT_ID, state);
    if (!url) return { ok: false, error: 'not_configured' };
    pending.start(state, Date.now());
    await shell.openExternal(url);
    return { ok: true };
  });

  /** Plan B: el usuario pega el token (o la dirección a la que le redirigió AniList). */
  ipcMain.handle('anilist-submit-token', async (e, text: unknown) => {
    if (!fromMain(e)) return { ok: false, error: 'forbidden' };
    const parsed = typeof text === 'string' ? parseManualToken(text) : null;
    if (!parsed) return { ok: false, error: 'invalid_token' };
    return verifyAndStore(parsed.token, parsed.expiresIn);
  });

  ipcMain.handle('anilist-logout', (e) => {
    if (!fromMain(e)) return false;
    pending.consume(Date.now(), null);
    clear();
    return true;
  });

  ipcMain.handle('anilist-request', async (e, req: { query?: unknown; variables?: unknown }) => {
    if (!fromMain(e)) return { ok: false, status: 0, error: 'forbidden' };
    if (!token) return { ok: false, status: 0, error: 'not_connected' };
    if (expiresAt && expiresAt <= Date.now()) {
      clear();
      return { ok: false, status: 401, error: 'unauthorized' };
    }
    if (!isAllowedOperation(req?.query, req?.variables)) return { ok: false, status: 0, error: 'not_allowed' };
    const res = await gql(req.query as string, req.variables, token);
    if (!res.ok && res.error === 'unauthorized') clear(); // revocado o caducado
    return res;
  });
}
