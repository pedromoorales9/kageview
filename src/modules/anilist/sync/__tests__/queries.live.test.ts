// En vivo (LIVE=1): las consultas EXACTAS de la app contra la API real de AniList.
//  · Lectura: con la lista PÚBLICA de un usuario (no hace falta token).
//  · Escritura: sin sesión. GraphQL valida el documento ANTES de comprobar la autorización,
//    así que si la sintaxis/tipos fueran incorrectos el error sería de validación, no «Unauthorized».
import { describe, it, expect } from 'vitest';
import { ENTRY_QUERY, LIST_QUERY, SEARCH_MANGA_QUERY, VIEWER_QUERY, buildSaveBatch, parseEntry, parseListChunk, parseMedia } from '../queries';

const live = process.env.LIVE ? describe : describe.skip;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gql(query: string, variables: Record<string, unknown> = {}) {
  await sleep(800);
  const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }) });
  return { status: res.status, body: (await res.json()) as any };
}

live('Consultas de AniList (API real)', () => {
  it('búsqueda de manga: devuelve fichas que la app sabe leer', async () => {
    const { body } = await gql(SEARCH_MANGA_QUERY, { q: 'Berserk', perPage: 5 });
    expect(body.errors).toBeUndefined();
    const media = (body.data.Page.media as unknown[]).map((m) => parseMedia(m, 'MANGA'));
    expect(media.length).toBeGreaterThan(0);
    expect(media.every((m) => m && m.id > 0 && m.type === 'MANGA')).toBe(true);
  });

  it('lista de manga y de anime de un usuario PÚBLICO: la consulta es válida y el lector la interpreta', async () => {
    for (const type of ['MANGA', 'ANIME'] as const) {
      const { body } = await gql(LIST_QUERY, { userId: 5, type, chunk: 1, perChunk: 20 });
      expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
      const { entries } = parseListChunk(body.data, type);
      if (entries.length > 0) {
        const e = entries[0];
        expect(e.mediaId).toBeGreaterThan(0);
        expect(['CURRENT', 'PLANNING', 'COMPLETED', 'DROPPED', 'PAUSED', 'REPEATING']).toContain(e.status);
        expect(e.score).toBeGreaterThanOrEqual(0);
        expect(e.score).toBeLessThanOrEqual(100);                       // POINT_100
        expect(e.updatedAt).toBeGreaterThan(1_000_000_000_000);         // ms
        expect(e.media.title.romaji ?? e.media.title.english).toBeTruthy();
      }
      console.log(`lista ${type} del usuario 5: ${entries.length} entradas leídas`);
    }
  });

  it('una entrada concreta (o «no está»): la consulta es válida', async () => {
    const { body } = await gql(ENTRY_QUERY, { userId: 5, mediaId: 30002 });
    const missing = body.errors?.[0]?.status === 404;
    expect(missing || body.errors === undefined, JSON.stringify(body.errors)).toBe(true);
    if (!missing) expect(parseEntry(body.data.MediaList, 'MANGA')?.mediaId).toBe(30002);
  });

  it('el usuario conectado: sin token la consulta es válida y AniList responde «no autenticado»', async () => {
    const { body } = await gql(VIEWER_QUERY);
    expect(JSON.stringify(body)).not.toMatch(/Cannot query field|Unknown|Validation|Syntax/i);
  });

  it('escritura por lotes: sin sesión AniList la rechaza por falta de autorización, NO por sintaxis o tipos', async () => {
    const { query, variables } = buildSaveBatch([
      { mediaId: 30002, status: 'CURRENT', progress: 3 },
      { mediaId: 21, status: 'COMPLETED', progress: 12, score: 85 },
      { mediaId: 105398, status: 'PAUSED', progress: 0 },
    ]);
    const { body } = await gql(query, variables);
    const msg = JSON.stringify(body.errors ?? body);
    expect(msg).not.toMatch(/Cannot query field|Unknown|Validation|Syntax|Expected|Variable|Argument/i);
    expect(msg).toMatch(/unauthor|logged in|authenticat/i);
  });
});
