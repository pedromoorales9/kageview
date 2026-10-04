import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeAniList } from './fakeAniList';

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const notices: Array<{ type: string; message: string; title?: string }> = [];

async function boot(confirmed = true) {
  vi.resetModules();
  notices.length = 0;
  const disk: Record<string, unknown> = {};
  (globalThis as any).localStorage = new MemoryStorage();
  (globalThis as any).document = { hidden: false, hasFocus: () => true };
  (globalThis as any).window = {
    electron: {
      getStore: async (k: string) => (k in disk ? JSON.parse(JSON.stringify(disk[k])) : undefined),
      setStore: async (k: string, v: unknown) => { if (v === undefined) delete disk[k]; else disk[k] = JSON.parse(JSON.stringify(v)); },
    },
    dispatchEvent: (e: { detail: { type: string; message: string; title?: string } }) => notices.push(e.detail),
    addEventListener: () => {}, removeEventListener: () => {},
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
  const library = await import('../../../library');
  const fake = new FakeAniList();
  api.__setTransportForTests(fake.transport());
  engine.__setPaceForTests(async () => {});
  await state.initSyncState();
  await store.initMangaStore();
  if (confirmed) state.patchSync({ confirmedViewerId: fake.viewer.id });
  return { backend, engine, state, store, library, fake, useAppStore };
}
type Env = Awaited<ReturnType<typeof boot>>;
const snap = (id: number, title: string) => ({ id, title: { romaji: title }, coverImage: { large: `https://s4.anilist.co/file/${id}.jpg` }, episodes: 12 });
const change = (over: Partial<import('../changeBus').AnimeChange> = {}) => ({ mediaId: 1, title: 'Frieren', status: 'CURRENT' as const, progress: 5, score: 0, ...over });

describe('retomar: episodio por el que continuar', () => {
  it('combina lo de este equipo con el progreso de la lista', async () => {
    const { resumeEpisode } = await import('../../../library');
    expect(resumeEpisode(null, 0)).toBeNull();                       // nada visto
    expect(resumeEpisode(3, 0)).toBe(3);                              // solo local
    expect(resumeEpisode(null, 4)).toBe(5);                           // solo la lista: el siguiente al último visto
    expect(resumeEpisode(3, 20)).toBe(21);                            // la lista (otro dispositivo / AniList) va por delante
    expect(resumeEpisode(8, 4)).toBe(8);                              // este equipo va por delante
    expect(resumeEpisode(null, 12, 12)).toBeNull();                   // los ha visto todos: nada que continuar
    expect(resumeEpisode(12, 12, 12)).toBe(12);                       // …salvo que aquí hubiera uno a medias
    expect(resumeEpisode(null, 11, 12)).toBe(12);
    expect(resumeEpisode(undefined, undefined, undefined)).toBeNull();
    expect(resumeEpisode(2.9, 0)).toBe(2);                            // valores raros se normalizan
  });
});

describe('texto del aviso', () => {
  it('uno solo: anime o manga; varios: resumen; ninguno: nada', async () => {
    const { progressMessage } = await import('../engine');
    expect(progressMessage([{ kind: 'anime', title: 'Frieren', progress: 5 }])).toEqual({ title: 'Frieren', message: 'Episodio 5 marcado como visto en AniList' });
    expect(progressMessage([{ kind: 'manga', title: 'Berserk', progress: 12 }])).toEqual({ title: 'Berserk', message: 'Capítulo 12 marcado como leído en AniList' });
    expect(progressMessage([{ kind: 'anime', title: '', progress: 1 }, { kind: 'manga', title: 'X', progress: 2 }])).toEqual({ message: '2 entradas actualizadas en AniList' });
    expect(progressMessage([])).toBeNull();
    // solo cambió el estado (sin episodios vistos): nunca «Episodio 0»
    expect(progressMessage([{ kind: 'anime', title: 'Frieren', progress: 0 }])).toEqual({ title: 'Frieren', message: 'Lista de AniList actualizada' });
    expect(progressMessage([{ kind: 'anime', title: '', progress: 3 }])!.title).toBeUndefined();
  });
});

describe('envío rápido de un episodio', () => {
  let e: Env;
  beforeEach(async () => {
    e = await boot();
    e.fake.addMedia({ id: 1, type: 'ANIME', format: 'TV', title: { romaji: 'Frieren' }, episodes: 28 });
    await e.engine.syncNow();                    // conecta y fija la cuenta (viewerId)
    e.fake.calls.list = 0; e.fake.calls.save = 0;
  });
  afterEach(() => { vi.useRealTimers(); });

  it('envía SOLO ese anime (1 lectura + 1 escritura, sin bajar la lista) y avisa', async () => {
    expect(await e.engine.pushAnimeProgress(change({ progress: 5 }))).toBe('pushed');
    expect(e.fake.calls.list).toBe(0);                                       // no se descargó la lista
    expect(e.fake.calls.save).toBe(1);
    expect(e.fake.lists.ANIME.get(1)).toMatchObject({ status: 'CURRENT', progress: 5 });
    expect(notices).toEqual([{ type: 'success', message: 'Episodio 5 marcado como visto en AniList', title: 'AniList · Frieren' }]);
  });

  it('repetir el mismo episodio no vuelve a escribir ni a avisar', async () => {
    await e.engine.pushAnimeProgress(change({ progress: 5 }));
    notices.length = 0;
    expect(await e.engine.pushAnimeProgress(change({ progress: 5 }))).toBe('skipped');
    expect(e.fake.calls.save).toBe(1);
    expect(notices).toHaveLength(0);
  });

  it('el aviso se puede desactivar (el progreso se envía igual)', async () => {
    e.state.setSettings({ notifyProgress: false });
    expect(await e.engine.pushAnimeProgress(change({ progress: 6 }))).toBe('pushed');
    expect(e.fake.lists.ANIME.get(1)!.progress).toBe(6);
    expect(notices).toHaveLength(0);
  });

  it('retomar desde otro sitio: si AniList va por delante, se trae a KageView y NO se retrocede', async () => {
    e.fake.setEntry('ANIME', { mediaId: 1, status: 'CURRENT', progress: 20, score: 0 });   // visto en otro dispositivo
    expect(await e.engine.pushAnimeProgress(change({ progress: 3 }))).toBe('pulled');
    expect(e.fake.lists.ANIME.get(1)!.progress).toBe(20);                                    // AniList intacto
    expect((await e.backend.listLibrary('anime')).find((x) => x.mediaId === 1)!.progress).toBe(20);
    expect(e.useAppStore.getState().myList[1].progress).toBe(20);                            // y «Continuar» usará el 21
    expect(notices).toHaveLength(0);                                                          // nada se envió: sin aviso
  });

  it('al completar el anime se envía el estado «Completado»', async () => {
    expect(await e.engine.pushAnimeProgress(change({ progress: 28, status: 'COMPLETED' }))).toBe('pushed');
    expect(e.fake.lists.ANIME.get(1)).toMatchObject({ status: 'COMPLETED', progress: 28 });
  });

  it('con otra cuenta de AniList, o si ya hay una sincronización, la deja a la completa (no escribe a ciegas)', async () => {
    e.state.patchSync({ viewerId: 999 });                                    // la base era de otra cuenta
    const before = e.fake.calls.save;
    expect(await e.engine.pushAnimeProgress(change({ progress: 7 }))).toBe('skipped');
    await Promise.resolve();
    expect(e.fake.calls.save).toBeLessThanOrEqual(before + 1);              // solo lo hace la sincronización completa
  });

  it('sin conectar, con el anime desactivado o sin sesión de KageView: no hace nada', async () => {
    e.state.setSettings({ anime: false });
    expect(await e.engine.pushAnimeProgress(change())).toBe('skipped');
    e.state.setSettings({ anime: true });
    e.useAppStore.getState().setAccount({ status: 'signedOut', user: null } as never);
    expect(await e.engine.pushAnimeProgress(change())).toBe('skipped');
    e.fake.connected = false;
    await e.engine.syncNow();                                                // se entera de que ya no hay conexión
    expect(await e.engine.pushAnimeProgress(change())).toBe('skipped');
    expect(e.fake.calls.save).toBe(0);
  });

  it('un error de AniList no rompe nada: queda para la sincronización completa', async () => {
    e.fake.nextAuthError = { ok: false, status: 0, error: 'network' };
    expect(await e.engine.pushAnimeProgress(change({ progress: 8 }))).toBe('skipped');
    expect(notices).toHaveLength(0);
    expect(await e.engine.pushAnimeProgress(change({ progress: 8 }))).toBe('pushed');   // y al volver la conexión, sale
  });
});

describe('avisos de las sincronizaciones completas', () => {
  let e: Env;
  beforeEach(async () => {
    e = await boot();
    e.fake.addMedia({ id: 30002, type: 'MANGA', format: 'MANGA', title: { romaji: 'Berserk' } });
    e.fake.addMedia({ id: 30013, type: 'MANGA', format: 'MANGA', title: { romaji: 'One Piece' } });
    e.fake.addMedia({ id: 1, type: 'ANIME', format: 'TV', title: { romaji: 'Frieren' } });
  });
  const addManga = (id: string, title: string, progress: number) => {
    const m = { id, sourceId: 'mangakatana', title, description: '', coverUrl: '', status: 'ongoing' as const, tags: [], year: null, lastChapter: null };
    e.store.addToLibrary(m, 'reading'); e.store.applyExternalProgress(m, { progress });
  };

  it('automática: un manga enviado → «Capítulo N marcado como leído en AniList»', async () => {
    addManga('b.1', 'Berserk', 14);
    await e.engine.syncNow('auto');
    expect(notices).toEqual([{ type: 'success', message: 'Capítulo 14 marcado como leído en AniList', title: 'AniList · Berserk' }]);
  });

  it('manual (botón «Sincronizar») o al conectar: no avisa aunque envíe cosas', async () => {
    addManga('b.1', 'Berserk', 14);
    await e.engine.syncNow('manual');
    expect(e.fake.saves).toHaveLength(1);
    expect(notices).toHaveLength(0);
  });

  it('varios envíos a la vez → un solo aviso resumen', async () => {
    addManga('b.1', 'Berserk', 14); addManga('op.1', 'One Piece', 30);
    await e.engine.syncNow('auto');
    expect(notices).toEqual([{ type: 'success', message: '2 entradas actualizadas en AniList', title: 'AniList' }]);
  });

  it('con el aviso desactivado no sale nada', async () => {
    e.state.setSettings({ notifyProgress: false });
    addManga('b.1', 'Berserk', 14);
    await e.engine.syncNow('auto');
    expect(e.fake.saves).toHaveLength(1);
    expect(notices).toHaveLength(0);
  });

  it('nada que enviar → nada que avisar', async () => {
    await e.engine.syncNow('auto');
    expect(notices).toHaveLength(0);
  });

  it('una petición manual que llega mientras corre una automática no hereda el modo silencioso erróneo', async () => {
    addManga('b.1', 'Berserk', 14);
    const a = e.engine.syncNow('auto');
    const b = e.engine.syncNow('manual');
    await Promise.all([a, b]);
    expect(notices.length).toBeLessThanOrEqual(1);
  });
});

describe('huella del manga (para no sincronizar a cada página)', () => {
  it('cambia con el estado y los capítulos leídos, no con la página ni el historial', async () => {
    const e = await boot();
    const m = { id: 'a', sourceId: 'demo', title: 'A', description: '', coverUrl: '', status: 'ongoing' as const, tags: [], year: null, lastChapter: null };
    e.store.addToLibrary(m, 'reading');
    const s0 = e.engine.mangaSignature();
    e.store.recordOpen(m, { id: 'c1', chapter: '1' }, 0, 20);
    e.store.recordPage(m, 'c1', 7, 20);                                     // leer páginas: no cambia
    expect(e.engine.mangaSignature()).toBe(s0);
    e.store.setChapterRead(m, { id: 'c1', chapter: '1' }, true);            // terminar un capítulo: cambia
    const s1 = e.engine.mangaSignature();
    expect(s1).not.toBe(s0);
    e.store.setLibraryStatus(m, 'completed');                                // cambiar el estado: cambia
    expect(e.engine.mangaSignature()).not.toBe(s1);
  });
});

describe('primera sincronización: nada se escribe sin confirmar', () => {
  let e: Env;
  beforeEach(async () => {
    e = await boot(false);
    e.fake.addMedia({ id: 30002, type: 'MANGA', format: 'MANGA', title: { romaji: 'Berserk' } });
    e.fake.addMedia({ id: 1, type: 'ANIME', format: 'TV', title: { romaji: 'Frieren' }, episodes: 28 });
    e.fake.addMedia({ id: 2, type: 'ANIME', format: 'TV', title: { romaji: 'Bleach' }, episodes: 366 });
    e.fake.setEntry('ANIME', { mediaId: 2, status: 'COMPLETED', progress: 366, score: 80 });          // ya está en AniList
    await e.backend.upsertLibraryEntry({ mediaType: 'anime', mediaId: 1, status: 'CURRENT', progress: 3, score: 0, media: snap(1, 'Frieren') });
    const m = { id: 'b.1', sourceId: 'mangakatana', title: 'Berserk', description: '', coverUrl: '', status: 'ongoing' as const, tags: [], year: null, lastChapter: null };
    e.store.addToLibrary(m, 'reading'); e.store.applyExternalProgress(m, { progress: 14 });
  });

  it('solo prepara el resumen: no escribe en AniList ni en KageView', async () => {
    await e.engine.syncNow();
    expect(e.fake.saves).toHaveLength(0);
    expect(e.fake.lists.ANIME.has(1)).toBe(false);
    expect((await e.backend.listLibrary('anime')).map((x) => x.mediaId)).toEqual([1]);    // Bleach (solo en AniList) tampoco se trae aún
    const plan = e.state.getSync().plan!;
    expect(plan.items.map((i) => [i.kind, i.title, i.status, i.progress, i.isNew]).sort()).toEqual([
      ['anime', 'Frieren', 'CURRENT', 3, true],
      ['manga', 'Berserk', 'CURRENT', 14, true],
    ]);
    expect(e.state.getSync().confirmedViewerId).toBeNull();
    expect(e.state.getSync().lastSyncAt).toBeNull();
  });

  it('el envío rápido de un episodio tampoco escribe hasta que se confirma', async () => {
    expect(await e.engine.pushAnimeProgress(change({ mediaId: 1, progress: 4 }))).toBe('skipped');
    expect(e.fake.saves).toHaveLength(0);
  });

  it('confirmar envía lo revisado y trae lo de AniList; después todo es normal', async () => {
    await e.engine.syncNow();
    await e.engine.confirmPlan();
    expect(e.state.getSync().plan).toBeNull();
    expect(e.fake.lists.ANIME.get(1)).toMatchObject({ status: 'CURRENT', progress: 3 });
    expect(e.fake.lists.MANGA.get(30002)).toMatchObject({ status: 'CURRENT', progress: 14 });
    expect((await e.backend.listLibrary('anime')).map((x) => x.mediaId).sort()).toEqual([1, 2]);
    expect(e.engine.isConfirmed()).toBe(true);
    expect(await e.engine.pushAnimeProgress(change({ mediaId: 1, progress: 4 }))).toBe('pushed');
  });

  it('«Ahora no» cierra el aviso sin enviar nada y vuelve a preguntar al sincronizar', async () => {
    await e.engine.syncNow();
    e.engine.dismissPlan();
    expect(e.state.getSync().plan).toBeNull();
    expect(e.fake.saves).toHaveLength(0);
    expect(e.engine.isConfirmed()).toBe(false);
    await e.engine.syncNow();
    expect(e.state.getSync().plan?.items).toHaveLength(2);
    expect(e.fake.saves).toHaveLength(0);
  });

  it('si no hay nada que enviar no se pregunta: se confirma solo y se trae lo de AniList', async () => {
    const f = await boot(false);
    f.fake.addMedia({ id: 2, type: 'ANIME', format: 'TV', title: { romaji: 'Bleach' }, episodes: 366 });
    f.fake.setEntry('ANIME', { mediaId: 2, status: 'COMPLETED', progress: 366, score: 80 });
    await f.engine.syncNow();
    expect(f.state.getSync().plan).toBeNull();
    expect(f.engine.isConfirmed()).toBe(true);
    expect((await f.backend.listLibrary('anime')).map((x) => x.mediaId)).toEqual([2]);
  });

  it('con el anime omitido (sin sesión en KageView) no se da la cuenta por confirmada: al iniciar sesión se revisa', async () => {
    const f = await boot(false);
    f.useAppStore.getState().setAccount({ status: 'signedOut', user: null } as never);
    await f.engine.syncNow();                                             // nada que enviar: solo trae
    expect(f.engine.isConfirmed()).toBe(false);
    f.useAppStore.getState().setAccount({ status: 'signedIn', user: (await f.backend.getSession())! });
    f.fake.addMedia({ id: 1, type: 'ANIME', format: 'TV', title: { romaji: 'Frieren' }, episodes: 28 });
    await f.backend.upsertLibraryEntry({ mediaType: 'anime', mediaId: 1, status: 'CURRENT', progress: 3, score: 0, media: snap(1, 'Frieren') });
    await f.engine.syncNow();
    expect(f.fake.saves).toHaveLength(0);                                 // sigue sin escribir
    expect(f.state.getSync().plan?.items.map((i) => i.title)).toEqual(['Frieren']);
  });

  it('otra cuenta de AniList vuelve a pedir confirmación', async () => {
    await e.engine.syncNow();
    await e.engine.confirmPlan();
    e.fake.viewer = { id: 999, name: 'otra', avatar: { large: 'x' } };
    e.fake.lists.ANIME.clear(); e.fake.lists.MANGA.clear();
    await e.engine.syncNow();
    expect(e.engine.isConfirmed()).toBe(false);
    expect(e.state.getSync().plan?.items.length).toBeGreaterThan(0);
  });
});
