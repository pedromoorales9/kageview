import { describe, it, expect, beforeEach } from 'vitest';
import { SupabaseBackend, mapError, parseMangaShare } from '../supabaseBackend';
import { MockBackend } from '../mockBackend';
import { BackendError, MangaSyncItem } from '../types';

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

/** Cliente de Supabase simulado que registra cada operación CON sus argumentos. */
function fakeClient(results: Array<{ data?: unknown; error?: unknown }>) {
  const log: Array<{ where: string; op: string; args: unknown[] }> = [];
  const queue = [...results];
  const make = (where: string) => {
    const chain: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null, ...(queue.shift() ?? {}) }).then(res, rej);
        }
        return (...args: unknown[]) => { log.push({ where, op: prop, args }); return chain; };
      },
    });
    return chain;
  };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: '11111111-1111-4111-8111-111111111111' } } }, error: null }) },
    from: (t: string) => make(t),
    rpc: (fn: string, args: unknown) => { log.push({ where: `rpc(${fn})`, op: 'call', args: [args] }); return make(`rpc(${fn})`); },
  };
  const backend = new SupabaseBackend('https://x.supabase.co', 'anon');
  (backend as unknown as { sb: unknown }).sb = client;
  return { backend, log };
}

const item = (over: Partial<MangaSyncItem> = {}): MangaSyncItem => ({
  source: 'mangadex', mangaId: 'm1', status: 'reading',
  manga: { id: 'm1', sourceId: 'mangadex', title: 'Frieren' },
  lastChapterId: 'c1', lastChapterNumber: '1', lastPage: 2, lastPageCount: 20, lastReadAt: '2026-09-20T10:00:00Z',
  readRanges: [[1, 3]], readResetAt: null, deleted: false, updatedAt: '2026-09-20T10:00:00Z', ...over,
});

describe('SupabaseBackend: biblioteca de manga', () => {
  it('sube por la función con los nombres de columna correctos y devuelve cuántos se aplicaron', async () => {
    const { backend, log } = fakeClient([{ data: 1 }]);
    expect(await backend.pushMangaEntries([item()])).toBe(1);
    const call = log.find((l) => l.where === 'rpc(manga_sync_push)')!;
    const sent = (call.args[0] as { items: Array<Record<string, unknown>> }).items[0];
    expect(sent).toMatchObject({
      source: 'mangadex', manga_id: 'm1', status: 'reading', last_chapter_id: 'c1', last_chapter_number: '1',
      last_page: 2, last_page_count: 20, read_ranges: [[1, 3]], deleted: false, updated_at: '2026-09-20T10:00:00Z',
    });
    expect(Object.keys(sent).some((k) => /[A-Z]/.test(k))).toBe(false); // todo en snake_case
  });

  it('sin nada que subir no llama al servidor', async () => {
    const { backend, log } = fakeClient([]);
    expect(await backend.pushMangaEntries([])).toBe(0);
    expect(log).toHaveLength(0);
  });

  it('si la migración no está aplicada, el error es "unavailable" (no un error opaco)', async () => {
    for (const code of ['PGRST202', 'PGRST205', '42P01', '42883']) {
      const { backend } = fakeClient([{ error: { code, message: 'no existe' } }]);
      await expect(backend.pushMangaEntries([item()])).rejects.toMatchObject({ code: 'unavailable' });
      const p = fakeClient([{ error: { code, message: 'no existe' } }]);
      await expect(p.backend.pullMangaEntries()).rejects.toMatchObject({ code: 'unavailable' });
    }
    expect(mapError({ code: '42501', message: 'permission denied' }).code).not.toBe('unavailable');
  });

  it('descarga solo lo mío y solo lo nuevo (por el sello del servidor)', async () => {
    const { backend, log } = fakeClient([{ data: [] }]);
    await backend.pullMangaEntries({ since: '2026-09-20T00:00:00Z', limit: 9999 });
    const ops = log.filter((l) => l.where === 'manga_entries');
    expect(ops.find((o) => o.op === 'eq')?.args).toEqual(['user_id', '11111111-1111-4111-8111-111111111111']);
    expect(ops.find((o) => o.op === 'gt')?.args).toEqual(['synced_at', '2026-09-20T00:00:00Z']);
    expect(ops.find((o) => o.op === 'order')?.args[0]).toBe('synced_at');
    expect(ops.find((o) => o.op === 'limit')?.args[0]).toBe(500);          // acotado
  });

  it('lee las filas a la defensiva (rangos y ficha corruptos no rompen nada)', async () => {
    const good = { source: 'mangadex', manga_id: 'a', status: 'reading', manga: { title: 'A' }, last_chapter_id: null, last_chapter_number: null, last_page: null, last_page_count: null, last_read_at: null, read_ranges: [[1, 2]], read_reset_at: null, deleted: false, updated_at: 'x', synced_at: 'y' };
    const { backend } = fakeClient([{ data: [good, { ...good, manga_id: 'b', manga: null, read_ranges: 'basura' }, { ...good, manga_id: 'c', read_ranges: [[9, 1], ['a']] }] }]);
    const rows = await backend.pullMangaEntries();
    expect(rows.map((r) => r.mangaId)).toEqual(['a', 'b', 'c']);
    expect(rows[0].readRanges).toEqual([[1, 2]]);
    expect(rows[1].readRanges).toEqual([]);
    expect((rows[1].manga as { title: string }).title).toBe('Sin título');
    expect(rows[2].readRanges).toEqual([]);
  });

  it('la biblioteca de un amigo exige un id válido', async () => {
    const { backend } = fakeClient([]);
    await expect(backend.listFriendManga('no-es-uuid')).rejects.toMatchObject({ code: 'not_found' });
    const ok = fakeClient([{ data: [] }]);
    expect(await ok.backend.listFriendManga('22222222-2222-4222-8222-222222222222')).toEqual([]);
    expect(ok.log.find((l) => l.op === 'eq')?.args).toEqual(['user_id', '22222222-2222-4222-8222-222222222222']);
  });
});

describe('SupabaseBackend: leyendo ahora y chat', () => {
  it('publica la lectura saneada', async () => {
    const { backend, log } = fakeClient([{ data: null }]);
    await backend.setReadingActivity({ source: 'mangadex', mangaId: 'm'.repeat(300), title: 'T'.repeat(500), coverUrl: 'http://inseguro.dev/c.jpg', chapter: '9'.repeat(50), page: 3.9, pageCount: -4 });
    const up = log.find((l) => l.where === 'reading_activity' && l.op === 'upsert')!;
    const row = up.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ user_id: '11111111-1111-4111-8111-111111111111', active: true, cover_url: null, page: 3, page_count: 0 });
    expect((row.title as string).length).toBe(200);
    expect((row.manga_id as string).length).toBe(200);
    expect((row.chapter as string).length).toBe(20);
    expect(up.args[1]).toEqual({ onConflict: 'user_id' });
  });

  it('un mensaje de manga viaja con su ficha (y uno de anime no la mezcla)', async () => {
    const share = { id: 'm1', sourceId: 'mangadex', title: 'Frieren', coverUrl: 'https://x.dev/c.jpg', status: 'ongoing', year: 2020, lastChapter: '100', tags: [] };
    const row = { id: 1, sender_id: 'a', recipient_id: 'b', kind: 'manga', body: '', payload: share, created_at: 'x', read_at: null, deleted_at: null };
    const { backend, log } = fakeClient([{ data: row }]);
    const msg = await backend.sendMessage('b', { kind: 'manga', manga: share });
    expect(log.find((l) => l.op === 'insert')?.args[0]).toMatchObject({ kind: 'manga', payload: share });
    expect(msg).toMatchObject({ kind: 'manga', manga: { title: 'Frieren' }, media: null });
  });
});

describe('parseMangaShare (ficha que llega de OTRA persona)', () => {
  const ok = { id: 'm1', sourceId: 'mangadex', title: 'Frieren', coverUrl: 'https://x.dev/c.jpg', status: 'ongoing', year: 2020, lastChapter: '100', tags: ['A', 'B'] };
  it('acepta una ficha válida', () => {
    expect(parseMangaShare(ok)).toEqual(ok);
  });
  it('rechaza lo que no encaja', () => {
    for (const bad of [null, undefined, 'x', 5, [], {}, { id: 'a' }, { ...ok, id: 5 }, { ...ok, sourceId: 'MALA FUENTE' }, { ...ok, sourceId: '' }, { ...ok, id: '' }, { ...ok, id: 'x'.repeat(201) }, { ...ok, title: 7 }]) {
      expect(parseMangaShare(bad)).toBeNull();
    }
  });
  it('sanea portada, etiquetas y textos', () => {
    const p = parseMangaShare({ ...ok, coverUrl: 'javascript:alert(1)', tags: 'no', title: 't'.repeat(999), year: 'x', lastChapter: 5, status: 's'.repeat(99) })!;
    expect(p.coverUrl).toBe('');
    expect(p.tags).toEqual([]);
    expect(p.title).toHaveLength(300);
    expect(p.year).toBeNull();
    expect(p.lastChapter).toBeNull();
    expect(p.status).toHaveLength(20);
    expect(parseMangaShare({ ...ok, coverUrl: 'http://inseguro.dev/c.jpg' })!.coverUrl).toBe('');
    expect(parseMangaShare({ ...ok, tags: Array.from({ length: 30 }, () => 'x') })!.tags).toHaveLength(8);
  });
});

describe('MockBackend: manga en la cuenta', () => {
  let b: MockBackend;
  beforeEach(async () => {
    (globalThis as any).localStorage = new MemoryStorage();
    b = new MockBackend();
    await b.signUp({ email: 'yo@test.dev', password: 'secreto123', username: 'yoyo' }); // mika es amiga
  });
  const mika = 'seed-mika';

  it('un amigo que comparte su lista: se ve la biblioteca pero no el historial suelto', async () => {
    const rows = await b.listFriendManga(mika);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status && !r.deleted)).toBe(true);
    expect(rows.some((r) => r.manga.title === 'Historial suelto')).toBe(false);
  });

  it('un desconocido o una lista oculta no se ve', async () => {
    expect(await b.listFriendManga('seed-ren')).toEqual([]);                 // no somos amigos
    await b.signOut();
    await b.signIn('mika@demo.dev', 'demo1234');
    await b.updateMyProfile({ showLibrary: false });
    await b.signOut();
    await b.signIn('yo@test.dev', 'secreto123');
    expect(await b.listFriendManga(mika)).toEqual([]);
  });

  it('subir: gana el sello más nuevo y el del futuro se recorta', async () => {
    const t = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
    expect(await b.pushMangaEntries([item({ updatedAt: t(10), status: 'completed' })])).toBe(1);
    expect(await b.pushMangaEntries([item({ updatedAt: t(20), status: 'dropped' })])).toBe(0);   // más viejo
    expect((await b.pullMangaEntries())[0].status).toBe('completed');
    await b.pushMangaEntries([item({ mangaId: 'fut', manga: { id: 'fut', sourceId: 'mangadex', title: 'F' }, updatedAt: '2999-01-01T00:00:00Z' })]);
    const fut = (await b.pullMangaEntries()).find((r) => r.mangaId === 'fut')!;
    expect(Date.parse(fut.updatedAt)).toBeLessThanOrEqual(Date.now() + 11 * 60_000);
  });

  it('descargar solo lo nuevo (por el sello del servidor) y solo lo mío', async () => {
    await b.pushMangaEntries([item()]);
    const all = await b.pullMangaEntries();
    expect(all).toHaveLength(1);
    expect(await b.pullMangaEntries({ since: all[0].syncedAt })).toEqual([]);
    expect(await b.pullMangaEntries({ limit: 0 })).toEqual([]);
  });

  it('valida lo que sube', async () => {
    await expect(b.pushMangaEntries([item({ mangaId: '' })])).rejects.toBeInstanceOf(BackendError);
    await expect(b.pushMangaEntries(Array.from({ length: 101 }, (_, i) => item({ mangaId: `m${i}` })))).rejects.toBeInstanceOf(BackendError);
  });

  it('"leyendo ahora": se publica, lo ven los amigos y se puede quitar', async () => {
    const friends = await b.listFriendsReading();
    expect(friends.map((f) => f.profile.username)).toContain('mika');
    await b.setReadingActivity({ source: 'mangadex', mangaId: 'x', title: 'X', coverUrl: null, chapter: '3', page: 1, pageCount: 9 });
    await b.signOut();
    await b.signIn('mika@demo.dev', 'demo1234');
    // mika y yo somos amigos: me ve leyendo
    expect((await b.listFriendsReading()).find((f) => f.title === 'X')).toMatchObject({ active: true, chapter: '3', page: 1 });
    await b.signOut();
    await b.signIn('yo@test.dev', 'secreto123');
    await b.clearReadingActivity();
    await b.signOut();
    await b.signIn('mika@demo.dev', 'demo1234');
    expect((await b.listFriendsReading()).find((f) => f.title === 'X')?.active).toBe(false);
  });

  it('compartir un manga por el chat y borrarlo', async () => {
    const friend = (await b.listFriends())[0].profile.id;
    const share = { id: 'm1', sourceId: 'mangadex', title: 'Frieren', coverUrl: '', status: 'ongoing', year: null, lastChapter: null, tags: [] };
    const msg = await b.sendMessage(friend, { kind: 'manga', manga: share });
    expect(msg).toMatchObject({ kind: 'manga', manga: { title: 'Frieren' }, media: null });
    await expect(b.sendMessage(friend, { kind: 'manga' })).rejects.toBeInstanceOf(BackendError);
    await b.deleteMessage(msg.id);
    const thread = await b.listMessages(friend);
    expect(thread.find((m) => m.id === msg.id)).toMatchObject({ deleted: true, manga: null });
  });
});
