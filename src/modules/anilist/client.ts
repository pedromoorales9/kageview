// ═══════════════════════════════════════════════════════════
// AniList GraphQL Client
// Envía queries/mutaciones a https://graphql.anilist.co
// ═══════════════════════════════════════════════════════════

import { proxyPost } from '../httpProxy';

const ANILIST_GQL = 'https://graphql.anilist.co';

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

  const { data } = await proxyPost<{
    data: T;
    errors?: Array<{ message: string }>;
  }>(
    ANILIST_GQL,
    { query, variables },
    { headers, timeout: 15000, validateStatus: 'lenient' }
  );

  const typed = data as { data: T; errors?: Array<{ message: string }> };
  if (typed.errors && typed.errors.length > 0) {
    throw new Error(typed.errors[0].message);
  }

  return typed.data;
}
