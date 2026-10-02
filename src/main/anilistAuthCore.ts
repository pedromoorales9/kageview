// ═══════════════════════════════════════════════════════════
// anilistAuthCore — lógica PURA de la conexión con AniList (con tests)
//
// El token de AniList NUNCA sale del proceso principal: la interfaz solo pide
// operaciones y el proceso principal les pone la cabecera Authorization. Aquí
// están las reglas: URL de autorización, lectura del enlace de vuelta, ventana de
// tiempo en la que se acepta, lista cerrada de operaciones GraphQL permitidas y
// control del ritmo de peticiones.
// ═══════════════════════════════════════════════════════════

import { ENTRY_QUERY, LIST_QUERY, VIEWER_QUERY } from '../modules/anilist/sync/queries';

/** `kageview://anilist-auth#access_token=…` */
export const ANILIST_AUTH_HOST = 'anilist-auth';
export const ANILIST_REDIRECT = `kageview://${ANILIST_AUTH_HOST}`;
/** Tiempo máximo entre pulsar «Conectar» y volver con el token. */
export const LOGIN_TTL_MS = 10 * 60 * 1000;
export const MAX_BATCH = 25;

/** El client_id de AniList es un número entero. */
export const isValidClientId = (id: unknown): id is string => typeof id === 'string' && /^\d{1,10}$/.test(id);

export function buildAuthorizeUrl(clientId: string, state: string): string | null {
  if (!isValidClientId(clientId)) return null;
  const u = new URL('https://anilist.co/api/v2/oauth/authorize');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('response_type', 'token');
  u.searchParams.set('state', state);
  return u.toString();
}

/** Los tokens de AniList son JWT: letras, números y . _ - (se acepta un margen). */
export const isPlausibleToken = (t: unknown): boolean => typeof t === 'string' && /^[A-Za-z0-9._~+/=-]{20,4000}$/.test(t);

export interface ParsedCallback {
  token: string;
  /** Segundos de validez (AniList: 1 año). */
  expiresIn: number;
  state: string | null;
}

/** Lee el token del fragmento de `kageview://anilist-auth#access_token=…&expires_in=…`. */
export function parseAuthCallback(url: string): ParsedCallback | null {
  if (typeof url !== 'string' || url.length > 8192) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'kageview:' || u.hostname !== ANILIST_AUTH_HOST) return null;
  return parseFragment(u.hash);
}

function parseFragment(hash: string): ParsedCallback | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('access_token');
  if (token === null || !isPlausibleToken(token)) return null;
  const type = params.get('token_type');
  if (type && type.toLowerCase() !== 'bearer') return null;
  const exp = Number(params.get('expires_in'));
  return {
    token,
    expiresIn: Number.isFinite(exp) && exp > 0 ? Math.min(exp, 2 * 365 * 86400) : 365 * 86400,
    state: params.get('state'),
  };
}

/**
 * Entrada manual (plan B si el navegador no abre la app): acepta el token suelto o
 * la dirección completa a la que redirigió AniList.
 */
export function parseManualToken(text: string): ParsedCallback | null {
  const t = (text ?? '').trim();
  if (!t || t.length > 8192) return null;
  if (isPlausibleToken(t)) return { token: t, expiresIn: 365 * 86400, state: null };
  const hash = t.includes('#') ? t.slice(t.indexOf('#')) : t.startsWith('access_token=') ? `#${t}` : '';
  return hash ? parseFragment(hash) : null;
}

/** Un inicio de sesión en curso: solo se acepta una vuelta mientras esté vigente y UNA vez. */
export class PendingLogin {
  private started = false;
  private startedAt = 0;
  private state: string | null = null;

  start(state: string, now: number): void {
    this.started = true;
    this.startedAt = now;
    this.state = state;
  }

  /** Devuelve true si procede aceptar la vuelta (y la consume). */
  consume(now: number, receivedState: string | null): boolean {
    const ok =
      this.started &&
      now - this.startedAt <= LOGIN_TTL_MS &&
      // Si AniList devuelve el `state`, tiene que ser el nuestro
      (receivedState === null || receivedState === this.state);
    this.started = false;
    this.state = null;
    return ok;
  }

  get active(): boolean {
    return this.started;
  }
}

// ─── Operaciones permitidas ────────────────────────────────
const squash = (q: string) => q.replace(/\s+/g, ' ').trim();
const STATIC_OPS = new Set([VIEWER_QUERY, LIST_QUERY, ENTRY_QUERY].map(squash));

// mutation ($m0: Int!, $s0: MediaListStatus!, $p0: Int!, $r0: Int, …) { w0: SaveMediaListEntry(mediaId: $m0, status: $s0, progress: $p0, scoreRaw: $r0) { id mediaId } … }
const VAR_DEFS = String.raw`\$m\d+: Int!, \$s\d+: MediaListStatus!, \$p\d+: Int!(?:, \$r\d+: Int)?`;
const FIELD = String.raw`w\d+: SaveMediaListEntry\(mediaId: \$m\d+, status: \$s\d+, progress: \$p\d+(?:, scoreRaw: \$r\d+)?\) \{ id mediaId \}`;
const BATCH_RE = new RegExp(`^mutation \\((?:${VAR_DEFS})(?:, (?:${VAR_DEFS}))*\\) \\{ ${FIELD}(?: ${FIELD})* \\}$`);

/**
 * Lista CERRADA de lo que la interfaz puede pedir con el token: leer el usuario y su
 * lista, y crear/actualizar entradas. No hay forma de borrar entradas ni de tocar
 * ajustes de la cuenta, aunque la interfaz estuviera comprometida.
 */
export function isAllowedOperation(query: unknown, variables: unknown): boolean {
  if (typeof query !== 'string' || query.length > 20000) return false;
  if (variables !== undefined && variables !== null && (typeof variables !== 'object' || Array.isArray(variables))) return false;
  if (JSON.stringify(variables ?? {}).length > 40000) return false;
  const q = squash(query);
  if (STATIC_OPS.has(q)) return true;
  if (!BATCH_RE.test(q)) return false;
  return (q.match(/SaveMediaListEntry\(/g) ?? []).length <= MAX_BATCH;
}

// ─── Ritmo de peticiones ───────────────────────────────────
/** AniList permite 90/min; se deja un margen. */
export const MIN_GAP_MS = 750;

/** Cuánto esperar antes de la siguiente petición (y la reserva). */
export class RateLimiter {
  private next = 0;
  constructor(private readonly gapMs = MIN_GAP_MS) {}

  reserve(now: number): number {
    const at = Math.max(now, this.next);
    this.next = at + this.gapMs;
    return at - now;
  }

  /** AniList pidió esperar (429): nada sale antes. */
  penalize(now: number, ms: number): void {
    this.next = Math.max(this.next, now + ms);
  }
}

/** `Retry-After` (segundos) → ms, con tope. */
export function retryAfterMs(header: string | null | undefined, fallbackMs = 30_000): number {
  const s = Number(header);
  return Number.isFinite(s) && s > 0 ? Math.min(s * 1000, 120_000) : fallbackMs;
}
