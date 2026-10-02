// ═══════════════════════════════════════════════════════════
// api — operaciones sobre AniList para la sincronización
//
//  · Lo que lleva el token del usuario (su lista, escribir) pasa por el proceso
//    principal (`window.electron.anilistRequest`): el token nunca llega aquí.
//  · La búsqueda de fichas es pública y usa el cliente de siempre.
//  · El transporte se puede sustituir (`__setTransportForTests`) para probar sin red.
// ═══════════════════════════════════════════════════════════

import { gqlRequest } from '../client';
import type { AniListStatus, BridgeResult } from './bridge';
import {
  ENTRY_QUERY,
  LIST_QUERY,
  SEARCH_MANGA_QUERY,
  VIEWER_QUERY,
  buildSaveBatch,
  parseEntry,
  parseListChunk,
  parseMedia,
  parseViewer,
} from './queries';
import type { ALEntry, ALMedia, ALSave, ALType, ALViewer } from './types';

export type ApiErrorCode =
  | 'not_connected'
  | 'unauthorized'
  | 'rate_limited'
  | 'network'
  | 'down'
  | 'not_allowed'
  | 'forbidden'
  | 'http'
  | 'graphql';

export class AniListApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  constructor(code: ApiErrorCode, message?: string, status = 0) {
    super(message ?? code);
    this.name = 'AniListApiError';
    this.code = code;
    this.status = status;
  }
}

export interface Transport {
  /** Con el token del usuario (vía proceso principal). */
  auth(query: string, variables?: Record<string, unknown>): Promise<BridgeResult>;
  /** Público (sin token). */
  pub(query: string, variables?: Record<string, unknown>): Promise<unknown>;
  status(): Promise<AniListStatus | null>;
}

const defaultTransport: Transport = {
  auth: async (query, variables) => {
    if (typeof window === 'undefined' || !window.electron?.anilistRequest) return { ok: false, status: 0, error: 'not_connected' };
    return window.electron.anilistRequest(query, variables);
  },
  pub: (query, variables) => gqlRequest<unknown>(query, variables ?? {}),
  status: async () => (typeof window !== 'undefined' && window.electron?.anilistStatus ? window.electron.anilistStatus() : null),
};

let transport: Transport = defaultTransport;
export const __setTransportForTests = (t: Transport | null): void => {
  transport = t ?? defaultTransport;
};

export const getStatus = (): Promise<AniListStatus | null> => transport.status();

/** Consulta con token. Devuelve `data` o lanza `AniListApiError`. */
async function authQuery(query: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await transport.auth(query, variables);
  if (!res.ok) {
    const code = (['not_connected', 'unauthorized', 'rate_limited', 'network', 'down', 'not_allowed', 'forbidden'] as const).find((c) => c === res.error);
    throw new AniListApiError(code ?? 'http', res.message ?? res.error, res.status);
  }
  const body = res.data as { data?: Record<string, unknown>; errors?: Array<{ message?: string; status?: number }> } | null;
  if (body?.errors?.length) {
    throw new AniListApiError('graphql', body.errors[0]?.message ?? 'Error de AniList', body.errors[0]?.status ?? 0);
  }
  return body?.data ?? {};
}

export async function fetchViewer(): Promise<ALViewer> {
  const v = parseViewer(await authQuery(VIEWER_QUERY));
  if (!v) throw new AniListApiError('http', 'Respuesta de AniList no válida');
  return v;
}

const PER_CHUNK = 500;
const MAX_CHUNKS = 20;

/** Toda la lista del usuario (anime o manga), sin duplicados de las listas personalizadas. */
export async function fetchList(type: ALType, userId: number): Promise<ALEntry[]> {
  const byMedia = new Map<number, ALEntry>();
  for (let chunk = 1; chunk <= MAX_CHUNKS; chunk++) {
    const data = await authQuery(LIST_QUERY, { userId, type, chunk, perChunk: PER_CHUNK });
    const { entries, hasNext } = parseListChunk(data, type);
    for (const e of entries) {
      const prev = byMedia.get(e.mediaId);
      if (!prev || e.updatedAt > prev.updatedAt) byMedia.set(e.mediaId, e);
    }
    if (!hasNext) break;
  }
  return [...byMedia.values()];
}

/** Una entrada concreta (null si no está en la lista). */
export async function fetchEntry(userId: number, mediaId: number, type: ALType): Promise<ALEntry | null> {
  try {
    const data = await authQuery(ENTRY_QUERY, { userId, mediaId });
    return parseEntry((data as { MediaList?: unknown }).MediaList, type);
  } catch (e) {
    if (e instanceof AniListApiError && e.code === 'graphql' && e.status === 404) return null;
    throw e;
  }
}

const BATCH = 20;

export interface SaveResult {
  ok: number[];
  failed: Array<{ mediaId: number; error: AniListApiError }>;
}

/**
 * Crea/actualiza entradas en lotes. Si un lote falla (p. ej. una obra que AniList
 * rechaza), se reintenta una a una para aislar la culpable sin perder el resto.
 * Los fallos de conexión/autenticación/límite NO se reintentan: se propagan.
 */
export async function saveEntries(items: readonly ALSave[]): Promise<SaveResult> {
  const out: SaveResult = { ok: [], failed: [] };
  for (let i = 0; i < items.length; i += BATCH) {
    const slice = items.slice(i, i + BATCH);
    try {
      const { query, variables } = buildSaveBatch(slice);
      await authQuery(query, variables);
      out.ok.push(...slice.map((s) => s.mediaId));
    } catch (err) {
      if (!(err instanceof AniListApiError) || err.code !== 'graphql' || slice.length === 1) {
        if (slice.length === 1 && err instanceof AniListApiError && err.code === 'graphql') {
          out.failed.push({ mediaId: slice[0].mediaId, error: err });
          continue;
        }
        throw err;
      }
      for (const one of slice) {
        try {
          const { query, variables } = buildSaveBatch([one]);
          await authQuery(query, variables);
          out.ok.push(one.mediaId);
        } catch (e2) {
          if (e2 instanceof AniListApiError && e2.code === 'graphql') out.failed.push({ mediaId: one.mediaId, error: e2 });
          else throw e2;
        }
      }
    }
  }
  return out;
}

/** Fichas de manga por título (búsqueda pública, sin token). */
export async function searchManga(term: string, perPage = 8): Promise<ALMedia[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const data = (await transport.pub(SEARCH_MANGA_QUERY, { q, perPage })) as { Page?: { media?: unknown[] } } | null;
  return (data?.Page?.media ?? []).map((m) => parseMedia(m, 'MANGA')).filter((m): m is ALMedia => m !== null);
}
