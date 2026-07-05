// ═══════════════════════════════════════════════════════════
// AniList GraphQL Client
// Envía queries/mutaciones a https://graphql.anilist.co
// ═══════════════════════════════════════════════════════════

import { proxyPost, ProxyHttpError } from '../httpProxy';

const ANILIST_GQL = 'https://graphql.anilist.co';

/** Mensaje mostrado al usuario cuando AniList no está disponible. */
export const ANILIST_DOWN_MESSAGE =
  'AniList está temporalmente fuera de servicio. No es un problema de KageView ' +
  'ni de tu conexión — inténtalo de nuevo más tarde.';

/** AniList ha deshabilitado su API o la está bloqueando (mantenimiento, caída…). */
export class AniListDownError extends Error {
  readonly isAniListDown = true;
  /** Aviso original de AniList, para logs/depuración. */
  readonly detail?: string;

  constructor(detail?: string) {
    super(ANILIST_DOWN_MESSAGE);
    this.name = 'AniListDownError';
    this.detail = detail;
  }
}

export function isAniListDown(err: unknown): err is AniListDownError {
  return err instanceof Error && (err as AniListDownError).isAniListDown === true;
}

interface GqlErrorBody {
  errors?: Array<{ message: string }>;
}

/** Extrae el primer mensaje de error GraphQL de un cuerpo de respuesta. */
function gqlErrorMessage(body: unknown): string | null {
  const errors = (body as GqlErrorBody | null)?.errors;
  if (Array.isArray(errors) && errors.length > 0 && errors[0]?.message) {
    return errors[0].message;
  }
  return null;
}

function looksLikeApiDisabled(message: string | null): boolean {
  if (!message) return false;
  const low = message.toLowerCase();
  return low.includes('temporarily disabled') || low.includes('api has been');
}

/**
 * Ejecuta una query GraphQL contra la API de AniList.
 * Si se proporciona un token, se incluye en el header Authorization.
 */
export async function gqlRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let data: { data: T; errors?: Array<{ message: string }> };
  try {
    const res = await proxyPost<{
      data: T;
      errors?: Array<{ message: string }>;
    }>(
      ANILIST_GQL,
      { query, variables },
      { headers, timeout: 15000, validateStatus: 'lenient' }
    );
    data = res.data;
  } catch (err) {
    if (err instanceof ProxyHttpError) {
      const detail = gqlErrorMessage(err.data);
      // 403 = Cloudflare/API deshabilitada; el aviso de "temporarily disabled"
      // puede llegar también con otros status.
      if (err.status === 403 || looksLikeApiDisabled(detail)) {
        throw new AniListDownError(detail ?? undefined);
      }
      // Propagar el mensaje real de AniList si existe (p. ej. rate limit)
      if (detail) throw new Error(detail);
    }
    throw err;
  }

  const typed = data as { data: T; errors?: Array<{ message: string }> };
  if (typed.errors && typed.errors.length > 0) {
    const message = typed.errors[0].message;
    if (looksLikeApiDisabled(message)) {
      throw new AniListDownError(message);
    }
    throw new Error(message);
  }

  return typed.data;
}
