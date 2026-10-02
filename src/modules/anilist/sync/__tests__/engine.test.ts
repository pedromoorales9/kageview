import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeAniList, rawMedia } from './fakeAniList';

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

/** Arranca todo desde cero: backend de prueba con sesión iniciada, almacén de manga, estado de la sincronización y un AniList falso. */
async function boot() {
  vi.resetModules();
  const disk: Record<string, unknown> = {};
  (globalThis as any).localStorage = new MemoryStorage();
  (globalThis as any).document = { hidden: false, hasFocus: () => true };
  (globalThis as any).window = {
    electron: {
      getStore: async (k: string) => (k in disk ? JSON.parse(JSON.stringify(disk[k])) : undefined),
      setStore: async (k: string, v: unknown) => { if (v === undefined) delete disk[k]; else disk[k] = JSON.parse(JSON.stringify(v)); },
    },
    dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {},
  };
  const backendMod = await import('../../../backend');
  const { MockBackend } = await import('../../../backend/mockBackend');
  backendMod.__setBackendForTests(new MockBackend());
  const backend = backendMod.getBackend()!;
  await backend.signUp({ email: 'yo@test.dev', password: 'secreto123', username: 'yoyo' });
  const { useAppStore } = await import('../../../store');
  useAppStore.getState().setAccount({ status: 'signedIn', user: (await backend.getSession())! });

  const api = await import('../api');
  const engine = await import('../engine');
  const state = await import('../state');
  const store = await import('../../../manga/mangaStore');
  const fake = new FakeAniList();
  api.__setTransportForTests(fake.transport());
  engine.__setPaceForTests(async () => {});
  await state.initSyncState();
  await store.initMangaStore();
  return { backend, api, engine, state, store, fake, disk, useAppStore };
}
type Env = Awaited<ReturnType<typeof boot>>;

const manga = (id: string, title: string, sourceId = 'mangakatana') => ({
  id, sourceId, title, description: '', coverUrl: 'https://cdn.example/c.jpg', status: 'ongoing' as const, tags: [], year: null, lastChapter: null,
});
const animeSnap = (id: number, title: string) => ({ id, title: { romaji: title }, coverImage: { large: `https://s4.anilist.co/file/${id}.jpg` }, episodes: 12 });

describe('sincronización con AniList', () => {
  let e: Env;
  beforeEach(async () => { e = await boot(); });
  afterEach(() => { vi.useRealTimers(); });

  // ───────────────────────── Anime ─────────────────────────
  describe('anime', () => {
    beforeEach(() => {
      e.fake.addMedia({ id: 1, type: 'ANIME', format: 'TV', title: { romaji: 'Frieren' }, episodes: 28 });
      e.fake.addMedia({ id: 2, type: 'ANIME', format: 'TV', title: { romaji: 'One Piece' } });
      e.fake.addMedia({ id: 3, type: 'ANIME', format: 'TV', title: { romaji: 'Bleach' } });
    });

    it('importa lo que solo está en AniList, envía lo que solo está en KageView y fusiona lo de los dos', async () => {
      e.fake.setEntry('ANIME', { mediaId: 1, status: 'CURRENT', progress: 7, score: 85 });                 // solo AniList
      e.fake.setEntry('ANIME', { mediaId: 2, status: 'COMPLETED', progress: 12, score: 90, updatedAt: 1_900_000_000 }); // los dos (AniList más reciente)
      await e.backend.upsertLibraryEntry({ mediaType: 'anime', mediaId: 2, status: 'CURRENT', progress: 5, score: 0, media: animeSnap(2, 'One Piece') });
      await e.backend.upsertLibraryEntry({ mediaType: 'anime', mediaId: 3, status: 'PLANNING', progress: 0, score: 0, media: animeSnap(3, 'Bleach') }); // solo KageView

      await e.engine.syncNow();

      const local = Object.fromEntries((await e.backend.listLibrary('anime')).map((x) => [x.mediaId, x]));
      expect(local[1]).toMatchObject({ status: 'CURRENT', progress: 7, score: 85 });                       // importado
      expect(local[2]).toMatchObject({ status: 'COMPLETED', progress: 12, score: 90 });                    // lo más reciente, mayor progreso, nota real
      expect(e.fake.lists.ANIME.get(3)).toMatchObject({ status: 'PLANNING', progress: 0 });                // enviado
      expect(e.fake.saves.map((s) => s.mediaId)).toEqual([3]);
      expect(e.state.getSync().counts).toMatchObject({ animePulled: 2, animePushed: 1 });
      expect(e.state.getSync().phase).toBe('idle');
    });

    it('una segunda pasada no escribe nada (todo está acordado)', async () => {
      e.fake.setEntry('ANIME', { mediaId: 1, status: 'CURRENT', progress: 7, score: 0 });
      await e.backend.upsertLibraryEntry({ mediaType: 'anime', mediaId: 3, status: 'PLANNING', progress: 0, score: 0, media: animeSnap(3, 'Bleach') });
      await e.engine.syncNow();
      const writes = e.fake.saves.length;
      await e.engine.syncNow();
      expect(e.fake.saves.length).toBe(writes);
      expect(e.state.getSync().counts).toMatchObject({ animePulled: 0, animePushed: 0 });
    });

    it('un cambio posterior en KageView se envía; uno en AniList se trae', async () => {
      e.fake.setEntry('ANIME', { mediaId: 1, status: 'CURRENT', progress: 7, score: 0 });
      await e.engine.syncNow();
      await e.backend.upsertLibraryEntry({ mediaType: 'anime', mediaId: 1, status: 'CURRENT', progress: 9, score: 0, media: animeSnap(1, 'Frieren') });
      await e.engine.syncNow();
      expect(e.fake.lists.ANIME.get(1)!.progress).toBe(9);

      e.fake.setEntry('ANIME', { mediaId: 1, status: 'COMPLETED', progress: 28, score: 95 });
      await e.engine.syncNow();
      expect((await e.backend.listLibrary('anime')).find((x) => x.mediaId === 1)).toMatchObject({ status: 'COMPLETED', progress: 28, score: 95 });
    });

    it('nunca borra: quitar un anime de KageView no lo quita de AniList ni se vuelve a importar solo', async () => {
      e.fake.setEntry('ANIME', { mediaId: 1, status: 'CURRENT', progress: 7, score: 0 });
      await e.engine.syncNow();
      await e.backend.removeLibraryEntry('anime', 1);
      await e.engine.syncNow();
      expect(e.fake.lists.ANIME.has(1)).toBe(true);
      expect((await e.backend.listLibrary('anime')).some((x) => x.mediaId === 1)).toBe(false);
    });

    it('sin «importar», lo que solo está en AniList no entra en KageView', async () => {
      e.fake.setEntry('ANIME', { mediaId: 1, status: 'CURRENT', progress: 7, score: 0 });
      e.state.patchSync((s) => ({ settings: { ...s.settings, importRemote: false } }));
      await e.engine.syncNow();
      expect(await e.backend.listLibrary('anime')).toHaveLength(0);
    });

    it('sin sesión en KageView el anime se omite (el manga sigue)', async () => {
      e.useAppStore.getState().setAccount({ status: 'signedOut', user: null } as never);
      e.fake.setEntry('ANIME', { mediaId: 1, status: 'CURRENT', progress: 7, score: 0 });
      await e.engine.syncNow();
      expect(e.fake.calls.list).toBe(1);                       // solo la lista de manga
      expect(e.state.getSync().phase).toBe('idle');
    });
  });

  // ───────────────────────── Manga ─────────────────────────
  describe('manga', () => {
    beforeEach(() => {
      e.fake.addMedia({ id: 30013, type: 'MANGA', format: 'MANGA', title: { romaji: 'One Piece' }, chapters: null });
      e.fake.addMedia({ id: 30002, type: 'MANGA', format: 'MANGA', title: { romaji: 'Berserk' }, chapters: 380 });
    });
    const addLocal = (id: string, title: string, status: 'reading' | 'completed' | 'planning' | 'dropped' = 'reading', progress = 0, sourceId = 'mangakatana') => {
      e.store.addToLibrary(manga(id, title, sourceId), status);
      if (progress > 0) e.store.applyExternalProgress(manga(id, title, sourceId), { progress });
    };

    it('vincula solo por título, envía estado y capítulo, y no repite el envío', async () => {
      addLocal('op.1', 'One Piece', 'reading', 10);
      await e.engine.syncNow();
      expect(e.state.getSync().links['mangakatana::op.1']).toMatchObject({ anilistId: 30013, via: 'auto' });
      expect(e.fake.saves).toEqual([{ mediaId: 30013, status: 'CURRENT', progress: 10 }]);   // sin nota: no se toca la de AniList
      expect(e.state.getSync().counts).toMatchObject({ linkedAuto: 1, mangaPushed: 1 });

      const calls = e.fake.calls.save;
      await e.engine.syncNow();
      expect(e.fake.calls.save).toBe(calls);
    });

    it('subir el capítulo en KageView sube el de AniList; subirlo en AniList marca capítulos en KageView', async () => {
      addLocal('op.1', 'One Piece', 'reading', 10);
      await e.engine.syncNow();
      e.store.applyExternalProgress(manga('op.1', 'One Piece'), { progress: 15 });
      await e.engine.syncNow();
      expect(e.fake.lists.MANGA.get(30013)).toMatchObject({ status: 'CURRENT', progress: 15 });

      e.fake.setEntry('MANGA', { mediaId: 30013, status: 'CURRENT', progress: 40, score: 88 });
      await e.engine.syncNow();
      const rec = e.store.getRecord({ id: 'op.1', sourceId: 'mangakatana' })!;
      expect(e.store.isChapterRead(rec, { id: 'x', chapter: '40' })).toBe(true);
      expect(e.store.isChapterRead(rec, { id: 'x', chapter: '41' })).toBe(false);
      expect(e.fake.lists.MANGA.get(30013)!.score).toBe(88);                    // la nota de AniList no se pisa
    });

    it('«en pausa» de AniList no se pisa con «leyendo» si nadie lo cambia', async () => {
      e.fake.setEntry('MANGA', { mediaId: 30013, status: 'PAUSED', progress: 20, score: 0 });
      await e.engine.syncNow();                                                  // se importa como ficha «leyendo»
      const calls = e.fake.saves.length;
      await e.engine.syncNow();
      expect(e.fake.saves.length).toBe(calls);
      expect(e.fake.lists.MANGA.get(30013)!.status).toBe('PAUSED');
    });

    it('importa de AniList los mangas que no tienes, como fichas sin fuente de lectura', async () => {
      e.fake.setEntry('MANGA', { mediaId: 30002, status: 'COMPLETED', progress: 380, score: 95 });
      await e.engine.syncNow();
      const rec = e.store.getRecord({ id: '30002', sourceId: 'anilist' })!;
      expect(rec).toMatchObject({ status: 'completed', manga: { title: 'Berserk', sourceId: 'anilist', lastChapter: '380' } });
      expect(e.store.isChapterRead(rec, { id: 'x', chapter: '380' })).toBe(true);
      expect(e.fake.saves).toHaveLength(0);
      expect(e.state.getSync().counts!.imported).toBe(1);
    });

    it('una ficha importada que borras en KageView no se vuelve a importar mientras AniList no cambie', async () => {
      e.fake.setEntry('MANGA', { mediaId: 30002, status: 'COMPLETED', progress: 380, score: 0 });
      await e.engine.syncNow();
      e.store.deleteRecord('anilist::30002');
      await e.engine.syncNow();
      expect(e.store.getRecord({ id: '30002', sourceId: 'anilist' })).toBeUndefined();
      expect(e.fake.lists.MANGA.has(30002)).toBe(true);                         // y AniList la conserva
      e.fake.setEntry('MANGA', { mediaId: 30002, status: 'COMPLETED', progress: 381, score: 0 });
      await e.engine.syncNow();                                                  // si AniList cambia, sí vuelve
      expect(e.store.getRecord({ id: '30002', sourceId: 'anilist' })).toBeDefined();
    });

    it('cuando vinculas un manga real con una ficha importada, se fusionan en uno solo', async () => {
      e.fake.setEntry('MANGA', { mediaId: 30002, status: 'COMPLETED', progress: 380, score: 95 });
      await e.engine.syncNow();                                                  // ficha importada
      addLocal('berserk.5', 'Berserk', 'reading', 3);                            // lo añades desde una fuente
      await e.engine.syncNow();
      expect(e.store.getRecord({ id: '30002', sourceId: 'anilist' })).toBeUndefined();
      const real = e.store.getRecord({ id: 'berserk.5', sourceId: 'mangakatana' })!;
      expect(e.store.isChapterRead(real, { id: 'x', chapter: '380' })).toBe(true);   // heredó el progreso
      expect(Object.keys(e.store.useMangaData.getState().records).filter((k) => k.startsWith('anilist::'))).toHaveLength(0);
    });

    it('un título dudoso se sugiere pero NO se vincula solo; al confirmarlo se sincroniza', async () => {
      e.fake.addMedia({ id: 100, type: 'MANGA', format: 'MANGA', title: { romaji: 'Dragon Ball Super' } });
      e.fake.addMedia({ id: 101, type: 'MANGA', format: 'MANGA', title: { romaji: 'Dragon Ball Z' } });
      addLocal('db.1', 'Dragon Ball', 'reading', 4);
      await e.engine.syncNow();
      const key = 'mangakatana::db.1';
      expect(e.state.getSync().links[key]).toBeUndefined();
      expect(e.state.getSync().suggestions[key].items.map((i) => i.id).sort()).toEqual([100, 101]);
      expect(e.fake.saves).toHaveLength(0);
      expect(e.engine.unlinkedRecords().map((r) => r.manga.id)).toContain('db.1');

      const { parseMedia } = await import('../queries');
      e.engine.linkManga({ id: 'db.1', sourceId: 'mangakatana' }, parseMedia(rawMedia(e.fake.catalog.find((c) => c.id === 100)!), 'MANGA')!);
      expect(e.state.getSync().suggestions[key]).toBeUndefined();
      await e.engine.syncNow();
      expect(e.fake.lists.MANGA.get(100)).toMatchObject({ status: 'CURRENT', progress: 4 });
    });

    it('no repite las búsquedas de lo que no tiene coincidencia', async () => {
      addLocal('x.1', 'Un Título Que No Existe En Ningun Sitio');
      await e.engine.syncNow();
      const searches = e.fake.calls.search;
      expect(searches).toBeGreaterThan(0);
      await e.engine.syncNow();
      expect(e.fake.calls.search).toBe(searches);
      expect(e.state.getSync().noMatch['mangakatana::x.1']).toBeGreaterThan(0);
    });

    it('límite de búsquedas por pasada: el resto se vincula en las siguientes', async () => {
      for (let i = 0; i < 20; i++) {
        e.fake.addMedia({ id: 5000 + i, type: 'MANGA', format: 'MANGA', title: { romaji: `Serie Numero ${i} Unica` } });
        addLocal(`s.${i}`, `Serie Numero ${i} Unica`);
      }
      await e.engine.syncNow();
      expect(Object.keys(e.state.getSync().links)).toHaveLength(e.engine.AUTO_LINK_BUDGET);
      await e.engine.syncNow();
      expect(Object.keys(e.state.getSync().links)).toHaveLength(20);
    });

    it('«no vincular» deja de ofrecerlo y desvincular no lo vuelve a vincular solo', async () => {
      addLocal('op.1', 'One Piece');
      await e.engine.syncNow();
      e.engine.unlinkManga({ id: 'op.1', sourceId: 'mangakatana' });
      await e.engine.syncNow();
      expect(e.state.getSync().links['mangakatana::op.1']).toBeUndefined();
      expect(e.engine.unlinkedRecords()).toHaveLength(0);
    });

    it('nunca borra: quitar un manga de KageView no toca AniList', async () => {
      addLocal('op.1', 'One Piece', 'reading', 10);
      await e.engine.syncNow();
      e.store.removeFromLibrary({ id: 'op.1', sourceId: 'mangakatana' });
      e.store.deleteRecord('mangakatana::op.1');
      await e.engine.syncNow();
      expect(e.fake.lists.MANGA.has(30013)).toBe(true);
      expect(e.store.getRecord({ id: 'op.1', sourceId: 'mangakatana' })).toBeUndefined();
    });

    it('dos fuentes del mismo manga cuentan como uno: progreso mayor', async () => {
      addLocal('op.1', 'One Piece', 'reading', 10, 'mangakatana');
      addLocal('op-es', 'One Piece', 'reading', 25, 'leercapitulo');
      await e.engine.syncNow();
      expect(e.fake.saves).toEqual([{ mediaId: 30013, status: 'CURRENT', progress: 25 }]);
    });

    it('desactivar el manga en los ajustes no hace ninguna llamada de manga', async () => {
      addLocal('op.1', 'One Piece');
      e.state.patchSync((s) => ({ settings: { ...s.settings, manga: false, anime: false } }));
      await e.engine.syncNow();
      expect(e.fake.calls.list + e.fake.calls.search + e.fake.calls.save).toBe(0);
    });
  });

  // ───────────────────────── Errores y casos límite ─────────────────────────
  describe('errores', () => {
    beforeEach(() => {
      for (let i = 1; i <= 3; i++) e.fake.addMedia({ id: i, type: 'ANIME', format: 'TV', title: { romaji: `Anime ${i}` } });
    });

    it('un anime que AniList rechaza no impide enviar el resto', async () => {
      for (let i = 1; i <= 3; i++) await e.backend.upsertLibraryEntry({ mediaType: 'anime', mediaId: i, status: 'CURRENT', progress: 1, score: 0, media: animeSnap(i, `Anime ${i}`) });
      e.fake.failIds.add(2);
      await e.engine.syncNow();
      expect([...e.fake.lists.ANIME.keys()].sort()).toEqual([1, 3]);
      expect(e.state.getSync().counts!.failed).toBe(1);
      expect(e.state.getSync().anime['2']).toBeUndefined();                   // se reintentará
      e.fake.failIds.clear();
      await e.engine.syncNow();
      expect([...e.fake.lists.ANIME.keys()].sort()).toEqual([1, 2, 3]);
    });

    it('token revocado: se muestra un aviso claro y no se toca nada', async () => {
      e.fake.nextAuthError = { ok: false, status: 401, error: 'unauthorized' };
      await e.engine.syncNow();
      expect(e.state.getSync()).toMatchObject({ phase: 'error' });
      expect(e.state.getSync().error).toMatch(/vuelve a conectar/i);
      expect(e.fake.saves).toHaveLength(0);
    });

    it.each([
      ['rate_limited', /más despacio/i],
      ['network', /conexión/i],
      ['down', /fuera de servicio/i],
    ])('error «%s» → mensaje en español', async (error, re) => {
      e.fake.nextAuthError = { ok: false, status: 0, error };
      await e.engine.syncNow();
      expect(e.state.getSync().error).toMatch(re);
    });

    it('sin cuenta de AniList conectada no hace nada', async () => {
      e.fake.connected = false;
      await e.engine.syncNow();
      expect(e.fake.calls).toEqual({ list: 0, search: 0, save: 0, viewer: 0 });
      expect(e.state.getSync().status?.connected).toBe(false);
    });

    it('con otra cuenta de AniList se reinicia el «último estado acordado» (nunca se mezclan)', async () => {
      await e.backend.upsertLibraryEntry({ mediaType: 'anime', mediaId: 1, status: 'CURRENT', progress: 4, score: 0, media: animeSnap(1, 'Anime 1') });
      await e.engine.syncNow();
      expect(e.state.getSync().viewerId).toBe(777);
      e.fake.viewer = { id: 888, name: 'otra', avatar: { large: 'x' } };
      e.fake.lists.ANIME.clear();                                              // la otra cuenta tiene la lista vacía
      await e.engine.syncNow();
      expect(e.state.getSync().viewerId).toBe(888);
      expect(e.fake.lists.ANIME.get(1)).toMatchObject({ progress: 4 });         // se vuelve a enviar a la nueva cuenta
    });

    it('dos peticiones de sincronizar a la vez no se solapan', async () => {
      await e.backend.upsertLibraryEntry({ mediaType: 'anime', mediaId: 1, status: 'CURRENT', progress: 1, score: 0, media: animeSnap(1, 'Anime 1') });
      await Promise.all([e.engine.syncNow(), e.engine.syncNow(), e.engine.syncNow()]);
      expect(e.fake.saves.filter((s) => s.mediaId === 1)).toHaveLength(1);
    });

    it('el estado se guarda en disco y no contiene ningún token', async () => {
      await e.backend.upsertLibraryEntry({ mediaType: 'anime', mediaId: 1, status: 'CURRENT', progress: 1, score: 0, media: animeSnap(1, 'Anime 1') });
      await e.engine.syncNow();
      await e.state.flushSyncState();
      const saved = JSON.stringify(e.disk.anilistSync);
      expect(saved).toContain('"viewerId":777');
      expect(saved).not.toMatch(/token|access_token|bearer/i);
    });
  });
});
