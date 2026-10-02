// Un AniList de mentira para probar la sincronización: lista de anime y de manga del
// usuario, catálogo para buscar, escritura por lotes y errores que se pueden provocar.
import { ENTRY_QUERY, LIST_QUERY, SEARCH_MANGA_QUERY, VIEWER_QUERY } from '../queries';
import type { Transport } from '../api';
import type { BridgeResult, AniListStatus } from '../bridge';
import type { ALStatus, ALType } from '../types';

export interface RawMedia {
  id: number; type: ALType; format: string; title: { romaji: string; english?: string | null; native?: string | null };
  synonyms?: string[]; chapters?: number | null; episodes?: number | null; popularity?: number;
}

export const rawMedia = (m: RawMedia) => ({
  id: m.id, idMal: null, type: m.type, format: m.format, status: 'RELEASING', isAdult: false, popularity: m.popularity ?? 100,
  averageScore: 80, episodes: m.episodes ?? null, chapters: m.chapters ?? null,
  title: { romaji: m.title.romaji, english: m.title.english ?? null, native: m.title.native ?? null },
  synonyms: m.synonyms ?? [], genres: ['Action'],
  coverImage: { extraLarge: `https://s4.anilist.co/file/${m.id}.jpg`, large: `https://s4.anilist.co/file/${m.id}-l.jpg`, color: null },
  bannerImage: null, seasonYear: null, startDate: { year: 2000 },
});

export interface RemoteRow { mediaId: number; status: ALStatus; progress: number; score: number; updatedAt: number }

export class FakeAniList {
  viewer = { id: 777, name: 'tester', avatar: { large: 'https://s4.anilist.co/u.png' } };
  connected = true;
  catalog: RawMedia[] = [];
  lists: Record<ALType, Map<number, RemoteRow>> = { ANIME: new Map(), MANGA: new Map() };
  /** Todo lo que se ha escrito, en orden. */
  saves: Array<{ mediaId: number; status: ALStatus; progress: number; scoreRaw?: number }> = [];
  calls = { list: 0, search: 0, save: 0, viewer: 0 };
  failIds = new Set<number>();
  /** Dev: si una obra no está en el catálogo, se inventa una ficha en vez de fallar (los tests la dejan estricta). */
  lenient = false;
  nextAuthError: BridgeResult | null = null;
  clock = 1_800_000_000; // segundos

  addMedia(m: RawMedia) { this.catalog.push(m); }
  setEntry(type: ALType, row: Omit<RemoteRow, 'updatedAt'> & { updatedAt?: number }) {
    this.lists[type].set(row.mediaId, { updatedAt: this.clock++, ...row });
  }
  private media(id: number) {
    const m = this.catalog.find((c) => c.id === id);
    if (m) return rawMedia(m);
    if (!this.lenient) throw new Error(`media ${id} no está en el catálogo falso`);
    return rawMedia({ id, type: 'MANGA', format: 'MANGA', title: { romaji: `Obra ${id}` } });
  }
  private entry(type: ALType, r: RemoteRow) {
    return { id: r.mediaId * 10, mediaId: r.mediaId, status: r.status, progress: r.progress, score: r.score, updatedAt: r.updatedAt, media: this.media(r.mediaId) };
  }

  status(): Promise<AniListStatus | null> {
    return Promise.resolve({ configured: true, connected: this.connected, user: this.connected ? { id: this.viewer.id, name: this.viewer.name, avatar: null } : null, expiresAt: Date.now() + 1e9, persistent: true });
  }

  async auth(query: string, variables: Record<string, unknown> = {}): Promise<BridgeResult> {
    if (this.nextAuthError) { const e = this.nextAuthError; this.nextAuthError = null; return e; }
    if (!this.connected) return { ok: false, status: 0, error: 'not_connected' };
    const ok = (data: unknown): BridgeResult => ({ ok: true, status: 200, data: { data } });
    if (query === VIEWER_QUERY) { this.calls.viewer++; return ok({ Viewer: this.viewer }); }
    if (query === LIST_QUERY) {
      this.calls.list++;
      const type = variables.type as ALType;
      const rows = [...this.lists[type].values()];
      const per = (variables.perChunk as number) ?? 500;
      const chunk = (variables.chunk as number) ?? 1;
      const slice = rows.slice((chunk - 1) * per, chunk * per);
      // AniList reparte por listas de estado: se simula con una lista por estado
      const byStatus = new Map<string, RemoteRow[]>();
      slice.forEach((r) => byStatus.set(r.status, [...(byStatus.get(r.status) ?? []), r]));
      return ok({ MediaListCollection: { hasNextChunk: chunk * per < rows.length, lists: [...byStatus.values()].map((rs) => ({ entries: rs.map((r) => this.entry(type, r)) })) } });
    }
    if (query === ENTRY_QUERY) {
      const mediaId = variables.mediaId as number;
      const r = this.lists.MANGA.get(mediaId) ?? this.lists.ANIME.get(mediaId);
      if (!r) return { ok: true, status: 200, data: { errors: [{ message: 'Not Found.', status: 404 }], data: { MediaList: null } } };
      return ok({ MediaList: this.entry('MANGA', r) });
    }
    if (query.startsWith('mutation')) {
      this.calls.save++;
      const batch: Array<{ mediaId: number; status: ALStatus; progress: number; scoreRaw?: number }> = [];
      for (let i = 0; `m${i}` in variables; i++) {
        batch.push({ mediaId: variables[`m${i}`] as number, status: variables[`s${i}`] as ALStatus, progress: variables[`p${i}`] as number, ...(`r${i}` in variables ? { scoreRaw: variables[`r${i}`] as number } : {}) });
      }
      const bad = batch.find((b) => this.failIds.has(b.mediaId));
      if (bad) return { ok: true, status: 200, data: { errors: [{ message: `Media ${bad.mediaId} no existe`, status: 400 }] } };
      for (const b of batch) {
        this.saves.push(b);
        const type: ALType = this.catalog.find((c) => c.id === b.mediaId)?.type ?? 'MANGA';
        this.lists[type].set(b.mediaId, { mediaId: b.mediaId, status: b.status, progress: b.progress, score: b.scoreRaw ?? this.lists[type].get(b.mediaId)?.score ?? 0, updatedAt: this.clock++ });
      }
      return ok(Object.fromEntries(batch.map((b, i) => [`w${i}`, { id: 1, mediaId: b.mediaId }])));
    }
    return { ok: false, status: 0, error: 'not_allowed' };
  }

  async pub(query: string, variables: Record<string, unknown> = {}): Promise<unknown> {
    if (query !== SEARCH_MANGA_QUERY) throw new Error('consulta pública inesperada');
    this.calls.search++;
    const q = String(variables.q).toLowerCase();
    const media = this.catalog.filter((m) => m.type === 'MANGA').filter((m) => [m.title.romaji, m.title.english ?? '', ...(m.synonyms ?? [])].some((t) => t.toLowerCase().includes(q)));
    return { Page: { media: media.map(rawMedia) } };
  }

  transport(): Transport {
    return { auth: (q, v) => this.auth(q, v), pub: (q, v) => this.pub(q, v), status: () => this.status() };
  }
}
